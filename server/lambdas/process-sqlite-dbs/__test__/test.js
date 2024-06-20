'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
import { readFile, mkdtemp, unlink } from 'fs/promises';
const os = require('os');
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(timezone);
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const lambdaLocal = require("lambda-local");
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { maxSessionMinutes, earningsTypes, earningsAmounts } from '../../../../common/types/types';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);
const Database = require('better-sqlite3');

const theUserId = 'abc345';
const sqliteKey = `${theUserId}/us-west-2:1234567890abcdef/FDS.sqlite`;
let sqliteTestDbPath;

const sessionsTable = process.env.SESSIONS_TABLE;
const earningsTable = process.env.EARNINGS_TABLE;

const mockGetUser = jest.fn((userId) => ({userId: userId, condition: 2}));
const mockGetUserEarnings = jest.fn((userId) => []);

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getUser: (userId) => mockGetUser(userId),
            earningsForUser: (userId) => mockGetUserEarnings(userId)
        };
    });
});

beforeEach(async () => {
    await th.dynamo.createTable(process.env.SESSIONS_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'startDateTime', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'startDateTime', AttributeType: 'N'}]
    );
    await th.dynamo.createTable(process.env.EARNINGS_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'dateType', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'dateType', AttributeType: 'S'}]
    );
});

afterEach(async () => {
    await th.dynamo.deleteTable(process.env.SESSIONS_TABLE);
    await th.dynamo.deleteTable(process.env.EARNINGS_TABLE);
    mockGetUser.mockClear();
    mockGetUserEarnings.mockClear();
});

