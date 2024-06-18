"use strict";

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { s3Client as s3 , dynamoDocClient as docClient } from '../common/aws-clients';
import { totalStage3Segments, maxSessionMinutes } from '../../../common/types/types.js';
import { trainingTimeRewards } from './earnings.js';
import Db from 'db/db.js';
import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { camelCase, zipObject } from 'lodash'
const path = require('path');
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat.js');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter.js');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrAfter);

const sessionsTable = process.env.SESSIONS_TABLE;

export async function handler(event) {
    let dbPath;
    try {
        const record = event.Records[0]; // s3 record
        dbPath = await downloadSqliteDb(record);
        const sqliteDb = new Database(dbPath);

        // process earnings
        const userId = decodeURIComponent(event.Records[0].s3.bucket.name).split('/')[0];
        
        const timeRewards = trainingTimeRewards(sqliteDb, condition, latestTimeEarnings);

         // get new sessions from sqlite db
         const lastUploadTime = await lastUploadedSessionTime(userId);
         const stmt = sqliteDb.prepare('select * from emwave_sessions where pulse_start_time > ? and stage= 2;');
         const res = stmt.all(lastUploadTime).map(rowToObject);

        // import sessions


    } finally {
        if (dbPath){
            await rm(dbPath);
        }
    }

    
    
}

const downloadSqliteDb = async (record) => {
    // Retrieve the database
    const getObjCmdInput = {
        Bucket: record.s3.bucket.name,
        Key: decodeURIComponent(record.s3.object.key),
    };
   
    try {
        // retrieve sqlite file from s3
        const getObjCmd = new GetObjectCommand(getObjCmdInput);
        const tmpDir = await mkdtemp('/tmp/');
        const dbPath = path.join(tmpDir, 'temp.sqlite');
        const data = await s3.send(getObjCmd);
        await writeFile(dbPath, data.Body);
        return dbPath;
    } catch (err) {
        console.error(`Error trying to download sqlite db (s3 key: ${getObjCmdInput.Key}).`);
        console.error(err, err.stack);
        return {status: "error", message: err.message}
    }

    
}

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
        const lastUploadTime = await lastUploadedSessionTime(userId, false);

        // get those segments from the sqlite db
        db = new Database(dbPath);
        const stmt = db.prepare('select * from segments where end_date_time > ?;');
        const res = stmt.all(lastUploadTime);

        // write them to the segments table in dynamoDb
        await writeSegments(userId, res, false);

        // repeat for rest segments
        const lastRestUploadTime = await lastUploadedSessionTime(userId, true);

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

async function lastUploadedSessionTime(userId) {
    const baseParams = new QueryCommand({
        TableName: sessionsTable,
        KeyConditionExpression: "userId = :userId",
        ScanIndexForward: false,
        Limit: 1,
        ExpressionAttributeValues: { ":userId": userId },
    });
    const dynResults = await docClient.send(baseParams);
    if (dynResults.Items.length === 0) return 0;
  
    return dynResults.Items[0].startDateTime;
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

const rowToObject = (result) => {
    const rowProps = Object.keys(result).map(camelCase);
    const rowVals = Object.values(result);
    return zipObject(rowProps, rowVals);
}


/**
 * Given a list of "real" sessions, 
 * builds "abstract" complete sessions from them.
 * Returns the original list of sessions mingled
 * with the new, abstract sessions.
 * @param {[]} sessions 
 */
const realSessionsToAbstractSessions = (sessions) => {
    const daysToSessionsMap = {};
    const results = [];

    // slightly munge fields of sessions and add them to results
    // any sessions that are shorter than the maximum session
    // length are grouped by day for processing into abstract sessions
    for (const s of sessions) {
        const durMin = Math.round(s.durationSec / 60);
        const sess = Object.assign({}, s);
        sess.startDateTime = s.pulseStartTime;
        delete(sess.pulseStartTime);
        if (durMin >= maxSessionMinutes) sess['isComplete'] = true;
        results.push(sess);

        if (durMin < maxSessionMinutes) {
            const day = dayjs.unix(s.pulseStartTime).tz('America/Los_Angeles').format('YYYYMMDD');
            const sessionsForDay = daysToSessionsMap[day] || [];
            sess['durMin'] = durMin;
            sessionsForDay.push(sess);
            daysToSessionsMap[day] = sessionsForDay;
        }
    };

    // combine incomplete sessions into complete ones
    for (const daySess of Object.values(daysToSessionsMap)) {
        if (daySess.length == 1) continue;
        const ascSess = daySess.toSorted((s1, s2) => s1.durMin - s2.durMin);
        const completedSessions = maximizeCompleteSessions(0, ascSess, []);
        for (const s of completedSessions) {
            let durationSec = 0;
            let cohSum = 0;
            let startDateTime = Number.MAX_SAFE_INTEGER;
            for (let i=0; i<s.length; i++) {
                if (s[i].startDateTime < startDateTime) startDateTime = s[i].startDateTime;
                durationSec += s[i].durationSec;
                cohSum += s[i].weightedAvgCoherence
            }
            results.push({startDateTime: startDateTime, durationSec: durationSec, weightedAvgCoherence: cohSum / s.length, isComplete: true, isAbstract: true});
        }
    }

    return results.map(r => {delete(r.durMin); return r});
}

/**
 * Given a list of sessions sorted sessions by duration (all of which
 * must be shorter than the maximum session length), combine them such that
 * we try to maximize the number of complete sessions.
 * @param {[Object]} sessions 
 * @returns {[[Object]]} Array of arrays. Each subarray consists of sessions the sum of whose durations is >= the max session length.
 */
const maximizeCompleteSessions = (curDur, sessions, results) => {
    // base case: an empty array
    if (sessions.length == 0) return results

    // base case: we're at or over 18 minutes
    if (curDur >= maxSessionMinutes) return results

    const tmp = curDur == 0 ? [] : results.pop();

    const nextSmall = sessions.shift();
    tmp.push(nextSmall);
    curDur += nextSmall.durMin;
    if (sessions.length == 0 && curDur < maxSessionMinutes) {
        // we've reached the end and aren't going to hit 18
        return results;
    }
    
    if (curDur >= maxSessionMinutes) {
        results.push(tmp)
        return maximizeCompleteSessions(0, sessions, results);
    }

    const nextLarge = sessions.pop();
    tmp.push(nextLarge);
    curDur += nextLarge.durMin;
    if (sessions.length == 0 && curDur < maxSessionMinutes) {
        // we've reached the end and aren't going to hit 18
        return results;
    }

    results.push(tmp);
    if (curDur >= maxSessionMinutes) {
        return maximizeCompleteSessions(0, sessions, results);
    }

    return maximizeCompleteSessions(curDur, sessions, results);
}

export const forTesting = { realSessionsToAbstractSessions }