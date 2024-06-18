import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
const customParseFormat = require('dayjs/plugin/customParseFormat.js');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter.js');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrAfter);
import Db from 'db/db.js';

import { earningsTypes, maxSessionMinutes } from '../../../common/types/types.js';

const db = new Db();
db.docClient = docClient;

const minutesPerDayQuery = "SELECT strftime('%Y-%m-%d', pulse_start_time, 'unixepoch', 'localtime') AS day, sum(duration_seconds)/60 AS minutes FROM emwave_sessions WHERE stage=2 AND pulse_start_time > ? GROUP BY day ORDER BY day asc";


// A "session" is 18 minutes long, but may
// be broken up across multiple actual sessions.
// Given a number of minutes, converts it to a
// number of 18 minute abstract sessions
const minutesToSessions = (minutes) => {
    return Math.round(minutes / maxSessionMinutes);
}

/**
 * Calculates time- (not performance-) based rewards.
 * @param {Object} sqliteDb Handle to open sqlite db
 * @param {Object} condition participant condition - must be >=0 and <= 63
 * @param {Object} latestTimeEarnings most recent time-based earnings record for this participant
 * @returns Array of objects with date, earnings fields. Date is YYYY-MM-DD date for the earnings, earnings is array of types of earnings for that day.
 */
export const trainingTimeRewards = (sqliteDb, condition, latestTimeEarnings) => {
    if (condition < 0 || condition > 63) throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`);

    let startDay;
    if (!latestTimeEarnings) {
        startDay = dayjs('1970-01-01 00:00').tz('America/Los_Angeles');
    } else if (latestTimeEarnings.type == earningsTypes.BREATH1) {
        // they can still earn a *_BREATH2 reward for this day
        startDay = dayjs.tz(latestTimeEarnings.date, 'YYYY-MM-DD', 'America/Los_Angeles');
    } else {
        // there's no other time-based reward for this day - move to the next one
        startDay = dayjs.tz(latestTimeEarnings.date, 'YYYY-MM-DD', 'America/Los_Angeles').add(1, 'day');
    }

    const stmt = sqliteDb.prepare(minutesPerDayQuery);
    const results = stmt.all(startDay.unix());
    const newEarnings = []
    for (const res of results) {
        let earningsForDay = trainingTimeEarningsForDay(res.minutes, condition);
        const earningsDay = dayjs.tz(res.day, 'YYYY-MM-DD', 'America/Los_Angeles');
        if (startDay.isSameOrAfter(earningsDay, 'day')) { // shouldn't happen, but double-check
            // make sure we don't double-pay anything
            if (latestTimeEarnings?.type == earningsTypes.COMPLETION_BREATH2 || latestTimeEarnings?.type == earningsTypes.PERFORMANCE_BREATH2) {
                earningsForDay = null;
            }
            if (latestTimeEarnings?.type == earningsTypes.BREATH1) {
                earningsForDay = earningsForDay.filter(e => e !== earningsTypes.BREATH1)
            }
        }
        if (earningsForDay) newEarnings.push({day: res.day, earnings: earningsForDay});
        
    }

    return newEarnings;
}

/**
 * Converts a number of training minutes for a given day into a list of completion awards.
 * Participants in different conditions are eligible for different rewards.
 * @param {number} minutes number of minutes the participant trained in a given day
 * @param {number} condition participant's condition
 * @returns {[string]} array of reward types, as specified in earningsTypes
 */
const trainingTimeEarningsForDay = (minutes, condition) => {
    if (minutes < 0) throw new Error(`Expected seconds to be greater than 0, but got ${minutes}.`);
    if (condition < 0 || condition > 63) throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`);

    const rewardCondition = condition % 2 == 0 ? 'completion' : 'performance';
    const totalSessions = Math.min(minutesToSessions(minutes), 2); // we don't pay for more than 2 sessions/day
    let res = [];
    if (totalSessions >= 1) {
        res.push(earningsTypes.BREATH1);
    }
    if (totalSessions == 2) {
        const rewardType = rewardCondition === 'completion' ? earningsTypes.COMPLETION_BREATH2 : earningsTypes.PERFORMANCE_BREATH2;
        res.push(rewardType);
    }

    return res;
}

