import { app, ipcMain } from 'electron';
import { statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { camelCase, zipObject } from 'lodash'
import Database from 'better-sqlite3';
import s3utils from './s3utils.js'
import { SessionStore } from './session-store.js'
import version from '../version.json'
import { emoPics } from './utils.js';
import * as path from 'path'
import { maxSessionMinutes } from '../../common/types/types.js';
import lte from 'semver/functions/lte';
import semverSort from 'semver/functions/sort';
import gt from 'semver/functions/gt';

let db;
let insertKeyValueStmt, getKeyValueStmt;

function breathDbPath() {
   return path.join(breathDbDir(), 'fd-breath-study.sqlite');
}

function breathDbDir() {
    let breathDbDir;

    const userHome = app.getPath('home');
    if (process.platform === 'darwin') {
        breathDbDir = userHome +  '/Documents/fd-breath-study/';
    } else if (process.platform === 'win32') {
        breathDbDir = userHome + '\\Documents\\fd-breath-study';
    } else {
        throw `The '${process.platform}' operating system is not supported. Please use either Macintosh OS X or Windows.`;
    }

    return breathDbDir;

}


async function downloadDatabase(dest, session) {
    const resp = await s3utils.downloadFile(session, dest);
    if (resp.status === 'Error') {
        console.error('Failed to download breath database from s3.');
        throw new Error(resp.msg);
    }
}

function rowToObject(result) {
    const rowProps = Object.keys(result).map(camelCase);
    const rowVals = Object.values(result);
    return zipObject(rowProps, rowVals);
}

function checkVersion() {
    const curVerStmt = db.prepare('SELECT version from version ORDER BY date_time DESC LIMIT 1');
    const res = curVerStmt.get();
    if (!res || res.version !== version.v) {
        const curVer = res ? res.version : '0.0.0';
        runDbUpdates(curVer, version.v);
        const updateVerStmt = db.prepare('INSERT INTO version(version, date_time) VALUES(?, ?)');
        const dateTime = (new Date()).toISOString();
        updateVerStmt.run(version.v, dateTime);
    }
}

// If there are db changes that need to happen with a particular version
// (e.g., we've got active participants and need to upgrade their db's without
// disturbing their data), add them here. The key should be the app version 
// (as shown in client/version.json) and the value should be an array of DDL
// strings.
const dbUpdates = {
    '0.1.0': ['ALTER TABLE emwave_sessions ADD weighted_avg_coherence FLOAT NOT NULL DEFAULT 0.0']
}

/**
 * Given the current version of the database (from the most recent row in the version table)
 * and the current version of the app (as shown in client/version.json), finds all of the
 * keys in dbUpdates that are greater that the current db version and less than or equal
 * to the current app version and runs the associated DDL statements.
 * @param {string} curVersion 
 * @param {string} targetVersion 
 */
function runDbUpdates(curVersion, targetVersion) {
    const versionsWithUpdates = Object.keys(dbUpdates);
    const validVersions = versionsWithUpdates.filter(v => gt(v, curVersion) && lte(v, targetVersion));
    for (const version of semverSort(validVersions)) {
        for (const upd of dbUpdates[version]) {
            const stmt = db.prepare(upd);
            stmt.run();
        }
    }
}

function setKeyValue(key, value) {
    insertKeyValueStmt.run(key, value);
}

function getKeyValue(key) {
    const res = getKeyValueStmt.get(key);
    if (!res) return null;
    return res.value;
}

/**
 * Finds all of the positive emotional pictures that 
 * have received the fewest views so far and returns
 * one of them at random. 
 */
function getNextEmoPic() {
    const emoPicViewCounts = {};
    emoPics.forEach(p => emoPicViewCounts[p] = 0);
    const getEmoPicViewCountsStmt = db.prepare('SELECT emo_pic_name, count(emo_pic_name) as view_count FROM emwave_sessions WHERE emo_pic_name is not null GROUP BY emo_pic_name');
    const curCounts = getEmoPicViewCountsStmt.all();
    curCounts.forEach(({emo_pic_name, view_count}) => emoPicViewCounts[emo_pic_name] = view_count);
    const minCount = Math.min(...Object.values(emoPicViewCounts));
    const possiblePics = Object.entries(emoPicViewCounts)
        .filter(([_, viewCount]) => viewCount == minCount)
        .map(([pic, _]) => pic)
    return possiblePics[Math.floor(Math.random() * possiblePics.length)];
}

function saveEmWaveSessionData(emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage, emoPicName=null) {
    const sessionMinutes = Math.min(Math.round(durationSec / 60), maxSessionMinutes); // participants don't get extra credit for doing sessions longer than max session length
    const weightedAvgCoherence = (sessionMinutes / maxSessionMinutes) * avgCoherence;

    if (emoPicName) {
        const insertStmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, weighted_avg_coherence, pulse_start_time, valid_status, duration_seconds, stage, emo_pic_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        insertStmt.run(emWaveSessionId, avgCoherence, weightedAvgCoherence, pulseStartTime, validStatus, durationSec, stage, emoPicName);
    } else {
        // used for non-emopic conditition participants and for setup sessions
        const insertStmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, weighted_avg_coherence, pulse_start_time, valid_status, duration_seconds, stage) VALUES (?, ?, ?, ?, ?, ?, ?)');
        insertStmt.run(emWaveSessionId, avgCoherence, weightedAvgCoherence, pulseStartTime, validStatus, durationSec, stage);
    }
}

