'use strict';

const usersTable = process.env.USERS_TABLE;
const region = process.env.REGION;
import { dynamoDocClient as docClient } from '../common/aws-clients';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
const sesEndpoint = process.env.SES_ENDPOINT;
const emailSender = process.env.EMAIL_SENDER;
const emailRecipients = process.env.EMAIL_RECIPIENTS;
const ses = new SESClient({endpoint: sesEndpoint, apiVersion: '2010-12-01', region: region});

export async function handler (event) {
    const userInfo = await getUserConditionsAndStatus();
    const userInfoCSV = toCSV(['userId', 'rcid', 'condition', 'status'], userInfo);
    const condCounts = conditionCounts(userInfo);
    const condCountsLines = []
    for (let i = 0; i  < condCounts.length; i++) {
        condCountsLines.push(`${i},${condCounts[i]}`);
    }
    const condCountsCSV = 'condition,count\n' + condCountsLines.join('\n');
    await sendEmail(emailRecipients, 'The condition reports for the factorial study are attached.', userInfoCSV, condCountsCSV);
}

function conditionCounts(userConditions) {
    const undroppedConds = userConditions.filter(u => u.status !== 'Dropped').map(u => u.condition);
    const condCounts = Array(64).fill(0); // there are 64 possible conditions
    undroppedConds.forEach(cond => {
        condCounts[cond] += 1
    });
    return condCounts;
}

function toCSV(fields, data) {
    const headerLine = fields.join(',');
    const csvData = data.map(d => {
        return fields.map(f => d[f]).join(",");
    });
    return headerLine + '\n' + csvData.join('\n');
}

/**
 * Does a full table scan. Use sparingly.
 */
async function getUserConditionsAndStatus() {
    let ExclusiveStartKey, dynResults
    const allResults = [];
    do {
        const params = {
            TableName: usersTable,
            ExclusiveStartKey,
            ProjectionExpression: "userId, rcid, #condition, progress",
            ExpressionAttributeNames: {'#condition': 'condition'},
            ConsistentRead: true
        }
        dynResults = await docClient.send(new ScanCommand(params));
        ExclusiveStartKey = dynResults.LastEvaluatedKey
        allResults.push(...dynResults.Items);
    } while (dynResults.LastEvaluatedKey)

    return allResults.map(r => ({userId: r.userId, rcid: r.rcid, condition: r.condition, status: r.progress?.status}));
}

/**
 * Sends email message msg to a single recipient
 * @param {string} recip Email address of the recipient
 * @param {object} msg msg object with html, text, subject fields
 */
async function sendEmail(recip, msg, usersCSV, conditionCountsCSV) {
    let email = `From: ${emailSender}\n`;
    email += `To: ${recip}\n`,
    email += "Subject: User condition reports\n";
    email += "MIME-Version: 1.0\n"
    email += "Content-Type: multipart/mixed; boundary=\"aPart\"\n\n"
    email += "--aPart\n"
    email += "Content-Type: text/plain\n\n"
    email += msg + "\n\n"
    email += "--aPart\n"
    email += "Content-Type: application/octect-stream; name=\"users-with-status-and-condition.csv\"\n";
    email += "Content-Transfer-Encoding: base64\n";
    email += "Content-Disposition: attachment\n\n";
    email += Buffer.from(usersCSV, 'utf-8').toString("base64").replace(/([^\0]{76})/g, "$1\n") + "\n\n";
    email += "--aPart\n"
    email += "Content-Type: application/octect-stream; name=\"condition-counts.csv\"\n";
    email += "Content-Transfer-Encoding: base64\n";
    email += "Content-Disposition: attachment\n\n";
    email += Buffer.from(conditionCountsCSV, 'utf-8').toString("base64").replace(/([^\0]{76})/g, "$1\n") + "\n\n";
    email += "--aPart--";
    
    const params = {
        RawMessage: {
            Data: email
        },
        Source: emailSender
    }
    try {
        await ses.send(new SendRawEmailCommand(params));
    } catch (err) {
        console.error(`Error sending email to ${recip}. (Message: ${msg.text})`, err);
    }
}