export const trainingQualityRewards = (sqliteDB, condition, latestQualityEarnings) => {
    if (condition < 0 || condition > 63) throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`);
    if (condition % 2 == 0) return completionQualityRewards(sqliteDB, latestQualityEarnings);
    return performanceQualityRewards(sqliteDB, sessionData);
}

const completionQualityRewards = (sqliteDb, latestQualityEarnings) => {
    const streakEarnings = latestQualityEarnings.filter(e => e.type === earningsTypes.STREAK_BONUS).pop(); // list should be ordered asc by date

    const lastStreakDateStr = streakEarnings ? streakEarnings.date : '1970-01-01';
    const lastStreakDate = dayjs.tz(lastStreakDateStr, 'YYYY-MM-DD', 'America/Los_Angeles');
    const threeDaysAgo = dayjs().tz('America/Los_Angeles').subtract(2, 'days').startOf('day'); // can only earn a streak bonus every three days, including today
    if (lastStreakDate.isSameOrAfter(threeDaysAgo, 'day')) {
        return null;
    }

    const stmt = sqliteDb.prepare(minutesPerDayQuery);
    const startDate = lastStreakDate.add(1, 'day');
    const minutesByDay = stmt.all(startDate.unix());
    if (minutesByDay.length < 3) return [];

    const earnings = [];
    for (let i=1; i<minutesByDay.length-1; i+=3) {
        const prevDay = dayjs.tz(minutesByDay[i-1].day, 'YYYY-MM-DD', 'America/Los_Angeles');
        const curDay = dayjs.tz(minutesByDay[i].day, 'YYYY-MM-DD', 'America/Los_Angeles');
        const nextDay = dayjs.tz(minutesByDay[i+1].day, 'YYYY-MM-DD', 'America/Los_Angeles');
        if (curDay.diff(prevDay, 'day') == 1 && 
            nextDay.diff(curDay, 'days') == 1 &&
            minutesByDay[i-1].minutes >= maxSessionMinutes &&
            minutesByDay[i].minutes >= maxSessionMinutes && 
            minutesByDay[i+1].minutes >= maxSessionMinutes)
        {
            earnings.push({day: nextDay.format('YYYY-MM-DD'), earnings: [earningsTypes.STREAK_BONUS]})
        } else {
            continue;
        }
    }
    return earnings;
}

const performanceQualityRewards = (sqliteDb, sessionData) => {
    const latestEligibleSessionTime = sessionData.pulseStartTime;
    const stmt = sqliteDb.prepare("SELECT emwave_session_id as emWaveSessionId, weighted_avg_coherence as weightedAvgCoherence, pulse_start_time as pulseStartTime, duration_sec as durationSec, emo_pic_name as emoPicName FROM emwave_sessions where pulse_start_time < ?");
    const res = stmt.all(latestEligibleSessionTime);
    if (res.length == 0) return null; // no other sessions means this is the first, which isn't eligible for this reward

    const sessions = realSessionsToAbstractSessions(res);

    // TODO get all existing completed sessions and see if this one is 
    // in 66th or 25th percentile

    return res;
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
        const sess = {
            emWaveSessionId: s.emWaveSessionId,
            startDateTime: s.pulseStartTime,
            durationSec: s.durationSec,
            avgCoherence: s.avgCoherence,
            weightedAvgCoherence: s.weightedAvgCoherence
        };
        if (durMin >= maxSessionMinutes) sess['isComplete'] = true;
        if (s.emoPicName) sess['emoPicName'] = s.emoPicName;
        results.push(sess);

        if (durMin < maxSessionMinutes) {
            const day = dayjs.unix(s.pulseStartTime).tz('America/Los_Angeles').format('YYYYMMDD');
            const sessionsForDay = daysToSessionsMap[day] || [];
            sessionsForDay.push({ durMin: durMin, startDateTime: s.pulseStartTime, durationSec: s.durationSec, coherence: s.weightedAvgCoherence });
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
                cohSum += s[i].coherence
            }
            results.push({startDateTime: startDateTime, durationSec: durationSec, weightedAvgCoherence: cohSum / s.length, isComplete: true, isAbstract: true});
        }
    }

    return results;
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