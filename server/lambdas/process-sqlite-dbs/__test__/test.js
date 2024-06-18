'use strict';

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
const th = require('../../common-test/test-helper.js');
import { readFile, mkdtemp, unlink } from 'fs/promises';
const os = require('os');
const lambdaLocal = require("lambda-local");
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { totalStage3Segments, maxSessionMinutes } from '../../../../common/types/types';
import { forTesting } from '../process-sqlite-dbs.js';
const dynClient = new DynamoDBClient({region: process.env.REGION, endpoint: process.env.DYNAMO_ENDPOINT, apiVersion: "2012-08-10"});
const docClient = DynamoDBDocumentClient.from(dynClient);
const Database = require('better-sqlite3');

const theUserId = 'RedInfo';
const sqliteKey = `${theUserId}/us-west-2:1234567890abcdef/HartBeam.sqlite`;
let sqliteTestDbPath;

const segmentsTable = process.env.SEGMENTS_TABLE;

const mockUpdateUser = jest.fn((userId, updates) => {});

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            updateUser: (userId, updates) => mockUpdateUser(userId, updates),
        };
    });
});

beforeEach(async () => {
    await th.dynamo.createTable(process.env.SEGMENTS_TABLE, 
        [{AttributeName: 'userId', KeyType: 'HASH'}, {AttributeName: 'endDateTime', KeyType: 'RANGE'}], 
        [{AttributeName: 'userId', AttributeType: 'S'}, {AttributeName: 'endDateTime', AttributeType: 'N'}]
    );
});

afterEach(async () => {
    await th.dynamo.deleteTable(process.env.SEGMENTS_TABLE);
    mockUpdateUser.mockClear();
});

const segments = [
    { session_start_time: 0, end_date_time: 3055000, avg_coherence: 0.458193283, stage: 3 },
    { session_start_time: 300000, end_date_time: 605000, avg_coherence: 1.773838, stage: 3 },
];

const restSegments = [
    { end_date_time: 2345950, avg_coherence: 1.084828, stage: 1 },
    { end_date_time: 7456929, avg_coherence: 0.2838411, stage: 2 }
];