describe("Processing a sqlite file", () => {
    let db;

    beforeEach(async () => {
        db = await initSqliteDb(db);
    });

    it("should save sessions from all stages", async () => {
        const sessions = [
            { emwave_session_id: 'cafe450', avg_coherence: 1.2, pulse_start_time: dayjs().subtract(8, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 1, weighted_avg_coherence: (5/18)*1.2 },
            { emwave_session_id: 'cafe451', avg_coherence: 2.3, pulse_start_time: dayjs().subtract(6, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 2.3 },
            { emwave_session_id: 'cafe452', avg_coherence: 1.7, pulse_start_time: dayjs().subtract(4, 'hours').unix(), valid_status: 1, duration_seconds: 300, stage: 3, weighted_avg_coherence: (5/18)*1.7 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedSessions = await getDynamoSessions(theUserId);
        expect(addedSessions.length).toBe(sessions.length);
        const allStages = new Set(sessions.map(s => s.stage));
        for (const stage of allStages.keys()) {
            expect(addedSessions.some(s => s.stage == stage)).toBe(true);
        }
    });

    it("should only save sessions newer than the last uploaded session", async () => {
        const lastSessionTime = dayjs().subtract(1, 'day');
        const dynamoSessions = [{ emWaveSessionId: 'cafe451', avgCoherence: 2.3, startDateTime: lastSessionTime.unix(), validStatus: 1, durationSeconds: maxSessionMinutes*60, stage: 2, weightedAvgCoherence: 2.3 }];
        await insertDynamoSessions(theUserId, dynamoSessions);

        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: lastSessionTime.subtract(2, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: lastSessionTime.add(20, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 2.3 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const expectedNewSessions = sessions.filter(s => dayjs.unix(s.pulse_start_time).isAfter(lastSessionTime));
        const addedSessions = (await getDynamoSessions(theUserId)).filter(s => s.startDateTime != dynamoSessions[0].startDateTime);
        expect(addedSessions.length).toBe(expectedNewSessions.length);
    });

    it("should only save time-based earnings for sessions after the last time-based earning", async () => {
        const lastEarningsTime = dayjs().tz('America/Los_Angeles').subtract(2, 'days');
        const prevEarnings = [{userId: theUserId, date: lastEarningsTime.format(), type: earningsTypes.BREATH1, amount: earningsAmounts[earningsTypes.BREATH1]}];
        mockGetUserEarnings.mockReturnValueOnce(prevEarnings);

        const sessions = [
            { emwave_session_id: 'adcd123', avg_coherence: 1.2, pulse_start_time: lastEarningsTime.subtract(2, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence:1.2 },
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: lastEarningsTime.add(1, 'hour').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 2.3 },
        ];
        await runLambdaTestWithSessions(db, sessions);
        const dynamoEarnings = await getDynamoEarnings(theUserId);
        const expectedEarningsCount = sessions.filter(s => dayjs.unix(s.pulse_start_time).isAfter(lastEarningsTime) && s.duration_seconds >= maxSessionMinutes * 60).length;
        expect(dynamoEarnings.length).toBe(expectedEarningsCount);
        expect(dynamoEarnings).toEqual(expect.arrayContaining([
            {userId: theUserId, dateType: `${lastEarningsTime.add(1, 'hour').startOf('day').format()}|${earningsTypes.COMPLETION_BREATH2}`, amount: earningsAmounts[earningsTypes.COMPLETION_BREATH2]}
        ]));
    });

    it("should combine shorter stage 2 sessions on the same day into complete, abstract sessions", async () => {
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.0, pulse_start_time: dayjs().subtract(6, 'hours').unix(), valid_status: 1, duration_seconds: 12*60, stage: 2, weighted_avg_coherence: (12/18)*1.0 },
            { emwave_session_id: 'abdb900', avg_coherence: 2.0, pulse_start_time: dayjs().subtract(5, 'hours').unix(), valid_status: 1, duration_seconds: 6*60, stage: 2, weighted_avg_coherence: (6/18)*2.0 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedSessions = await getDynamoSessions(theUserId);
        const absSessWeightedCoherence = (sessions[0].weighted_avg_coherence + sessions[1].weighted_avg_coherence) / 2;
        expect(addedSessions.length).toBe(3);
        expect(addedSessions.some(s => s.isComplete && s.isAbstract && s.durationSeconds == 18*60 && s.weightedAvgCoherence == absSessWeightedCoherence)).toBe(true);
    });

    it(`should mark sessions that are >= ${maxSessionMinutes} minutes long as complete`, async () => {
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.6, pulse_start_time: dayjs().subtract(6, 'hours').unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 1.6 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedSessions = await getDynamoSessions(theUserId);
        expect(addedSessions.length).toBe(sessions.length);
        expect(addedSessions.some(s => s.emWaveSessionId === sessions[0].emwave_session_id && s.isComplete)).toBe(true);
    });

    it("should include prior coherence values when calculating performance rewards", async () => {
        const lastSessionTime = dayjs().subtract(4, 'days');
        const dynamoSessions = [];
        for (let i=0; i<4; i++) {
            const startTime = lastSessionTime.add(i, 'days');
            const weightedCoh = i == 3 ? 7 : 3;
            dynamoSessions.push({emWaveSessionId: `cafe45${i}`, avgCoherence: 2.3, startDateTime: startTime.unix(), validStatus: 1, durationSeconds: maxSessionMinutes*60, stage: 2, weightedAvgCoherence: weightedCoh, isComplete: true})
        }
        await insertDynamoSessions(theUserId, dynamoSessions);

        const sessTime = lastSessionTime.add(4, 'days').tz('America/Los_Angeles');
         // with a weighted_avg_coherence of 5, this should score in the top 66% but not the top 25%
        // of prior sessions given the test data created above
        const sessions = [
            { emwave_session_id: 'abcf789', avg_coherence: 2.3, pulse_start_time: sessTime.unix(), valid_status: 1, duration_seconds: maxSessionMinutes*60, stage: 2, weighted_avg_coherence: 5 },
        ];
        mockGetUser.mockReturnValueOnce({userId: theUserId, condition: 3}); // make sure we use a performance condition
        await runLambdaTestWithSessions(db, sessions);

        const addedEarnings = await getDynamoEarnings(theUserId);
        expect(addedEarnings.length).toBe(sessions.length + 1); // they should get one time and one quality reward
        expect(addedEarnings).toEqual(expect.arrayContaining([
            {userId: theUserId, amount: earningsAmounts[earningsTypes.BREATH1], dateType: `${sessTime.startOf('day').format()}|${earningsTypes.BREATH1}`},
            {userId: theUserId, amount: earningsAmounts[earningsTypes.TOP_66], dateType: `${sessTime.format()}|${earningsTypes.TOP_66}`}
        ]));
    });

    it.each([{visit: 1, stage: 1}, {visit: 2, stage: 3}])("should save visit $visit rewards when they have not yet been earned and stage $stage sessions exist", async ({visit, stage}) => {
        const sessDate = dayjs().subtract(6, 'hours');
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.6, pulse_start_time: sessDate.unix(), valid_status: 1, duration_seconds: 300, stage: stage, weighted_avg_coherence: 1.6 },
        ];
        await runLambdaTestWithSessions(db, sessions);

        const addedEarnings = await getDynamoEarnings(theUserId);
        expect(addedEarnings.length).toBe(1);
        const earnType = visit == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        expect(addedEarnings).toStrictEqual([{userId: theUserId, dateType: `${sessDate.tz('America/Los_Angeles').format()}|${earnType}`, amount: earningsAmounts[earnType]}]);
    });

    it.each([{visit: 1, stage: 1}, {visit: 2, stage: 3}])("should not save visit $visit rewards when they have already been earned", async ({visit, stage}) => {
        const earnType = visit == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        mockGetUserEarnings.mockReturnValueOnce([{type: earnType, date: dayjs().format(), userId: theUserId, amount: earningsAmounts[earnType]}]);

        const sessDate = dayjs().subtract(6, 'hours');
        const sessions = [
            { emwave_session_id: 'cafe451', avg_coherence: 1.6, pulse_start_time: sessDate.unix(), valid_status: 1, duration_seconds: 300, stage: stage, weighted_avg_coherence: 1.6 },
        ];
        await runLambdaTestWithSessions(db, sessions);
        const addedEarnings = await getDynamoEarnings(theUserId);
        expect(addedEarnings.length).toBe(0);
    });

    afterAll(async () => {
        await th.s3.removeBucket(process.env.DATA_BUCKET);

        if (db) {
            db.close();
        }
        unlink(sqliteTestDbPath);
    });

});

describe("Building abstract sessions", () => {
    const { forTesting } = require('../process-sqlite-dbs.js');

    it("should return the weighted average coherence score for each 18 minute abstract session in a day", () => {
        const data = [
            {emWaveSessionId: 'a1', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19)), durationSeconds: 18*60, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'a2', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 20)), durationSeconds: 18*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(data.length);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should combine sessions shorter than 18 minutes and use the average of their weighted averages", () => {
        const data = [
            {emWaveSessionId: 'a1', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 16*60, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'a2', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 29)), durationSeconds: 2*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[1].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSeconds: data[0].durationSeconds + data[1].durationSeconds
        })
        expect(res).toEqual(expect.arrayContaining([]));
    });

    it("should not combine sessions shorter than 18 minutes that happen on different days", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 16*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 20, 9, 29)), durationSeconds: 2*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(2);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should not error if a session is longer than 18 minutes", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 19*60, avgCoherence: 2.0, weightedAvgCoherence: 2.0},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(1);
        expect(res).toEqual(expect.arrayContaining([{
            avgCoherence: data[0].avgCoherence,
            weightedAvgCoherence: data[0].weightedAvgCoherence,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            durationSeconds: data[0].durationSeconds
        }]));
    });

    it("should not error if there are more than 36 minutes of training in a day", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 19*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 30)), durationSeconds: 18*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(data.length);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should return all original sessions and new abstract ones without marking original sessions < 18 minutes long as complete or abstract", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 1*60, avgCoherence: 36.0, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 12)), durationSeconds: 3*60, avgCoherence: 21.3, weightedAvgCoherence: 7.1},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSeconds: 14*60, avgCoherence: 8.23, weightedAvgCoherence: 6.4},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 32)), durationSeconds: 17*60, avgCoherence: 3.18, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(5);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[3].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSeconds: data[0].durationSeconds + data[3].durationSeconds
        });
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should never combine the weighted average of a session 18 minutes or longer with the weighted average of a shorter session", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 1*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 12)), durationSeconds: 3*60, weightedAvgCoherence: 7.1},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSeconds: 18*60, weightedAvgCoherence: 6.4},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should keep the emWave session id on sessions that have it", () => {
        const data = [
            {emWaveSessionId: 'abc123', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 1*60, weightedAvgCoherence: 2.0},
        ];
        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(1);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should not give an emWave session id or average coherence to an abstract sessions", () => {
        const data = [
            {emWaveSessionId: 'abd153', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 1*60, avgCoherence: 36.0, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'bce951', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSeconds: 17*60, avgCoherence: 6.78, weightedAvgCoherence: 6.4},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[1].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSeconds: data[0].durationSeconds + data[1].durationSeconds
        });
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should keep the emopic name on sessions that have it", () => {
        const data = [
            {emoPicName: 'calm1.jpg', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSeconds: 1*60, weightedAvgCoherence: 2.0},
        ];
        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(1);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });
});