function getEmWaveSessionsForStage(stage) {
    const stmt = db.prepare('SELECT emwave_session_id from emwave_sessions where stage = ?');
    const res = stmt.all(stage);
    const resObjs = res.map(rowToObject).map(s => {
        s['emWaveSessionId'] = s['emwaveSessionId'];
        delete s['emwaveSessionId'];
        return s;
    })
    return resObjs;
}

function getEmWaveSessionMinutesForDayAndStage(date, stage) {
    date.setHours(0); date.setMinutes(0); date.setSeconds(0); date.setMilliseconds(0);
    const startPulseTime = Math.round(date.getTime() / 1000);
    date.setHours(23); date.setMinutes(59); date.setSeconds(59); date.setMilliseconds(999);
    const endPulseTime = Math.round(date.getTime() / 1000);
    const stmt = db.prepare('SELECT sum(duration_seconds) as total_seconds FROM emwave_sessions where stage = ? and pulse_start_time >= ? and pulse_start_time <= ?');
    const result = stmt.all()[0].total_seconds;
    return Math.round(result / 60);
}

function getEmWaveWeightedAvgCoherencesForStage(stage) {
    const stmt = db.prepare('SELECT weighted_avg_coherence FROM emwave_sessions WHERE stage = ?');
    const result = stmt.all(stage);
    return result.map(rowToObject);
}

// import this module into itself so that we can mock
// certain calls in test
// https://stackoverflow.com/questions/51269431/jest-mock-inner-function
import * as testable from "./breath-data.js";
async function initBreathDb(serializedSession) {
    try {
        statSync(testable.breathDbPath());
    } catch (err) {
        if (err.code !== 'ENOENT') throw(err);
        // create directory (call is ok if dir already exists)
        await mkdir(testable.breathDbDir(), { recursive: true });

        // we have no local db file; try downloading it
        const session = SessionStore.buildSession(serializedSession);
        await testable.forTesting.downloadDatabase(testable.breathDbPath(), session);
    }

    try {
        // at this point if we don't have a db
        // then either it's a new user or we've
        // lost all their data :-(
        // either way, we can let sqlite create the database
        // if necessary
        db = new Database(testable.breathDbPath());

        const createKeyValueTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS key_value_store(name TEXT PRIMARY KEY, value TEXT NOT NULL)');
        createKeyValueTableStmt.run();
        insertKeyValueStmt = db.prepare('REPLACE INTO key_value_store(name, value) VALUES(?, ?)');
        getKeyValueStmt = db.prepare('SELECT value FROM key_value_store where name = ?');

        const createSessionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS emwave_sessions(emwave_session_id TEXT PRIMARY KEY, avg_coherence FLOAT NOT NULL, pulse_start_time INTEGER NOT NULL, valid_status INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, stage INTEGER NOT NULL, emo_pic_name TEXT)');
        createSessionTableStmt.run();

        const createVersionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS version(version TEXT PRIMARY KEY, date_time TEXT NOT NULL)');
        createVersionTableStmt.run();
        // checkVersion should be the last thing here that runs any sql statements;
        // it may modify existing tables

        checkVersion();

        return db;
    } catch (err) {
        console.log('Error initializing breath database', err);
        throw(err);
    }
}

ipcMain.handle('login-succeeded', async (_event, session) => {
    if (!db) await initBreathDb(session);
});

function closeBreathDb() {
    if (db) db.close();
}

/**
 * TODO
 * FOR TESTING ONLY. Delete before building production version.
 */
function deleteAllData() {
    const tableNames = ['key_value_store', 'emwave_sessions'];
    tableNames.forEach(t => db.exec(`DELETE from ${t}`));
}

export {
    closeBreathDb,
    breathDbDir,
    breathDbPath,
    getKeyValue,
    setKeyValue,
    getNextEmoPic,
    saveEmWaveSessionData,
    getEmWaveSessionsForStage,
    getEmWaveSessionMinutesForDayAndStage,
    getEmWaveWeightedAvgCoherencesForStage,
    deleteAllData
}
export const forTesting = { initBreathDb, downloadDatabase }
