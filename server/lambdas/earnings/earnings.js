import { dynamoDocClient as docClient } from "../common/aws-clients.js";
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';
import dayjs from 'dayjs';
import { earningsTypes } from '../../../common/types/types.js';

const db = new Db();
db.docClient = docClient;

export async function handler() {
    const users = await db.getAllUsers(); // need to include those who have finished

    for (const u of users) {
        try {
            const earnings = await db.earningsForUser(u.userId);
            // breathing
            const breathEarnings = earnings.filter(e => e.type === earningsTypes.BREATH1 || e.type === earningsTypes.BREATH2);
            // should be sorted by date asc, so last should be most recent
            const lastBreathEarningsDate = breathEarnings.length > 0 ? dayjs(breathEarnings.slice(-1)[0].date).tz('America/Los_Angeles') : null;
            const streakEarnings = earnings.filter(e => e.type === earningsTypes.STREAK_BONUS1 || e.type === earningsTypes.STREAK_BONUS2);
            const lastStreakEarningsDate = streakEarnings.length > 0 ? dayjs(streakEarnings.slice(-1)[0].date).tz('America/Los_Angeles') : null;
            await saveEarnings(u.userId, lastBreathEarningsDate, lastStreakEarningsDate);
        } catch (err) {
            console.error(`Error calculating earnings for user ${u.userId}.`, err);
        }
    }
}

/**
 * Calculates and saves regular earnings and streak bonuses for a given user.
 * Users are paid $7 for every 3 segments they do in a given day.
 * They receive a streak bonus of $3 on the sixth consecutive day of
 * practice, and a streak bonus of $5 for each consecutive day thereafter.
 * @param {string} userId 
 * @param {object} lastBreathEarningsDate dayjs object or null
 * @param {object} lastStreakEarningsDate dayjs object or null
 */
async function saveEarnings(userId, lastBreathEarningsDate, lastStreakEarningsDate) {
    const yesterday = dayjs().subtract(1, 'day').endOf('day').tz('America/Los_Angeles');
    const startDate = dayjs('1970-01-01').tz('America/Los_Angeles');
    const breathSegs = await db.segmentsForUser(userId, null, startDate.toDate(), yesterday.toDate());
    const breathSegsByDate = {};
    breathSegs.forEach(bs => {
        const date = dayjs(bs.endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        const segs = breathSegsByDate[date] || 0;
        breathSegsByDate[date] = segs + 1;
    });
    for (const [date, segCount] of Object.entries(breathSegsByDate) ) {
        if (lastBreathEarningsDate != null && !dayjs(date).isAfter(lastBreathEarningsDate)) continue;
        if (segCount >= 3) await db.saveEarnings(userId, earningsTypes.BREATH1, date);
        if (segCount >= 6) await db.saveEarnings(userId, earningsTypes.BREATH2, date);
    }

    // streaks
    const dates = Object.keys(breathSegsByDate);
    let consecutiveDayCount = 1;
    for (let i = 0; i<dates.length; i++) {
        if (i == 0 || 
            (
                lastStreakEarningsDate != null && 
                !(dayjs(dates[i])).tz('America/Los_Angeles').isAfter(lastStreakEarningsDate))
            ) 
        {
            continue;
        }

        if (breathSegsByDate[dates[i]] >= 6 && isConsecutive(dates[i-1], dates[i])) {
            consecutiveDayCount++;
        } else {
            consecutiveDayCount = 1;
        }
        if (lastStreakEarningsDate == null && consecutiveDayCount == 6) {
            await db.saveEarnings(userId, earningsTypes.STREAK_BONUS1, dates[i]);
        } else if (consecutiveDayCount > 6) {
            await db.saveEarnings(userId, earningsTypes.STREAK_BONUS2, dates[i]);
        }
    }
    
}

function isConsecutive(date1, date2) {
    return Math.abs(dayjs(date2).diff(dayjs(date1), 'day')) == 1
}