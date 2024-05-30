import { app, ipcMain } from 'electron';
import { statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { mean, std, sqrt } from 'mathjs';
import { camelCase, zipObject } from 'lodash'
import emwave from './emwave.js';
import Database from 'better-sqlite3';
import s3utils from './s3utils.js'
import { SessionStore } from './session-store.js'
import version from '../version.json'
import { emoPics, yyyymmddNumber } from './utils.js';
import { earningsTypes } from '../../common/types/types.js';
import * as path from 'path'

let db;
let insertSegmentStmt, insertRestSegmentStmt, findRegimeStmt, insertRegimeStmt, regimeByIdStmt;
let insertKeyValueStmt, getKeyValueStmt;
let insertEmWaveSessionStmt;

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

function getRegimeId(regime) {
    const holdPos = regime.holdPos ? regime.holdPos : null;
    const randomizedAsInt = regime.randomize ? 1 : 0;
    const existing = findRegimeStmt.get(regime.durationMs, regime.breathsPerMinute, holdPos, randomizedAsInt);
    if (existing) return existing.id;

    const newRegime = insertRegimeStmt.run(regime.durationMs, regime.breathsPerMinute, holdPos, randomizedAsInt);
    if (newRegime.changes !== 1) {
        throw new Error(`Error adding regime ${JSON.stringify(regime)} . Expected it to add one row, but it added ${newRegime.changes}.`);
    }
    return newRegime.lastInsertRowid;
}

function lookupRegime(regimeId) {
    const res = regimeByIdStmt.get(regimeId);
    if (!res) return;

    return regimeDataToRegime(res);
}

function createSegment(regimeData, stage) {
    const endDateTime = Math.round((new Date).getTime() / 1000);
    let newSegment;
    if (!regimeData.regime) {
        // then it's a rest segment
        newSegment = insertRestSegmentStmt.run(endDateTime, regimeData.avgCoherence, stage);
    } else {
        const regimeId = getRegimeId(regimeData.regime);
        newSegment = insertSegmentStmt.run(
            regimeId,
            regimeData.sessionStartTime,
            endDateTime,
            regimeData.avgCoherence,
            stage
        );
    }
    
    if (newSegment.changes !== 1) {
        throw new Error(`Error adding segment with start time ${regimeData.sessionStartTime}`);
    }
    return newSegment.lastInsertRowid;
}

function getSegmentsAfterDate(date, stage) {
    const stmt = db.prepare(`SELECT * FROM segments where end_date_time >= ? and stage = ? ORDER BY end_date_time asc`);
    const res = stmt.all(date.getTime() / 1000, stage);
    return res.map(rowToObject);
}

function getTrainingDays(useRest, includeToday, stage) {
    if (!Number.isInteger(stage) || stage < 1 || stage > 3) {
        throw new Error(`Expected a stage between 1 and 3, but got ${stage}.`);
    }
    const tableName = useRest ? 'rest_segments': 'segments';
    let segEndTimes = [];
    if (includeToday) {
        const stmt = db.prepare(`SELECT end_date_time FROM ${tableName} where stage = ?`);
        segEndTimes = stmt.all(stage);
    } else {
        const stmt = db.prepare(`SELECT end_date_time FROM ${tableName} where end_date_time < ? and stage = ?`);
        const startOfDay = new Date();
        startOfDay.setHours(0); startOfDay.setMinutes(0); startOfDay.setSeconds(0);
        segEndTimes = stmt.all(startOfDay.getTime() / 1000, stage);
    }
    const uniqDays = new Set(segEndTimes.map(s => {
        const theDate = new Date(s.end_date_time * 1000);
        return yyyymmddNumber(theDate);
    }));
    return uniqDays;
}

/**
 * Returns the number of days, not including today, that a user
 * has done at least one breathing segment.
 */
function getTrainingDayCount(stage) {
    const uniqDays = getTrainingDays(false, false, stage);
    return uniqDays.size;
}

function getAvgCoherenceValues(regimeId, stage) {
    const stmt = db.prepare('SELECT avg_coherence from segments where regime_id = ? and stage = ?');
    const res = stmt.all(regimeId, stage);
    return res.map(r => r.avg_coherence);
}

function getRegimeStats(regimeId) {
    const avgCohVals2 = getAvgCoherenceValues(regimeId, 2);
    const avgCohVals3 = getAvgCoherenceValues(regimeId, 3);
    const avgCohVals = [...avgCohVals2, ...avgCohVals3];
    if (avgCohVals.length === 0) return { id: regimeId, mean: NaN, low90CI: NaN, high90CI: NaN };
    
    const stdDev = std(avgCohVals);
    const interval = (1.645 * stdDev) / sqrt(avgCohVals.length - 1);
    const meanAvgCoh = mean(avgCohVals);
    return { id: regimeId, mean: meanAvgCoh, low90CI: meanAvgCoh - interval, high90CI: meanAvgCoh + interval};
}

function getAllRegimeIds(stage) {
    if (stage != 3) throw new Error(`getAllRegimeIds is not implemented for stage ${stage}.`);
    const allRegimesStmt = db.prepare('SELECT id from regimes');
    const allRegimes = allRegimesStmt.all();
    return allRegimes.map(r => r.id);
}

function getAvgRestCoherence(stage) {
    const stmt = db.prepare('SELECT avg_coherence from rest_segments where stage = ?');
    const res = stmt.all(stage);
    return mean(res.map(r => r.avg_coherence));
}

function getMinCoherencePacedRegimeId() {
    const stmt = db.prepare('SELECT regime_id from segments where stage != 1 and avg_coherence = (select min(avg_coherence) from segments where stage != 1) order by regime_id ascending limit 1');
    const res = stmt.all();
    return res[0].regime_id;
}

/**
 * @return {Set}  Set of days (as YYYYMMDD numbers) that rest breathing has been done on
 */
function getRestBreathingDays(stage) {
    return getTrainingDays(true, true, stage);
}

/**
 * 
 * @returns {Set} Set of days (as YYYYMMDD numbers) that paced breathing has been done on
 */
function getPacedBreathingDays(stage) {
    return getTrainingDays(false, true, stage);
}

/**
 * Stage 2 is complete when each of the six baseline regimes has been practiced twice.
 * Stage 3 is complete when 48 segments have been completed.
 * @returns boolean
 */
function isStageComplete(stage) {
    const segs = getSegmentsAfterDate(new Date(1970, 0, 1), stage);
    if (stage == 3) return segs.length >= 48;

    if (stage != 2) throw new Error(`Expected stage to be either 2 or 3, but got ${stage}.`)
    
    const segsByRegime = {}
    segs.forEach(s => {
        const segsForRegime = segsByRegime[s.regimeId] || [];
        segsForRegime.push(s);
        segsByRegime[s.regimeId] = segsForRegime;
    });

    const regimeCount = Object.keys(segsByRegime).length;
    if (regimeCount < 6) return false;
    if (regimeCount > 6) throw new Error(`Expected no more than six regimes in stage 2, but found ${regimeCount}.`);
    const practiceCounts = Object.values(segsByRegime).map(v => v.length)
    return practiceCounts.every(c => c >= 2)
}

function setRegimeBestCnt(regimeId, count) {
    const updateStmt = db.prepare('UPDATE regimes set is_best_cnt = ? where id = ?');
    const res = updateStmt.run(count, regimeId);
    if (res.changes != 1) {
        throw new Error(`Error updating is_best_cnt for regime ${regimeId}. Expected it to update one row, but it updated ${res.changes}.`);
    }
}

function rowToObject(result) {
    const rowProps = Object.keys(result).map(camelCase);
    const rowVals = Object.values(result);
    return zipObject(rowProps, rowVals);
}

function regimeDataToRegime(rd) {
    const resObj = rowToObject(rd);
    resObj.randomize = rd.randomize === 0 ? false : true;
    return resObj;
}

/**
 * Returns the regimes the user is supposed to follow for a given day, or
 * an empty list if none are found.
 * @param {Date} date
 */
function getRegimesForDay(date) {
    const regimesForDayStmt = db.prepare('SELECT regimes.* FROM regimes JOIN daily_regimes ON regimes.id = daily_regimes.regime_id WHERE daily_regimes.date = ? ORDER BY daily_regimes.day_order ASC');
    const yyyymmdd = yyyymmddNumber(date);
    const res = regimesForDayStmt.all(yyyymmdd);
    return res.map(regimeDataToRegime);
}

/**
 * Saves the given regimes as the ones to use for the given day.
 * When retrieved they will always be returned in the order they had here.
 * @param {array} regimes 
 * @param {Date} date 
 */
function saveRegimesForDay(regimes, date) {
    const stmt = db.prepare('INSERT INTO daily_regimes(regime_id, date, day_order) VALUES(?, ?, ?)');
    const yyyymmdd = yyyymmddNumber(date);
    regimes.forEach((r, idx) => {
        const id = r.id ? r.id : getRegimeId(r);
        stmt.run(id, yyyymmdd, idx);
    });
}

function checkVersion() {
    const curVerStmt = db.prepare('SELECT version from version ORDER BY date_time DESC LIMIT 1');
    const res = curVerStmt.get();
    if (!res || res.version !== version.v) {
        const updateVerStmt = db.prepare('INSERT INTO version(version, date_time) VALUES(?, ?)');
        const dateTime = (new Date()).toISOString();
        updateVerStmt.run(version.v, dateTime);
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
    if (emoPicName) {
        insertEmWaveSessionStmt.run(emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage, emoPicName);
    } else {
        // used for non-emopic conditition participants and for setup sessions
        const insertStmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, pulse_start_time, valid_status, duration_seconds, stage) VALUES (?, ?, ?, ?, ?, ?)');
        insertStmt.run(emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage);
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
        const createRegimeTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS regimes(id INTEGER PRIMARY KEY, duration_ms INTEGER NOT NULL, breaths_per_minute INTEGER NOT NULL, hold_pos TEXT, randomize BOOLEAN NOT NULL, is_best_cnt INTEGER NOT NULL DEFAULT 0)');
        createRegimeTableStmt.run();

        const createDailyRegimesTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS daily_regimes(id INTEGER PRIMARY KEY, regime_id INTEGER NOT NULL, date INTEGER NOT NULL, day_order INTEGER NOT NULL, FOREIGN KEY(regime_id) REFERENCES regimes(id))');
        createDailyRegimesTableStmt.run();

        // a segment is a portion (usually five minutes) of a longer emwave session (usually fifteen minutes) 
        // during which breathing happens under a given regime
        // a segment is eseentially an instance of a regime - while participants may breathe
        // following a particular regime many different times, each time they do so will be
        // a unique segment
        const createSegmentTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY, regime_id INTEGER NOT NULL, session_start_time INTEGER NOT NULL, end_date_time INTEGER NOT NULL, avg_coherence FLOAT, stage INTEGER NOT NULL, FOREIGN KEY(regime_id) REFERENCES regimes(id))');
        createSegmentTableStmt.run();
        insertSegmentStmt = db.prepare('INSERT INTO segments(regime_id, session_start_time, end_date_time, avg_coherence, stage) VALUES(?, ?, ?, ?, ?)');

        // a rest segment is one in which a subject breathes at whatever pace they like
        // while sitting quietly
        const createRestSegmentsTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS rest_segments(id INTEGER PRIMARY KEY, end_date_time INTEGER NOT NULL, avg_coherence FLOAT, stage INTEGER NOT NULL)');
        createRestSegmentsTableStmt.run();
        insertRestSegmentStmt = db.prepare('INSERT INTO rest_segments(end_date_time, avg_coherence, stage) VALUES(?, ?, ?)');

        const createVersionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS version(version TEXT PRIMARY KEY, date_time TEXT NOT NULL)');
        createVersionTableStmt.run();
        checkVersion();

        findRegimeStmt = db.prepare('SELECT id from regimes where duration_ms = ? AND breaths_per_minute = ? AND hold_pos is ? AND randomize = ?');
        insertRegimeStmt = db.prepare('INSERT INTO regimes(duration_ms, breaths_per_minute, hold_pos, randomize) VALUES(?, ?, ?, ?)');
        regimeByIdStmt = db.prepare('SELECT * from regimes where id = ?');

        const createKeyValueTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS key_value_store(name TEXT PRIMARY KEY, value TEXT NOT NULL)');
        createKeyValueTableStmt.run();
        insertKeyValueStmt = db.prepare('REPLACE INTO key_value_store(name, value) VALUES(?, ?)');
        getKeyValueStmt = db.prepare('SELECT value FROM key_value_store where name = ?');

        const createSessionTableStmt = db.prepare('CREATE TABLE IF NOT EXISTS emwave_sessions(emwave_session_id TEXT PRIMARY KEY, avg_coherence FLOAT NOT NULL, pulse_start_time INTEGER NOT NULL, valid_status INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, stage INTEGER NOT NULL, emo_pic_name TEXT)');
        createSessionTableStmt.run();
        insertEmWaveSessionStmt = db.prepare('INSERT INTO emwave_sessions(emwave_session_id, avg_coherence, pulse_start_time, valid_status, duration_seconds, stage, emo_pic_name) VALUES (?, ?, ?, ?, ?, ?, ?)');

        emwave.subscribe(createSegment);
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

export {
    isStageComplete,
    closeBreathDb,
    breathDbDir,
    breathDbPath,
    getRegimeId,
    getAllRegimeIds,
    getRegimeStats,
    getRegimesForDay,
    getAvgRestCoherence,
    getMinCoherencePacedRegimeId,
    getRestBreathingDays,
    getPacedBreathingDays,
    lookupRegime,
    setRegimeBestCnt,
    getSegmentsAfterDate,
    getTrainingDayCount,
    saveRegimesForDay,
    getKeyValue,
    setKeyValue,
    getNextEmoPic,
    saveEmWaveSessionData,
    getEmWaveSessionsForStage,
    getEmWaveSessionMinutesForDayAndStage
}
export const forTesting = { initBreathDb, downloadDatabase, createSegment }
