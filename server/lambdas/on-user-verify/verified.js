'use strict';

/**
 * Called by Cognito when a user verifies her account. Writes the 
 * user information from Cognito to Dynamo if it doesn't already exist.
 **/

const usersTable = process.env.USERS_TABLE;
import { dynamoDocClient as docClient } from '../common/aws-clients';
import { PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import Db from '../../../common/db/db.js';
const db = new Db({usersTable: usersTable});
db.docClient = docClient;

exports.handler = async (event) => {
    // make sure that we don't run this code when the user is 
    // going through the forgot password flow
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

    const userId = event.request.userAttributes["sub"];
    const user = await db.getUser(userId);
    if (user.userId) {
        if (!user.phone_number_verified && event.request.userAttributes["phone_number_verified"] === 'true') {
            await setPhoneNumberVerified(userId);
        }
        return event;
    }

    await writeUserToDynamo(event);
    return event;
};

async function setPhoneNumberVerified(userId) {
    const params = {
        TableName: usersTable,
        Key: {'userId': userId},
        UpdateExpression: 'set phone_number_verified = :true',
        ExpressionAttributeValues: {':true': true}
    };
    try {
        await docClient.send(new UpdateCommand(params));
    } catch (err) {
        console.log(err);
        throw new Error('Something went wrong. Please try again later.')  // NB this will be seen by the user
    }
}

async function writeUserToDynamo(event) {
    try {
        const userRec = await buildUserRecord(event);
        await docClient.send(new PutCommand(userRec));
    } catch (err) {
        console.log(err);
        throw new Error('Something went wrong. Please try again later.') // NB this will be seen by the user
    }
}

async function buildUserRecord(event) {
    const result = {
        TableName: usersTable,
        Item: {
            userId: event.request.userAttributes["sub"],
            name: event.request.userAttributes["name"],
            email: event.request.userAttributes["email"],
            phone_number: event.request.userAttributes["phone_number"],
            phone_number_verified: event.request.userAttributes["phone_number_verified"] === 'true',
            createdAt: new Date().toISOString()
        }
    };
    const conditionData = await getConditionForUser();
    result.Item["condition"] = conditionData;
    return result;
}


// The possible conditions a user can be assigned to
// exported for testing
const conditionCount = 64;
export const validConditions = [...Array(conditionCount).keys()]

/**
 * Assignment to condition uses a blocked assignment algorithm with a block size
 * of 64. With so many conditions, dropped participants are a problem - if we have
 * 130 participants and three drop we don't want to have to sign up a bunch more
 * just waiting to randomly get the one condition where we're short a subject.
 * (We need to have >=2 subjects/condition.)
 * 
 * To deal with this we assign to condition as follows: Select the condition of all of the
 * non-dropped participants. Find the condition(s) with the minimum number of
 * participants. In the first block, for example, we will initially have many
 * conditions with zero participants, and all of those conditions are eligible
 * to be assigned to a participant. Once we get to the second block we will 
 * mostly have conditions with 1 participant and some with 2. The conditions with
 * 1 will all be eligible for assignment. (We might even have a condition with zero 
 * participants, if someone was dropped and only one participant had been assigned
 * to that condition so far. In that case only the condition(s) with zero participants
 * would be eligible.)
 *
 * Note that this can fail if many users are being assigned to condition very rapidly
 * - it's possible that while the criteria for assignment are being evaluated by one
 * lambda instance another is assigning someone, resulting in an error in the blocked
 * randomization scheme. We do not expect this kind of load.
 * @returns {object} Condition object with 'assigned' and 'assignedDate' fields
 */
async function getConditionForUser() {
    const userConditions = await getActiveUserConditions();
    // each index in this array represents a condition
    // the values are the number of participants in that condition
    const condCounts = Array(conditionCount).fill(0);
    userConditions.forEach(cond => {
        condCounts[cond] += 1
    });

    // across all conditions, what is the lowest number of participants?
    const minCondCount = Math.min(...condCounts);

    // find all of the conditions that have the minCondCount
    const availableConds = [];
    condCounts.forEach((val, idx) => {
        if (val == minCondCount) availableConds.push(idx)
    });

    // pick at random from all of the conditions that have the minCoundCount
    return availableConds[Math.floor(Math.random() * availableConds.length)];
}

/**
 * Does a full table scan. Use sparingly.
 */
async function getActiveUserConditions() {
    let ExclusiveStartKey, dynResults
    const allResults = [];
    do {
        const params = {
            TableName: usersTable,
            ExclusiveStartKey,
            ProjectionExpression: "#condition",
            FilterExpression: `attribute_exists(#condition) and
            attribute_not_exists(progress) or ( attribute_exists(progress) and 
            (attribute_not_exists(progress.dropped) or progress.dropped = :null))`,
            ExpressionAttributeNames: {'#condition': 'condition'},
            ExpressionAttributeValues: {':null': null},
            ConsistentRead: true
        }
        dynResults = await docClient.send(new ScanCommand(params));
        ExclusiveStartKey = dynResults.LastEvaluatedKey
        allResults.push(...dynResults.Items);
    } while (dynResults.LastEvaluatedKey)

    return allResults.map(r => r.condition);
}
