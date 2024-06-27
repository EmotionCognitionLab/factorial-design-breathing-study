import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import Db from 'db/db.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

const region = process.env.REGION;
const dynamoEndpoint = process.env.DYNAMO_ENDPOINT;

const noAccess = {
    statusCode: 401,
    body: "You do not have permission to access this information"
};

exports.handler = async(event) => {
    const userRole = event.requestContext.authorizer.jwt.claims['cognito:preferred_role'];
    if (!userRole) return noAccess;

    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    const credentials = await credentialsForRole(userRole);
    const db = dbWithCredentials(credentials);

    if (path === "/admin/participants/all") {
        return await db.getAllUsers();
    }

    if (path === "/admin/participants/active") {
        return await db.getActiveUsers();
    }

    if (path.startsWith("/admin/participant/")) {
        const participantId = event.pathParameters.id;
        if (method === "PUT") {
            const properties = JSON.parse(event.body);
            return await db.updateUser(participantId, properties);
        }
        
        if (method === "GET") {
            if (path.startsWith(`/admin/participant/${participantId}/earnings`)) {
                const earningsType = event.pathParameters.earningsType;
                return await db.earningsForUser(participantId, earningsType);
            }

            if (path === `/admin/participant/${participantId}/status`) {
                return await getUserStatus(participantId, db);
            }

            if (path === `/admin/participant/${participantId}`){
                const consistentRead = event.queryStringParameters && event.queryStringParameters.consistentRead === 'true';
                return await db.getUser(participantId, consistentRead);
            }
        }
            
        return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
    }

    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

/**
 * Returns object with fields recentMinutes (total training minutes in last three days), recentSessionCount (total completed sessions in last three days), latestCompleteSession (data of most recent completed session).
 * @param {string} participantId 
 * @param {*} db 
 * @returns {{recentMinutes: number, recentSessionCount: number, latestCompleteSession: string}}
 */
async function getUserStatus(participantId, db) {
    const sessions = await db.sessionsForUser(participantId);
    const today = dayjs().tz('America/Los_Angeles');
    // status is based on past three days, starting yesterday
    const statusStart = today.subtract(4, 'days').startOf('day');
    const statusEnd = today.subtract(1, 'days').endOf('day');
    
    const recentSessions = sessions.filter(s => s.startDateTime >= statusStart.unix() && s.startDateTime <= statusEnd.unix())
    let totalMinutes = 0;
    let completeSessionCount = 0;
    for (const s of recentSessions) {
        totalMinutes += Math.round(s.durationSeconds / 60);
        if (s.isComplete) completeSessionCount += 1;
    }
    // sessions should already be sorted in ascending order by startDateTime
    const latestCompleteSession = sessions.findLast(s => s.isComplete);
    let latestCompleteSessionDate = 'N/A';
    if (latestCompleteSession) {
        latestCompleteSessionDate = dayjs.unix(latestCompleteSession.startDateTime).tz('America/Los_Angeles').format('MM/DD/YYYY');
    }
    return { recentMinutes: totalMinutes, recentSessionCount: completeSessionCount, latestCompleteSession: latestCompleteSessionDate };
}

async function credentialsForRole(roleArn) {
    const assumeRoleCmd = new AssumeRoleCommand({RoleArn: roleArn, RoleSessionName: "lambdaCognitoUser"});
    const stsClient = new STSClient({ region: region });
    const roleData = await stsClient.send(assumeRoleCmd);
    return {
        accessKeyId: roleData.Credentials.AccessKeyId,
        secretAccessKey: roleData.Credentials.SecretAccessKey,
        sessionToken: roleData.Credentials.SessionToken
    };
}

function dbWithCredentials(credentials) {
    const dynClient = new DynamoDBClient({region: region, endpoint: dynamoEndpoint, apiVersion: "2012-08-10", credentials: credentials});
    const docClient = DynamoDBDocumentClient.from(dynClient);

    const db = new Db();
    db.docClient = docClient;
    db.credentials = credentials;
    return db;
}

function errorResponse(err) {
    const resp = {
        "body": JSON.stringify(err.message)
    } 

    if (err.statusCode) {
        resp["statusCode"] = err.statusCode;
    }

    if (err.code) {
        resp["headers"]["x-amzn-ErrorType"] = err.code;
        resp["body"] = `${err.code}: ${JSON.stringify(err.message)}`;
    }

    return resp;
}