import { UpdateCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const usersTable = process.env.USERS_TABLE;
const sessionsTable = process.env.SESSIONS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;
import Db from '../../../common/db/db.js';


exports.handler = async (event) => {
    const path = event.requestContext.http.path;
    const method = event.requestContext.http.method;
    if (path === "/self") {
        if (method === "GET") {
            return getSelf(event.requestContext.authorizer.jwt.claims.sub);
        }
        if (method === "PUT") {
            return updateSelf(event.requestContext.authorizer.jwt.claims.sub, JSON.parse(event.body));
        }
        // TODO
        // FOR TESTING ONLY - remove this before going to production
        if (method === "DELETE") {
            return deleteAll(event.requestContext.authorizer.jwt.claims.sub);
        }
    }
    if (path.startsWith("/self/earnings") && method === "GET") {
        const earningsType = event.pathParameters.earningsType;
        return getEarnings(event.requestContext.authorizer.jwt.claims.sub, earningsType);
    }
    
    return errorResponse({statusCode: 400, message: `Unknown operation "${method} ${path}"`});
}

const getSelf = async (userId) => {
    try {
        const db = new Db({usersTable: usersTable});
        db.docClient = docClient;
        return await db.getUser(userId);
    //    return await getUserById(userId);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const updateSelf = async(userId, updates) => {
    try {
        if (!updates) {
            return errorResponse({statusCode: 400, message: "No updates found"});
        }

        const notModifiable = ['userId', 'createdAt', 'email', 'phone_number'];
        const allowedKeys = Object.keys(updates).filter(k => !notModifiable.includes(k));
        if (allowedKeys.length === 0) {
            return errorResponse({statusCode: 400, message: "No updates for allowed fields found"});
        }

        const expressionAttrVals = {};
        const expressionAttrNames = {};
        let updateExpression = 'set';
        for (const prop of allowedKeys) {
            const propName = `#${prop}`;
            const propVal = `:${prop}`
            expressionAttrNames[propName] = prop;
            expressionAttrVals[propVal] = updates[prop];
            updateExpression += ` ${propName} = ${propVal},`
        }
        updateExpression = updateExpression.slice(0, updateExpression.length - 1); // trim trailing comma
        const params = {
            TableName: usersTable,
            Key: { userId: userId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttrNames,
            ExpressionAttributeValues: expressionAttrVals
        };
        await docClient.send(new UpdateCommand(params));
        return successResponse({msg: "update successful"});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

const getEarnings = async (userId, earningsType = null) => {
    try {
        const db = new Db();
        db.docClient = docClient;
        return await db.earningsForUser(userId, earningsType);
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

 // TODO
// FOR TESTING ONLY - remove this before going to production
const deleteAll = async (userId) => {
    try {
        const tableDetails = [
            {name: sessionsTable, sortKey: 'startDateTime'}, 
            {name: earningsTable, sortKey: 'typeDate'}
        ];
    
        const params = {
            FilterExpression: "userId = :uid",
            ExpressionAttributeValues: { ":uid": userId },
        };
    
        for (const {name, sortKey} of tableDetails) {
            params['TableName'] = name;
            params['ProjectionExpression'] = sortKey;
            const cmd = new ScanCommand(params);
            const resp = await docClient.send(cmd); // ignoring LastEvaluatedKey here; we don't expect enough rows in testing
            for (let i=0; i<resp.Items.length; i+=25) {
                const delReqs = [];
                const maxReqs = Math.min(25, resp.Items.length - (i * 25));
                for (let j=0; j<maxReqs; j++) {
                    const delReqParams = { DeleteRequest: {Key: { userId: userId }}};
                    delReqParams['DeleteRequest']['Key'][sortKey] = resp.Items[j + (i * 25)][sortKey];
                    delReqs.push(delReqParams);
                }
                const batchDelParam = { RequestItems: {} };
                batchDelParam['RequestItems'][name] = delReqs;
                const batchDelCmd = new BatchWriteCommand(batchDelParam);
                const delResp = await docClient.send(batchDelCmd);
                console.log(`unprocessed items still to be deleted from ${name}`, JSON.stringify(delResp.UnprocessedItems))
            }
        }
        return successResponse({msg: "deletion successful"});
    } catch (err) {
        console.error(err);
        if (!(err instanceof HttpError)) {
            err = new HttpError(err.message);
        }
        return errorResponse(err);
    }
}

function successResponse(data) {
    return {
        "statusCode": 200,
        "body": JSON.stringify(data)
    }
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

class HttpError extends Error {
    constructor(message, statusCode=500) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
    }
}

