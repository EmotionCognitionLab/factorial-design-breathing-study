/**
 * API for reading from and writing to the LipBelly DynamoDB database.
 */

 import awsSettings from '../aws-settings.json';
 import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
 import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
 import { Logger } from "logger";
 import { getAuth } from "../auth/auth.js";
 import { earningsTypes, earningsAmounts } from "../types/types.js";
 
 
 'use strict';

export default class Db {
     constructor(options = {}) {
        this.region = options.region || awsSettings.AWSRegion;
        this.identityPoolId = options.identityPoolId || awsSettings.IdentityPoolId;
        this.userPoolId = options.userPoolId || awsSettings.UserPoolId;
        this.earningsTable = options.earningsTable || awsSettings.EarningsTable;
        this.usersTable = options.usersTable || awsSettings.UsersTable;
        this.segmentsTable = options.segmentsTable || awsSettings.SegmentsTable;
        this.session = options.session || null;
        if (!options.session) {
            const dynClient = new DynamoDBClient({region: this.region});
            this.docClient = DynamoDBDocumentClient.from(dynClient);
        }
        this.logger = new Logger(false);
        this.logger.init(); // TODO figure out how we can await this
        this.isRefreshing = false; // credential/session refreshing flag
     }

     /**
      * Creates the dynamodb docclient using credentials built from the session.
      * Also sets this.subId to the subscriber id in the session.
      */
     set session(sess) {
         if (!sess) return;

        this.idToken = sess.getIdToken().getJwtToken();
        this.credentials = fromCognitoIdentityPool({
            identityPoolId: this.identityPoolId,
            logins: {
                [`cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`]: this.idToken
            },
            clientConfig: {region: this.region}
        });
        const dynClient = new DynamoDBClient({region: this.region,  credentials: this.credentials});
        this.docClient = DynamoDBDocumentClient.from(dynClient);
        this.subId = this.constructor.getSubIdFromSession(sess);
     }

