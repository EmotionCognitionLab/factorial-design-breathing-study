'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
const lambdaLocal = require("lambda-local");
// const dayjs = require('dayjs');
// const utc = require('dayjs/plugin/utc');
// const timezone = require('dayjs/plugin/timezone');
// const customParseFormat = require('dayjs/plugin/customParseFormat');
// dayjs.extend(utc);
// dayjs.extend(timezone);
// dayjs.extend(customParseFormat);
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);

const conditions = require('../api.js').validConditions;

const user = {
    userId: 'abc123',
    email: 'someone@example.com',
    name: 'Kim',
    phone_number: '012-345-6789',
    sub: 'abc123'
};

describe("API call for user", () => {

    beforeAll(async () => {
        await th.dynamo.createTable(process.env.USERS_TABLE, 
            [{AttributeName: 'userId', KeyType: 'HASH'}], 
            [{AttributeName: 'userId', AttributeType: 'S'}]
        );
        const params = {
            TableName: process.env.USERS_TABLE,
            Item: user
        };
        await docClient.send(new PutCommand(params));
    });

    test("GET should succeed", async() => {
        const result = await runLambda('/self', 'GET', {requestContext: {authorizer: {jwt: {claims: {sub: user.userId}}}}});
        for (const field in ['email', 'name', 'phone_number', 'sub']) {
            expect(result[field]).toBe(user[field]);
        }
    });

    test("PUT should succeed", async() => {
        const update = {name: 'Tom'};
        const updateJson = JSON.stringify(update);
        const result = await runLambda('/self', 'PUT', {
            body: updateJson,
            requestContext: {authorizer: {jwt: {claims: {sub: user.userId}}}}
        });
        expect(result.statusCode).toBe(200);
        const userRec = await fetchUser(user.userId);
        expect(userRec.name).toBe(update.name);
    });

    afterAll(async () => {
        await th.dynamo.deleteTable(process.env.USERS_TABLE);
    });
});

async function fetchUser(userId) {
    const params = {
        TableName: process.env.USERS_TABLE,
        Key: {
            userId: userId
        }
    };
    const userRec = await docClient.send(new GetCommand(params));
    return userRec.Item;
}

async function runLambda(httpPath, method, event) {
    Object.assign(event.requestContext,{ http: { path: httpPath, method: method } });
    return await lambdaLocal.execute({
        event: event,
        lambdaPath: path.join(__dirname, '../api.js'),
        lambdaHandler: 'handler',
        environment: {USERS_TABLE: process.env.USERS_TABLE},
        verboseLevel: 0
    });
}