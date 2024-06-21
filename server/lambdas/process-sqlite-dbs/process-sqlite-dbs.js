"use strict";

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { s3Client as s3 , dynamoDocClient as docClient } from '../common/aws-clients';
import { maxSessionMinutes, earningsTypes, earningsAmounts, statusTypes } from '../../../common/types/types.js';
import { trainingQualityRewards, trainingTimeRewards, visitRewards } from './earnings.js';
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

const db = new Db();
db.docClient = docClient;
const sessionsTable = process.env.SESSIONS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;

export async function handler(event) {
    let sqliteDbPath;
    let sqliteDb;

    try {
        const record = event.Records[0]; // s3 record
        sqliteDbPath = await downloadSqliteDb(record);
        sqliteDb = new Database(sqliteDbPath);
        const userId = decodeURIComponent(event.Records[0].s3.object.key).split('/')[0];

        // get new sessions from sqlite db
        const lastUploadTime = await lastUploadedSessionTime(userId);
        const newSessionsStmt = sqliteDb.prepare('select * from emwave_sessions where pulse_start_time > ?');
        const newSessions = newSessionsStmt.all(lastUploadTime).map(rowToObject);

        // get user and earnings info
        const user = await db.getUser(userId);
        const prevEarnings = await db.earningsForUser(userId);

        // set user to active if necessary
        if (!user?.progress?.status) {
            await db.updateUser(userId, {progress: { status: statusTypes.ACTIVE }});
        }

        // get quality-based earnings
        const earningsEligible = newSessions.filter(sess => sess.stage === 2);
        const abstractSessions = realSessionsToAbstractSessions(earningsEligible);
        const priorCoherenceValues = await getPriorCoherenceValues(userId, lastUploadTime);

        // earnings are sorted by ascending date, so last is most recent
        const lastQualityEarning = prevEarnings.findLast(e => 
            e.type === earningsTypes.STREAK_BONUS ||
            e.type === earningsTypes.TOP_25 ||
            e.type === earningsTypes.TOP_66
        );
        const qualityRewards = trainingQualityRewards(sqliteDb, user.condition, lastQualityEarning, abstractSessions, priorCoherenceValues);

        // get time-based earnings
        const lastTimeEarning = prevEarnings.findLast(e => 
            e.type === earningsTypes.BREATH1 ||
            e.type === earningsTypes.COMPLETION_BREATH2 ||
            e.type === earningsTypes.PERFORMANCE_BREATH2
        );
        const timeRewards = trainingTimeRewards(sqliteDb, user.condition, lastTimeEarning);

        // get visit earnings
        let v1Rewards = [];
        if (!prevEarnings.some(e => e.type === earningsTypes.VISIT_1)) {
            v1Rewards = visitRewards(sqliteDb, 1);
        }
        let v2Rewards = [];
        if (!prevEarnings.some(e => e.type === earningsTypes.VISIT_2)) {
            v2Rewards = visitRewards(sqliteDb, 2);
        }

        // if they earned v2Rewards it means they've completed the study
        if (v2Rewards.length > 0) {
            await db.updateUser(userId, {progress: { status: statusTypes.COMPLETE }})
        }

        //save earnings and sessions
        const allEarnings = [...qualityRewards, ...timeRewards, ...v1Rewards, ...v2Rewards];
        const nonEarningSessions = newSessions.filter(s => s.stage != 2);
        for (const s of nonEarningSessions) {
            if (s.pulseStartTime) {
                s.startDateTime = s.pulseStartTime;
                delete(s.pulseStartTime);
            }
        }
        const allSessions = [...nonEarningSessions, ...abstractSessions];
        const recordNoun = allEarnings.length == 1 ? 'record' : 'records';
        const sessionNoun = allSessions.length == 1 ? 'session' : 'sessions';
        console.log(`About to save ${allEarnings.length} earnings ${recordNoun} and ${allSessions.length} ${sessionNoun} for user ${userId}.`);
        await saveSessionsAndEarnings(userId, allSessions, allEarnings);
        console.log(`Finished saving earnings and sessions.`);
    } catch (err) {
        console.error(err);
        return {status: 'error', message: err.message};
    } finally {
        if (sqliteDb) {
            sqliteDb.close();
        }
        if (sqliteDbPath){
            await rm(sqliteDbPath);
        }
    }
    return {status: 'success'};
}

const downloadSqliteDb = async (record) => {
    // Retrieve the database
    const getObjCmdInput = {
        Bucket: record.s3.bucket.name,
        Key: decodeURIComponent(record.s3.object.key),
    };
   
    // retrieve sqlite file from s3
    const getObjCmd = new GetObjectCommand(getObjCmdInput);
    const tmpDir = await mkdtemp('/tmp/');
    const dbPath = path.join(tmpDir, 'temp.sqlite');
    const data = await s3.send(getObjCmd);
    await writeFile(dbPath, data.Body);
    return dbPath;
}

