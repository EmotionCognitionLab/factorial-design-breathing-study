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

const minutesPerDay = (sqliteDb, startTime) => {
    const stmt = sqliteDb.prepare('select pulse_start_time, duration_seconds from emwave_sessions where stage = 2 and pulse_start_time > ?');
    const results = stmt.all(startTime);
    const minutesByDay = {};
    for (const r of results) {
        const day = dayjs.unix(r.pulse_start_time).tz('America/Los_Angeles').format('YYYY-MM-DD');
        const minutes = minutesByDay[day] || 0;
        minutesByDay[day] = minutes + Math.round(r.duration_seconds / 60);
    }

    return Object.keys(minutesByDay).sort((a, b) => a - b).map(day => ({day: day, minutes: minutesByDay[day]}));
}

// A "session" is 18 minutes long, but may
// be broken up across multiple actual sessions.
// Given a number of minutes, converts it to a
// number of 18 minute abstract sessions
const minutesToSessions = (minutes) => {
    return Math.floor(minutes / maxSessionMinutes);
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
        startDay = dayjs(latestTimeEarnings.date).tz('America/Los_Angeles').startOf('day');
    } else {
        // there's no other time-based reward for this day - move to the next one
        startDay = dayjs(latestTimeEarnings.date).tz('America/Los_Angeles').endOf('day').add(1, 'second');
    }

    const results = minutesPerDay(sqliteDb, startDay.unix());
    const newEarnings = []
    for (const res of results) {
        let earningsForDay = trainingTimeEarningsForDay(res.minutes, condition);
        const earningsDay = dayjs.tz(res.day, 'YYYY-MM-DD', 'America/Los_Angeles');
        // make sure we aren't double-paying for the first session while processing the second
        earningsForDay = earningsForDay.filter(e => {
            if (!latestTimeEarnings) return true;
            return `${earningsDay.format()}|${e}` !== `${latestTimeEarnings.date}|${latestTimeEarnings.type}`
        });
        
        for (const earningsType of earningsForDay) {
            newEarnings.push({day: earningsDay.format(), earnings: earningsType})
        }
        
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

export const trainingQualityRewards = (sqliteDB, condition, latestQualityEarnings, eligibleSessions, priorCoherenceValues) => {
    if (condition < 0 || condition > 63) throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`);
    if (condition % 2 == 0) return completionQualityRewards(sqliteDB, latestQualityEarnings);
    return performanceQualityRewards(eligibleSessions, priorCoherenceValues);
}

const completionQualityRewards = (sqliteDb, latestQualityEarnings) => {
    if (latestQualityEarnings && latestQualityEarnings.type !== earningsTypes.STREAK_BONUS) {
        throw new Error(`Latest earning type is invalid for completion quality reward. Expected ${earningsTypes.STREAK_BONUS}, but got ${latestQualityEarnings.type}.`);
    }

    const lastStreakDateStr = latestQualityEarnings ? latestQualityEarnings.date : '1970-01-01T00:00:00-07:00';
    const lastStreakDate = dayjs(lastStreakDateStr);
    const threeDaysAgo = dayjs().tz('America/Los_Angeles').subtract(2, 'days').startOf('day'); // can only earn a streak bonus every three days, including today
    if (lastStreakDate.isSameOrAfter(threeDaysAgo, 'day')) {
        return [];
    }

    const startDate = lastStreakDate.add(1, 'day');
    const minutesByDay = minutesPerDay(sqliteDb, startDate.unix());
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
            earnings.push({day: nextDay.format(), earnings: earningsTypes.STREAK_BONUS})
        } else {
            continue;
        }
    }
    return earnings;
}

const performanceQualityRewards = (eligibleSessions, priorCoherenceValues) => {
    const earnings = [];

    const comparisonCoherenceValues = priorCoherenceValues.toSorted((a,b) => b - a); // sort descending
    for (const s of eligibleSessions) {
        if (comparisonCoherenceValues.length > 0) {
            const earnDate = dayjs.unix(s.startDateTime).tz('America/Los_Angeles');
            const sixSixIdx = Math.ceil(.66 * comparisonCoherenceValues.length) - 1;
            const twoFiveIdx = Math.ceil(.25 * comparisonCoherenceValues.length) - 1;
            if (twoFiveIdx < 0 || s.weightedAvgCoherence >= comparisonCoherenceValues[twoFiveIdx]) {
                earnings.push({day: earnDate.format(), earnings: earningsTypes.TOP_25})
            } else if (sixSixIdx < 0 || s.weightedAvgCoherence >= comparisonCoherenceValues[sixSixIdx]) {
                earnings.push({day: earnDate.format(), earnings: earningsTypes.TOP_66});
            }
        }
        
        // add current weightedAvgCoherence to our priors so that it's included in next comparison
        let insertIdx = comparisonCoherenceValues.findIndex(cv => cv < s.weightedAvgCoherence);
        if (insertIdx == -1) insertIdx = comparisonCoherenceValues.length;
        comparisonCoherenceValues.splice(insertIdx, 0, s.weightedAvgCoherence);
    }

    return earnings;
}

export const visitRewards = (sqliteDb, visitNum) => {
    if (visitNum != 1 && visitNum != 2) throw new Error(`Invalid visit number. Expected 1 or 2 but got ${visitNum}.`);
    const stage = visitNum == 1 ? 1 : 3;

    const stmt = sqliteDb.prepare('select max(pulse_start_time) as pulseStartTime from emwave_sessions where stage = ?');
    const res = stmt.get(stage);
    if (res.pulseStartTime) {
        const earnType = stage == 1 ? earningsTypes.VISIT_1 : earningsTypes.VISIT_2;
        return [ {day: dayjs.unix(res.pulseStartTime).tz('America/Los_Angeles').format(), earnings: earnType} ];
    }
    return [];
}