function dateToEpochSeconds(someDate) {
    return Math.round(someDate.getTime() / 1000);
}

function sqliteSessionsToDynamoSessions(sessions) {
    const results = [];
    for (const s of sessions) {
        const expected = Object.assign({}, s);
        if (s.durationSeconds >= maxSessionMinutes * 60) expected.isComplete = true;
        expected.startDateTime = s.pulseStartTime;
        delete(expected.pulseStartTime);
        results.push(expected);
    }
    return results;
}

async function runLambdaTestWithSessions(db, sessions, expectedStatus='success') {
    await insertSessions(db, sessions);
    const result = await runS3PutLambda();
    expect(result.status).toBe(expectedStatus);
}

async function runS3PutLambda() {
    const putEventJson = await readFile(path.join(__dirname, 's3-put-event.json'));
    const putEvent = JSON.parse(putEventJson);
    putEvent.Records[0].s3.bucket.name = process.env.DATA_BUCKET;
    putEvent.Records[0].s3.object.key = sqliteKey;
    const result = await lambdaLocal.execute({
        event: putEvent,
        lambdaPath: path.join(__dirname, '../process-sqlite-dbs.js'),
        lambdaHandler: 'handler',
        verboseLevel: 0
    });
    return result;
}

async function initSqliteDb() {
    const dbDir = await mkdtemp(os.tmpdir());
    sqliteTestDbPath = path.join(dbDir, 'TestFDS.sqlite');
    const db = new Database(sqliteTestDbPath);

    const createSessionsTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS emwave_sessions(emwave_session_id TEXT PRIMARY KEY, avg_coherence FLOAT NOT NULL, pulse_start_time INTEGER NOT NULL, valid_status INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, stage INTEGER NOT NULL, emo_pic_name TEXT, weighted_avg_coherence FLOAT NOT NULL DEFAULT 0.0)');
    createSessionsTableStmt.run();
    
    return db;
}

