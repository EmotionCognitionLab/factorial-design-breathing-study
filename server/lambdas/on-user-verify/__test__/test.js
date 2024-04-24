'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const { readFileSync } = require('fs');
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const postConfirmationEventJson = readFileSync(path.join(__dirname, 'post-confirmation-event.json'));
const postConfirmationEvent = JSON.parse(postConfirmationEventJson);

const verified = require('../verified.js');

async function getConfirmedUser() {
    const params = {
        TableName: process.env.USERS_TABLE,
        Key: {
            userId: postConfirmationEvent.request.userAttributes.sub
        }
    };
    return await docClient.send(new GetCommand(params));
}

const user = {
    userId: 'abc123',
    email: 'someone@example.com',
    name: 'Kim',
    phone_number: '012-345-6789',
    phone_number_verified: false,
    sub: 'abc123',
    condition: verified.validConditions[0]
};

async function putUser(user) {
    const params = {
        TableName: process.env.USERS_TABLE,
        Item: user
    };
    await docClient.send(new PutCommand(params));
}

describe("Testing with a valid post confirmation trigger event", () => {
    beforeEach(async () => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
    });

    test("should succeed", async() => {
        const result = await verified.handler(postConfirmationEvent);
        expect(result.response).toBeDefined();
        const userRec = await getConfirmedUser();
        for (const field in ['email', 'name', 'phone_number', 'sub']) {
            expect(userRec.Item[field]).toBe(postConfirmationEvent.request.userAttributes[field]);
        }
        const now = new Date().toISOString().substring(0, 18)
        expect(userRec.Item.createdAt.substring(0, 18)).toBe(now);
        expect(userRec.Item.phone_number_verified).toBeFalsy();
        expect(verified.validConditions).toContain(userRec.Item.condition);
    });

    test("should do nothing if the trigger is not for a signup", async() => {
        const changePwTriggerEvent = JSON.parse(postConfirmationEventJson);
        changePwTriggerEvent.triggerSource = 'PostConfirmation_ConfirmForgotPassword';
        await verified.handler(changePwTriggerEvent);
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: changePwTriggerEvent.request.userAttributes.sub
            }
        };
        const userRec = await docClient.send(new GetCommand(params));
        expect(userRec.Item).not.toBeDefined();
    });

    test("should set phone_number_verified to true if the user exists and phone_number_verified is false in dynamo", async () => {
        await putUser(user);
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: user.userId
            }
        };
        const userRes = (await docClient.send(new GetCommand(params))).Item;
        expect(userRes.phone_number_verified).toBe(false);

        const phoneVerifiedEvent = JSON.parse(postConfirmationEventJson);
        phoneVerifiedEvent.request.userAttributes.sub = user.sub;
        phoneVerifiedEvent.request.userAttributes.phone_number_verified = 'true';
        const result = await verified.handler(phoneVerifiedEvent);
        expect(result.response).toBeDefined();
        const updatedUserRes = await docClient.send(new GetCommand(params));
        expect(updatedUserRes.Item.phone_number_verified).toBe(true);
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

function buildUserVerificationEvent(userId) {
    const event = JSON.parse(postConfirmationEventJson);
    event.request.userAttributes.sub = userId;
    return event;
}

describe("assignment to condition", () => {
    const numUsers = 63;

    beforeEach(async() => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
        
        for (let i = 0; i<numUsers; i++) {
            const params = {
                TableName: process.env.USERS_TABLE,
                Item: {userId: i.toString(), condition: i}
            };
            await docClient.send(new PutCommand(params));
        }
    });

    test("should choose from among the conditions with the lowest number of participants", async() => {
        const newUserId = 'testUser';
        const result = await verified.handler(buildUserVerificationEvent(newUserId));
        expect(result.response).toBeDefined();

        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: newUserId
            }
        };
        const userRes = (await docClient.send(new GetCommand(params))).Item;
        expect(userRes.condition).toBe(numUsers);
    });

    test("should ignore the conditions of dropped users when determining conditions with the lowest number of participants", async() => {
        const droppedUserId = '31';
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {'userId': droppedUserId},
            UpdateExpression: 'set progress = :progress',
            ExpressionAttributeValues: {':progress': {dropped: '2023-01-07T19:42:28.092Z'}}
        };
        await docClient.send(new UpdateCommand(params));

        const newUserId = 'testUser';
        const result = await verified.handler(buildUserVerificationEvent(newUserId));
        expect(result.response).toBeDefined();

        const getParams = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: newUserId
            }
        };
        const userRes = (await docClient.send(new GetCommand(getParams))).Item;
        // it should choose between the condition of the dropped user and the one unassigned condition
        expect(userRes.condition == Number.parseInt(droppedUserId) || userRes.condition == numUsers).toBe(true);
    });

    test("should handle the case where some conditions have two, some one and some zero participants", async() => {
        const testUserId = '30';
        const params = {
            TableName: process.env.USERS_TABLE,
            Key: {'userId': testUserId},
            UpdateExpression: 'set #condition = :condition',
            ExpressionAttributeNames: {'#condition': 'condition'},
            ExpressionAttributeValues: {':condition': 31}
        };
        await docClient.send(new UpdateCommand(params));

        const newUserId = 'newUser';
        const result = await verified.handler(buildUserVerificationEvent(newUserId));
        expect(result.response).toBeDefined();

        const getParams = {
            TableName: process.env.USERS_TABLE,
            Key: {
                userId: newUserId
            }
        };
        const userRes = (await docClient.send(new GetCommand(getParams))).Item;
        // it should choose between the two conditions that don't exist: The one from the test user and the one unassigned condition
        expect(userRes.condition == Number.parseInt(testUserId) || userRes.condition == numUsers).toBe(true);
    });

    afterEach(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});