    async getAllUsers() {
        try {
            const params = {
                TableName: this.usersTable
            };
            const dynResults = await this.scan(params);
            return dynResults.Items;
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    async getInProgressUsers() {
        try {
            const params = {
                TableName: this.usersTable,
                FilterExpression: `attribute_not_exists(progress) or ( attribute_exists(progress) and 
                (attribute_not_exists(progress.dropped) or progress.dropped = :null) and
                (attribute_not_exists(progress.stage3Complete) or progress.stage3Complete = :null) )
                `,
                ExpressionAttributeValues: {':null': null}
            };
            const dynResults = await this.scan(params);
            return dynResults.Items;
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    /**
     * 
     * @param {string} visit2ScheduledDate A YYYY-MM-DD string indicating the visit 2 scheduled date
     * @returns 
     */
    async getUsersWithVisit2ScheduledOn(visit2ScheduledDate) {
        try {
            const params = {
                TableName: this.usersTable,
                FilterExpression: `attribute_exists(progress.visit2Scheduled) and
                begins_with(progress.visit2Scheduled, :visit2Date)`,
                ExpressionAttributeValues: { ':visit2Date': visit2ScheduledDate }
            };
            const dynResults = await this.scan(params);
            return dynResults.Items;
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    async segmentsForUser(userId, stage=null, startDate = new Date(0), endDate = new Date(1000 * 60 * 60 * 24 * 365 * 1000)) {
        const startDateEpoch = Math.floor(startDate.getTime() / 1000);
        const endDateEpoch = Math.floor(endDate.getTime() / 1000);
        try {
            const params = {
                TableName: this.segmentsTable,
                KeyConditionExpression: 'userId = :uId and endDateTime between :st and :et',
                ExpressionAttributeValues: { ':uId': userId, ':st': startDateEpoch, ':et': endDateEpoch }
            };

            if (stage !== null) {
                params['FilterExpression'] = 'stage = :stage';
                params['ExpressionAttributeValues'][':stage'] = stage;
            }

            const results = await this.query(params);
            return results.Items;
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }
    
    async earningsForUser(userId, type = null) {
        try {
            const params =  {
                TableName: this.earningsTable,
                KeyConditionExpression: 'userId = :uid',
                ExpressionAttributeValues: {
                    ':uid': userId,
                }
            };
            if (type) {
                params.KeyConditionExpression += ' and begins_with(typeDate, :td)';
                params.ExpressionAttributeValues[':td'] = type;
            }

            const results = await this.query(params);
            return results.Items.map(i => {
                const parts = i.typeDate.split('|');
                if (parts.length !== 2) {
                    throw new Error(`Unexpected typeDate value: ${i.typeDate}. Expected two parts, but found ${parts.length}.`);
                }
                const type = parts[0];
                const date = parts[1];
                return {
                    userId: i.userId,
                    type: type,
                    date: date,
                    amount: i.amount
                };
            });
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    async saveEarnings(userId, earningsType, date) {
        let amount;
        switch(earningsType) {
            case earningsTypes.BREATH1:
            case earningsTypes.BREATH2:
            case earningsTypes.STREAK_BONUS1:
            case earningsTypes.STREAK_BONUS2:
                amount = earningsAmounts[earningsType]
                break;
            default:
                throw new Error(`Unrecognized earnings type ${earningsType}.`);
        }
        try {
            const params = {
                TableName: this.earningsTable,
                Key: {
                    userId: userId,
                    typeDate: `${earningsType}|${date}`
                },
                UpdateExpression: `set amount = :amount`,
                ExpressionAttributeValues: { ':amount': amount }
            };
            await this.update(params);
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    async updateUser(userId, updates) {
        const disallowedAttrs = ['userId', 'createdAt', 'email', 'name', 'phone_number', 'phone_number_verified'];
        const expressionAttrVals = {};
        const expressionAttrNames = {};
        let updateExpression = 'set';
        for (const prop in updates) {
            if (!disallowedAttrs.includes(prop) ) {
                const propName = `#${prop}`;
                const propVal = `:${prop}`
                expressionAttrNames[propName] = prop;
                expressionAttrVals[propVal] = updates[prop];
                updateExpression += ` ${propName} = ${propVal},`
            }
        }
        updateExpression = updateExpression.slice(0, -1); // drop the trailing comma
        if (Object.keys(expressionAttrVals).length < 1) {
            throw new Error("You must provide an update to at least one allowed attribute.");
        }
        try {
            const params = {
                TableName: this.usersTable,
                Key: { userId: userId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionAttrNames,
                ExpressionAttributeValues: expressionAttrVals
            };
            const dynResults = await this.update(params);
            return dynResults.Items;
        } catch (err) {
            this.logger.error(err);
            throw err;
        }
    }

    async getUser(userId, consistentRead=false) {
        const params = {
            TableName: this.usersTable,
            KeyConditionExpression: "userId = :idKey",
            ExpressionAttributeValues: { ":idKey": userId },
            ConsistentRead: consistentRead
        };
        const dynResults = await this.query(params);
        if (dynResults.Items.length === 0) {
            return {};
        }
        if (dynResults.Items.length > 1) {
            throw new Error(`Found multiple users with userId ${userId}.`);
        }
        return dynResults.Items[0];
    }

    async getUserByEmail(email) {
        const params = {
            TableName: this.usersTable,
            FilterExpression: "email = :email",
            ExpressionAttributeValues: { ":email": email }
        };
        const dynResults = await this.scan(params);
        if (dynResults.Items.length === 0) {
            return {};
        }
        if (dynResults.Items.length > 1) {
            throw new Error(`Found multiple users with email ${email}.`);
        }
        return dynResults.Items[0];
    }

    async getValidCreds(identityId=null) {
        // credentials override passed-in identity
        let identId = this.credentials ? this.credentials.identityId : identityId;
        if (!identId) {
            await this.refreshPermissions();
            identId = this.credentials ? this.credentials.identityId : identityId;
        }
        return identId;
    }

    async dynamoOp(params, fnName) {
        let curTry = 0;
        const maxTries = 3;
        let sleepTime = 200;
        while (curTry < maxTries) {
            try {
                if (this.isRefreshing) {
                    await new Promise(resolve => setTimeout(resolve, 1500)); // sleep to let the refresh happen
                }
                switch(fnName) {
                    case 'query':
                        return await this.docClient.send(new QueryCommand(params));
                    case 'scan':
                        return await this.docClient.send(new ScanCommand(params));
                    case 'update':
                        return await this.docClient.send(new UpdateCommand(params));
                    case 'batchWrite': 
                        return await this.docClient.send(new BatchWriteCommand(params));
                    default:
                        throw new Error(`Unknown operation ${fnName}`);
                }
            } catch (err) {
                curTry++;
                if (err.code === 'ValidationException' ) {
                    this.logger.error(err);
                }
                if (err.code === 'CredentialsError' || err.code === 'ValidationException') { // ValidationException is usually a sign that this.credentials.identityId is empty
                    await this.refreshPermissions();
                } else {
                    this.logger.error(err);
                }
                // sleep before retrying
                await new Promise(resolve => setTimeout(resolve, sleepTime * curTry));
            }
        }
        this.logger.error(`Max tries exceeded. Dynamo op: ${fnName}. Parameters: ${JSON.stringify(params)}`);
    }

    async query(params) {
        return this.dynamoOp(params, 'query');
    }

    async scan(params) {
        return this.dynamoOp(params, 'scan');
    }

    async update(params) {
        return this.dynamoOp(params, 'update');
    }

    async batchWrite(params) {
        return this.dynamoOp(params, 'batchWrite');
    }

    refreshSession() {
        return new Promise((resolve, reject) => {
            const auth = getAuth(session => resolve(session), err => reject(err));
            auth.getSession();
        });
    }

    async refreshPermissions() {
        if (this.isRefreshing) {
            this.logger.log('refreshPermissions called while refresh is already in progress; skipping');
            return;
        }

        try {
            this.isRefreshing = true;
            try {
                await this.credentials.refresh();
            } catch (refreshErr) {
                if (refreshErr.code === 'NotAuthorizedException') {
                    this.session = await this.refreshSession();
                } else {
                    this.logger.error("Unexpected error refreshing credentials", refreshErr);
                }
            }
        } catch (err) {
            this.logger.error("Error trying to refresh permissions", err);
        } finally {
            this.isRefreshing = false;
        }
    }
}

Db.getSubIdFromSession = (session) => {
    const idToken = session.getIdToken().getJwtToken();
    const payload = idToken.split('.')[1];
    const tokenobj = JSON.parse(atob(payload));
    return tokenobj['sub'];
}