async function getPriorCoherenceValues(userId, latestStartDateTime) {
    const params = {
        TableName: sessionsTable,
        KeyConditionExpression: 'userId = :uid and startDateTime <= :latest',
        FilterExpression: 'stage = :stage and isComplete = :true',
        ExpressionAttributeValues: {
            ':uid': userId,
            ':latest': latestStartDateTime,
            ':stage': 2,
            ':true': true
        },
        ProjectionExpression: 'weightedAvgCoherence'
    };
    const res = await docClient.send(new QueryCommand(params));
    return res.Items.map(i => i.weightedAvgCoherence);
}

async function saveSessionsAndEarnings(userId, sessions, earnings) {
    const sessionPuts = sessions.map(s => {
        s.userId = userId;
        // stupid hack
        // Abstract sessions have the startDateTime of the first real session they're 
        // built from. If we don't change it we'll have a duplicate key error between
        // the abstract session and its first real session component. Adding a second
        // *should* be ok; it's certainly not foolproof but it would be extremely
        // unlikely to have two sessions just one second apart and it's not large 
        // enough that it will cause problems when we retrieve prior coherence values
        // to calculate performance rewards.
        if (s.isAbstract) s.startDateTime = s.startDateTime + 1;
        return {
            PutRequest: {
                Item: s
            }
        };
    });

    const earningsPuts = earnings.map(e => {
        const amount = earningsAmounts[e.earnings];
        if (!amount) throw new Error(`Unrecognized earnings type ${e.earnings}.`)

        return {
            PutRequest: {
                Item: {
                    userId: userId,
                    dateType: `${e.day}|${e.earnings}`,
                    amount: amount
                }
            }
        }
    });
    
    // slice into arrays of no more than 25 PutRequests due to DynamoDB limits
    while (earningsPuts.length + sessionPuts.length > 0) {
        const params = { RequestItems: {} };
        const earningsChunkSize = Math.min(earningsPuts.length, 25);
        const sessionsChunkSize = Math.min(sessionPuts.length, 25 - earningsChunkSize);
        if (earningsChunkSize > 0) {
            params.RequestItems[earningsTable] = earningsPuts.splice(0, earningsChunkSize);
        }
        if (sessionsChunkSize > 0) {
            params.RequestItems[sessionsTable] = sessionPuts.splice(0, sessionsChunkSize);
        }
        const resp = await docClient.send(new BatchWriteCommand(params));
        if (resp.UnprocessedItems.length > 0) {
            await retrySaveWithBackoff(resp.UnprocessedItems);
        }
    }
}

async function retrySaveWithBackoff(unprocessedItems) {
    let remainingItems = unprocessedItems;
    let curTry = 0;
    const delayMs = 100;
    const maxTries = 7;
    while (curTry < maxTries && remainingItems.length > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, curTry)));
        console.log(`Got unprocessed items saving earnings and sessions, re-attempting try #${curTry}...`);
        const resp = await docClient.send(new BatchWriteCommand(remainingItems));
        remainingItems = resp.UnprocessedItems;
        curTry += 1;
    }
    if (remainingItems.length > 0) {
        console.error(`Failed to save all earnings and sessions; after ${curTry} attempts there are ${remainingItems.length} unsaved items left.`);
    } else {
        console.log('Successfully saved all earnings and sessions on retry.');
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

const rowToObject = (result) => {
    const rowProps = Object.keys(result).map(camelCase).map(k => k.startsWith('emwave') ? k.replace('emwave', 'emWave') : k);
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
        const durMin = Math.round(s.durationSeconds / 60);
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
        const completedSessions = maximizeCompleteSessions(0, daySess, []);
        for (const s of completedSessions) {
            let durationSec = 0;
            let cohSum = 0;
            let startDateTime = Number.MAX_SAFE_INTEGER;
            for (let i=0; i<s.length; i++) {
                if (s[i].startDateTime < startDateTime) startDateTime = s[i].startDateTime;
                durationSec += s[i].durationSeconds;
                cohSum += s[i].weightedAvgCoherence
            }
            results.push({startDateTime: startDateTime, durationSeconds: durationSec, weightedAvgCoherence: cohSum / s.length, isComplete: true, isAbstract: true});
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

    // figure out how many minutes we need to make a complete session
    const targetDur = maxSessionMinutes - curDur;

    // find the session entry closest to our target
    const differences = sessions.map(s => Math.abs(targetDur - s.durMin));
    let minDiffIdx = -1;
    differences.reduce((prev, cur, idx) => {
        if (cur < prev) {
            minDiffIdx = idx;
            return cur;
        }
        return prev;
    }, Number.MAX_SAFE_INTEGER);

    const next = sessions.splice(minDiffIdx, 1)[0];

    tmp.push(next);
    curDur += next.durMin;

    if (sessions.length == 0 && curDur < maxSessionMinutes) {
        // we've reached the end and aren't going to hit 18
        return results;
    }
    
    results.push(tmp)
    if (curDur >= maxSessionMinutes) {
        return maximizeCompleteSessions(0, sessions, results);
    }

    return maximizeCompleteSessions(curDur, sessions, results);
}

exports.forTesting = { realSessionsToAbstractSessions }
