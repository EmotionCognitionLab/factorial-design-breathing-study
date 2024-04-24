"use strict";

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { s3Client as s3 , dynamoDocClient as docClient } from '../common/aws-clients';
import { totalStage3Segments } from '../../../common/types/types.js';
import Db from 'db/db.js';
import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'fs/promises';
const path = require('path');

const sessionsTable = process.env.SESSIONS_TABLE;

export async function savesessions(event) {
    const record = event.Records[0];
    // Retrieve the database
    const getObjCmdInput = {
        Bucket: record.s3.bucket.name,
        Key: decodeURIComponent(record.s3.object.key),
    };
    const getObjCmd = new GetObjectCommand(getObjCmdInput);
    let tmpDir;
    let db;
  
    try {
        // retrieve sqlite file from s3
        tmpDir = await mkdtemp('/tmp/');
        const dbPath = path.join(tmpDir, 'temp.sqlite');
        const data = await s3.send(getObjCmd);
        await writeFile(dbPath, data.Body);

        // check to see which segments we need from it
        const userId = getObjCmdInput.Key.split('/')[0];
        const lastUploadTime = await lastUploadedSegmentTime(userId, false);

        // get those segments from the sqlite db
        db = new Database(dbPath);
        const stmt = db.prepare('select * from segments where end_date_time > ?;');
        const res = stmt.all(lastUploadTime);

        // write them to the segments table in dynamoDb
        await writeSegments(userId, res, false);

        // repeat for rest segments
        const lastRestUploadTime = await lastUploadedSegmentTime(userId, true);

        // get those segments from the sqlite db
        const restStmt = db.prepare('select * from rest_segments where end_date_time > ?;');
        const restRes = restStmt.all(lastRestUploadTime);

        // write them to the segments table in dynamoDb
        await writeSegments(userId, restRes, true);

        // check to see if they have completed stage 3
        const stage3Stmt = db.prepare('select count(*) from segments where stage = 3;');
        const stage3Res = stage3Stmt.get()["count(*)"];
        if (stage3Res >= totalStage3Segments) {
            const dynamoDb = new Db();
            dynamoDb.docClient = docClient;
            await dynamoDb.updateUser(userId, {progress: 'stage3Complete'});
        }

        return {status: "success"};
    } catch (err) {
        console.error(`Error trying to process sqlite db (s3 key: ${getObjCmdInput.Key}).`)
        console.error(err, err.stack);
        return {status: "error", message: err.message}
    } finally {
        try {
            if (db) {
                db.close();
            }
            if (tmpDir) {
                await rm(tmpDir, { recursive: true });
            }
        } catch (e) {
            console.error(`Error closing or removing sqlite db in ${tmpDir}.`, e);
        }
    }
}

async function lastUploadedSegmentTime(userId, isRest) {
    const baseParams = new QueryCommand({
        TableName: sessionsTable,
        KeyConditionExpression: "userId = :userId",
        FilterExpression: "isRest = :ir",
        ScanIndexForward: false,
        Limit: 1,
        ExpressionAttributeValues: { ":userId": userId, ":ir": isRest },
    });
    const dynResults = await docClient.send(baseParams);
    if (dynResults.Items.length === 0) return 0;
  
    return dynResults.Items[0].endDateTime;
}

async function writeSegments(userId, rows, isRest) {
    const putRequests = rows.map(r => {
        return {
            PutRequest: {
                Item: {
                    userId: userId,
                    endDateTime: r.end_date_time,
                    avgCoherence: r.avg_coherence,
                    stage: r.stage,
                    isRest: isRest
                }
            }
        };
    });
    
    // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
    const chunks = [];
    for (let i = 0; i < putRequests.length; i += 25) {
        chunks.push(putRequests.slice(i, i + 25));
    }

    for (let i=0; i<chunks.length; i++) {
        const chunk = chunks[i];
        const params = { RequestItems: {} };
        params['RequestItems'][sessionsTable] = chunk;
        await docClient.send(new BatchWriteCommand(params));
    }
}