describe("Processing a sqlite file", () => {
    let db;

    beforeAll(async () => {
        db = await initSqliteDb(db);
        await th.s3.removeBucket(process.env.DATA_BUCKET);
        const sqliteFile = await readFile(sqliteTestDbPath);
        await th.s3.addFile(process.env.DATA_BUCKET, sqliteKey, sqliteFile);
    });

    test("should load all segments", async() => {
        const result = await runS3PutLambda();
        expect(result.status).toBe('success');
        expect(mockUpdateUser).not.toHaveBeenCalled();
        await confirmResults(db, theUserId, 0, false);
    });

    test("should load all rest segments", async() => {
        const result = await runS3PutLambda();
        expect(result.status).toBe('success');
        expect(mockUpdateUser).not.toHaveBeenCalled();
        await confirmResults(db, theUserId, 0, true);
    });

    test(`should set stage3Complete if ${totalStage3Segments} stage 3 segments have been completed`, async() => {
        const query = "select count(*) from segments where stage=3";
        const stmt = db.prepare(query);
        const existingStage3Segs = stmt.get()["count(*)"];
        const addSegStmt = db.prepare('INSERT INTO segments(session_start_time, end_date_time, avg_coherence, stage) VALUES(0, 0, 0, 3)');
        for (let i=0; i<totalStage3Segments - existingStage3Segs; i++) {
            addSegStmt.run();
        }
        const sqliteFile = await readFile(sqliteTestDbPath);
        await th.s3.addFile(process.env.DATA_BUCKET, sqliteKey, sqliteFile);

        const result = await runS3PutLambda();
        expect(result.status).toBe('success');
        expect(mockUpdateUser).toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith(theUserId, {progress: 'stage3Complete'});
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
    it("should return the weighted average coherence score for each 18 minute abstract session in a day", () => {
        const data = [
            {emWaveSessionId: 'a1', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19)), durationSec: 18*60, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'a2', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 20)), durationSec: 18*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(data.length);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should combine sessions shorter than 18 minutes and use the average of their weighted averages", () => {
        const data = [
            {emWaveSessionId: 'a1', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 16*60, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'a2', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 29)), durationSec: 2*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[1].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSec: data[0].durationSec + data[1].durationSec
        })
        expect(res).toEqual(expect.arrayContaining([]));
    });

    it("should not combine sessions shorter than 18 minutes that happen on different days", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 16*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 20, 9, 29)), durationSec: 2*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(2);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should not error if a session is longer than 18 minutes", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 19*60, avgCoherence: 2.0, weightedAvgCoherence: 2.0},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(1);
        expect(res).toEqual(expect.arrayContaining([{
            avgCoherence: data[0].avgCoherence,
            weightedAvgCoherence: data[0].weightedAvgCoherence,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            durationSec: data[0].durationSec
        }]));
    });

    it("should not error if there are more than 36 minutes of training in a day", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 19*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 30)), durationSec: 18*60, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(data.length);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should return all original sessions and new abstract ones without marking original sessions < 18 minutes long as complete or abstract", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 1*60, avgCoherence: 36.0, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 12)), durationSec: 3*60, avgCoherence: 21.3, weightedAvgCoherence: 7.1},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSec: 14*60, avgCoherence: 8.23, weightedAvgCoherence: 6.4},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 32)), durationSec: 17*60, avgCoherence: 3.18, weightedAvgCoherence: 3.0}
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(5);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[3].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSec: data[0].durationSec + data[3].durationSec
        });
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should never combine the weighted average of a session 18 minutes or longer with the weighted average of a shorter session", () => {
        const data = [
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 1*60, weightedAvgCoherence: 2.0},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 12)), durationSec: 3*60, weightedAvgCoherence: 7.1},
            {pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSec: 18*60, weightedAvgCoherence: 6.4},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should keep the emWave session id on sessions that have it", () => {
        const data = [
            {emWaveSessionId: 'abc123', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 1*60, weightedAvgCoherence: 2.0},
        ];
        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(1);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should not give an emWave session id or average coherence to an abstract sessions", () => {
        const data = [
            {emWaveSessionId: 'abd153', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 1*60, avgCoherence: 36.0, weightedAvgCoherence: 2.0},
            {emWaveSessionId: 'bce951', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 16)), durationSec: 17*60, avgCoherence: 6.78, weightedAvgCoherence: 6.4},
        ];

        const res = forTesting.realSessionsToAbstractSessions(data);
        expect(res.length).toBe(3);
        const expectedResults = sqliteSessionsToDynamoSessions(data);
        expectedResults.push({
            weightedAvgCoherence: (data[0].weightedAvgCoherence + data[1].weightedAvgCoherence) / 2,
            startDateTime: data[0].pulseStartTime,
            isComplete: true,
            isAbstract: true,
            durationSec: data[0].durationSec + data[1].durationSec
        });
        expect(res).toEqual(expect.arrayContaining(expectedResults));
    });

    it("should keep the emopic name on sessions that have it", () => {
        const data = [
            {emoPicName: 'calm1.jpg', pulseStartTime: dateToEpochSeconds(new Date(2024, 3, 19, 9, 10)), durationSec: 1*60, weightedAvgCoherence: 2.0},
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
        if (s.durationSec >= maxSessionMinutes * 60) expected.isComplete = true;
        expected.startDateTime = s.pulseStartTime;
        delete(expected.pulseStartTime);
        results.push(expected);
    }
    return results;
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

async function confirmResults(db, userId, lastUploadTime, isRest) {
    const sqlRows = getSqliteRows(db, lastUploadTime, isRest);
    const dynRows = await getDynamoRows(userId, lastUploadTime, isRest);
    expect(dynRows.length).toBe(sqlRows.length);

    for (let i = 0; i < sqlRows.length; i++) {
        const sr = sqlRows[i];
        const dr = dynRows[i];
        expect(dr.avgCoherence).toBe(sr.avg_coherence);
        expect(dr.stage).toBe(sr.stage);
        expect(dr.endDateTime).toBe(sr.end_date_time);
        expect(dr.userId).toBe(userId);
    }
}

async function initSqliteDb() {
    const dbDir = await mkdtemp(os.tmpdir());
    sqliteTestDbPath = path.join(dbDir, 'TestFDS.sqlite');
    const db = new Database(sqliteTestDbPath);

    const createSegmentTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY, session_start_time INTEGER NOT NULL, end_date_time INTEGER NOT NULL, avg_coherence FLOAT, stage INTEGER NOT NULL)');
    createSegmentTableStmt.run();
    const insertSegmentStmt = db.prepare('INSERT INTO segments(session_start_time, end_date_time, avg_coherence, stage) VALUES(?, ?, ?, ?)');
    segments.forEach(s => insertSegmentStmt.run(s.session_start_time, s.end_date_time, s.avg_coherence, s.stage));

    // a rest segment is one in which a subject breathes at whatever pace they like
    // while sitting quietly
    const createRestSegmentsTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS rest_segments(id INTEGER PRIMARY KEY, end_date_time INTEGER NOT NULL, avg_coherence FLOAT, stage INTEGER NOT NULL)');
    createRestSegmentsTableStmt.run();
    const insertRestSegmentStmt = db.prepare('INSERT INTO rest_segments(end_date_time, avg_coherence, stage) VALUES(?, ?, ?)');
    restSegments.forEach(rs => insertRestSegmentStmt.run(rs.end_date_time, rs.avg_coherence, rs.stage));

    return db;
}

function getSqliteRows(db, lastUploadTime, isRest) {
    const table = isRest ? 'rest_segments' : 'segments';
    const query = `select * from ${table} where end_date_time > ? order by end_date_time asc`;
    const stmt = db.prepare(query);
    return stmt.all(lastUploadTime);
}

async function getDynamoRows(userId, lastUploadTime, isRest) {
    const userQueryRes = await docClient.send(new ScanCommand({
        TableName: segmentsTable, 
        FilterExpression: "userId = :userId and endDateTime > :lut and isRest = :ir",
        ExpressionAttributeValues: {":userId": userId, ":lut": lastUploadTime, ":ir": isRest},
    }));
    return userQueryRes.Items;
}
