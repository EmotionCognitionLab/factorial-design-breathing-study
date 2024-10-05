import { dynamoDocClient as docClient } from '../common/aws-clients';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import Db from '../../../common/db/db.js';
import { statusTypes } from '../../../common/types/types.js';

const usersTable = process.env.USERS_TABLE;
const db = new Db({usersTable: usersTable});
db.docClient = docClient;

exports.handleEvent = async (event) => {
    if (event.headers['x-rc-tk'] !== process.env.RC_IN_TOKEN) {
        console.warn('RC endpoint called without appropriate authorization')
        return {
            statusCode: 401,
            body: "You do not have permission to access this information"
        };
    }

    const props = JSON.parse(event.body);
    if (!props.rcid) {
        console.error('No rcid parameter provided');
        return {
            statusCode: 400,
            body: "Missing required participant id parameter"
        }
    }
    
    if (Number.isNaN(Number.parseInt(props.rcid))) {
        console.error(`Non-numeric rcid value "${props.rcid}" provided.`);
        return {
            statusCode: 400,
            body: "Invalid participant id parameter"
        }
    }

    const userRecs = await docClient.send(new ScanCommand({
        TableName: usersTable,
        FilterExpression: 'rcid = :rcid',
        ExpressionAttributeValues: { ':rcid': props.rcid }
    }));
    if (userRecs.Items.length != 1) {
        console.error(`Expected one user with rcid ${props.rcid}, but found ${userRecs.Items.length}.`);
        return {
            statusCode: 500,
            body: "Server error"
        }
    }

    if (props.status !== 'Drop') {
        console.error(`Expected status value to be "Drop", but got "${props.status}" (rcid: ${props.rcid}).`);
        return {
            statusCode: 400,
            body: "Invalid participant status"
        }
    }

    const user = userRecs.Items[0];
    if (user.progress?.status !== statusTypes.DROPPED) {
        await db.updateUser(user.userId, {progress: {status: statusTypes.DROPPED}});
        console.log(`Set user ${user.userId} status to dropped.`);
    }

    return {
        statusCode: 200,
        body: "success"
    }
    
}