async function insertDynamoSessions(userId, sessions) {
    const puts = sessions.map(s => {
        s.userId = userId;
        return {
            PutRequest: {
                Item: s
            }
        };
    });
    const params = { RequestItems: {} };
    params.RequestItems[sessionsTable] = puts;
    await docClient.send(new BatchWriteCommand(params));
}

async function insertSessions(db, sessions) {
    const stmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, pulse_start_time, valid_status, duration_seconds, stage, emo_pic_name, weighted_avg_coherence) VALUES(?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of sessions) {
        if (!s.emo_pic_name) s.emo_pic_name = null;
        stmt.run(s.emwave_session_id, s.avg_coherence, s.pulse_start_time, s.valid_status, s.duration_seconds, s.stage, s.emo_pic_name, s.weighted_avg_coherence);
    }
    await th.s3.removeBucket(process.env.DATA_BUCKET);
    const sqliteFile = await readFile(sqliteTestDbPath);
    await th.s3.addFile(process.env.DATA_BUCKET, sqliteKey, sqliteFile);
}

async function getDynamoSessions(userId) {
   return await dynamoQueryByUserId(userId, sessionsTable);
}

async function getDynamoEarnings(userId) {
   return await dynamoQueryByUserId(userId, earningsTable);
}

async function dynamoQueryByUserId(userId, tableName) {
    const userQueryRes = await docClient.send(new QueryCommand({
        TableName: tableName, 
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: {":userId": userId},
    }));
    return userQueryRes.Items;
}
