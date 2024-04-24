import { over, pullAt } from 'lodash';
import { 
    getRegimeStats,
    getRegimeId,
    getAllRegimeIds,
    getRegimesForDay,
    lookupRegime,
    getMinCoherencePacedRegimeId,
    isStageComplete,
    setRegimeBestCnt,
    getSegmentsAfterDate,
    saveRegimesForDay
} from "./breath-data";

/**
 * Handles regime selection and generation.
 * A regime specifies a particular pattern of breathing that a user should follow.
 * It is defined by four characteristics: total duration (typically five minutes),
 * pace (a certain number of breaths per minute),
 * a “hold position” (whether a user should pause after inhalation, after exhalation or not at all),
 * and whether or not the breathing pace should be randomized.
 * A randomized regime varies the length of each inhalation, exhalation, and hold (if specified)
 * but does so in a way that over the course of the total duration the average number of breaths
 * per minute matches the pace specified for the regime. A non-randomized regime makes all
 * inhalations and exhalations (and holds, if specified) the same length.
 */

// potential subject conditions
const condA = 'A';
const condB = 'B';

// The static paces that participants will breathe at on various days
const defaultDurationMs = 5 * 60 * 1000;
const aPaces = [4.615, 4.839, 5.085, 5.357, 5.66, 6];
const stage2ARegimes = aPaces.map(p => {
    return {durationMs: defaultDurationMs, breathsPerMinute: p, randomize: false};
});

const bPaces = [10.909, 11.538, 12.245, 13.043, 13.953, 15];
const stage2BRegimes = bPaces.map(p => {
    return {durationMs: defaultDurationMs, breathsPerMinute: p, randomize: true};
});

/**
 * Given a list of potential regimes, return a list of six regimes. (Unless there are no potential regimes,
 * in which case it returns an empty list.)
 * @param {Object} bestRegime the regime that is currently "best", or null if subjCondition is condB
 * @param {Array} potentialRegimes Array of regimes 
 * @param {string} subjCondition The experimental conditon the subject is assigned to
 * @returns A list of six regimes or an empty list.
 */
 function pickRegimes(bestRegime, potentialRegimes, subjCondition) {
    if (subjCondition !== condA) {
        throw new Error(`Unexpected subject condition '${subjCondition}'. Expected '${condA}'.`);
    }
    if (potentialRegimes.length === 0) {
        // then we have only one potential regime - the bestRegime
        // make some new ones
        const r = bestRegime;
        const bestTimes = r.isBestCnt + 1;
        const newPaceDiff = 1 / (2 ** bestTimes);
        const newLowRegime = Object.assign({}, r);
        delete(newLowRegime.id);
        newLowRegime.isBestCnt = 0;
        newLowRegime.breathsPerMinute -= newPaceDiff;
        if (newLowRegime.breathsPerMinute < 1) newLowRegime.breathsPerMinute = 1; // minimum permitted
        const newHighRegime = Object.assign({}, r);
        delete(newHighRegime.id);
        newHighRegime.isBestCnt = 0;
        newHighRegime.breathsPerMinute += newPaceDiff;
        if (newHighRegime.breathsPerMinute > 60) newHighRegime.breathsPerMinute = 60; // maximum permitted
        r.isBestCnt = bestTimes;

        // save new regimes + changes to old one
        setRegimeBestCnt(r.id, r.isBestCnt);

        const highRegimeId = getRegimeId(newHighRegime);
        const lowRegimeId = getRegimeId(newLowRegime);
        newHighRegime.id = highRegimeId;
        newLowRegime.id = lowRegimeId;

        return arrayShuffle([newLowRegime, r, newHighRegime, newLowRegime, r, newHighRegime]);
    }

    if (potentialRegimes.length < 5) {
        const bestSpot = Math.random() < 0.5 ? 'front' : 'back';
        const bestSlotCount = 6 - potentialRegimes.length;
        const bestArr = Array(bestSlotCount).fill(bestRegime);
        const remainingArr = arrayShuffle([...potentialRegimes]);
        if (bestSpot === 'front') {
            return [...bestArr, ...remainingArr];
        }
        return [...remainingArr, ...bestArr];
    }

    if (potentialRegimes.length === 5) {
        return arrayShuffle([bestRegime, ...potentialRegimes]);
    }

    // more than six options
    const options = [bestRegime, ...potentialRegimes];
    const chosenIdxs = [];
    const res = [];
    for (let i = 0; i < options.length; i++) chosenIdxs.push(i);
    arrayShuffle(chosenIdxs);
    for (let i = 0; i < 6; i++) {
        res.push(options[chosenIdxs.pop()]);
    }
    return res;
}

function arrayShuffle(arr) {
    let curIdx = arr.length;
    let randIdx;

    while (curIdx !== 0) {
        randIdx = Math.floor(Math.random() * curIdx);
        curIdx--;

        [arr[curIdx], arr[randIdx]] = [arr[randIdx], arr[curIdx]];
    }
    return arr;
}

/**
 * Generates a list of six regimes that the user should breathe under for at-home training for the given day.
 * The regimes are fixed for days 1-4, and after that they are dynamic, so do not try to generate regimes in
 * advance (i.e., only generate day 5 after the participant has done days 1-4). Throws an error if it is
 * unable to generate six applicable regimes.
 * @param {string} subjCondition The experimental condition the subject is assigned to.
 * @param {number} dayCount The day of training the subject is on. (Days of completed training completed + 1, not calendar days.)
 * @returns A list of six regimes.
 */
function generateRegimesForDay(subjCondition, stage) {
    if (subjCondition !== condA && subjCondition !== condB) {
        throw new Error(`Unexpected subject condition '${subjCondition}'. Expected either '${condA}' or '${condB}'.`);
    }

    if (stage != 2 && stage != 3) {
        throw new Error(`Only stages 2 and 3 are supported by generateRegimesForDay, not stage ${stage}.`)
    }

    let regimes;
    if (stage == 2 && !isStageComplete(stage)) {
        if (subjCondition === condA) {
            regimes = arrayShuffle(stage2ARegimes);
        } else {
            regimes = arrayShuffle(stage2BRegimes);
        }
    } else if (stage == 3 && !isStageComplete(stage)) {
        let bestRegimeId;
        
        if (subjCondition === condA) {
            const allRegimes = getAllRegimeIds(stage);
            const regimeStats = allRegimes.map(id => getRegimeStats(id));
            let targetAvgCoherence = -10000;
        
            regimeStats.forEach(rs => {
                if (rs.mean > targetAvgCoherence) {
                    targetAvgCoherence = rs.mean;
                    bestRegimeId = rs.id;
                }
            });
            const overlappingRegimes = regimeStats.filter(s => isNaN(s.low90CI) || isNaN(s.high90CI) || (s.low90CI <= targetAvgCoherence && s.high90CI >= targetAvgCoherence && s.id !== bestRegimeId));
            regimes = pickRegimes(lookupRegime(bestRegimeId), overlappingRegimes.map(olr => lookupRegime(olr.id)), subjCondition);
            if (regimes.length === 0) throw new Error('Found 0 possible regimes for training.');
        } else {
            bestRegimeId = getMinCoherencePacedRegimeId(2);
            const targetRegime = lookupRegime(bestRegimeId);
            regimes = Array(6).fill(targetRegime, 0);
        }
    } else {
        return [];
    }
    saveRegimesForDay(regimes, new Date());
    return regimes;
}

const maxSessionDuration = 15 * 60 * 1000; // we should never have a session longer than 15 minutes

function filterRegimesByAvailableSessionTime(regimes) {
    const regimesForSession = [];
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(23); midnight.setMinutes(59); midnight.setSeconds(59);
    const msRemainingToday = midnight - now;
    const availableMs = Math.min(msRemainingToday, maxSessionDuration);
    let totalDurationMs = 0;
    for (let i = 0; i < regimes.length; i++) {
        const r = regimes[i];
        if ((totalDurationMs + r.durationMs) <= availableMs) {
            regimesForSession.push(r);
            totalDurationMs += r.durationMs;
        } else {
            break;
        }
    }
    return regimesForSession;
}

function getRegimesForSession(subjCondition, stage) {
    // first, check to see if we've already generated regimes for today    
    const regimesForToday = getRegimesForDay(new Date());
    if (regimesForToday.length > 0 && regimesForToday.length !== 6) {
        throw new Error(`Expected to have six regimes but found ${regimesForToday.length}`);
    }

    let regimesForSession;

    // if we do have generated regimes for today, figure out which ones haven't been done
    if (regimesForToday.length > 0) {
        const startOfDay = new Date();
        startOfDay.setHours(0); startOfDay.setMinutes(0); startOfDay.setSeconds(0);
        const regimesDoneToday = getSegmentsAfterDate(startOfDay, stage);
        const remainingToDo = filterCompletedRegimes(regimesForToday, regimesDoneToday);
        regimesForSession = filterRegimesByAvailableSessionTime(remainingToDo);
    } else {
        // we have no regimes; generate some
        const newRegimes = generateRegimesForDay(subjCondition, stage);
        newRegimes.forEach(r => r.id = getRegimeId(r));
        regimesForSession = filterRegimesByAvailableSessionTime(newRegimes);
    }

    return regimesForSession;
    
}

/**
 * Given a list of regimes the participant is supposed to do and a list she has actually done,
 * return a list of the regimes remaining to be done today. Note that a given regime may be
 * assigned more than once in a day, so to be completely removed from the list it must have been
 * done as many times as it was assigned. Regimes done at least once but fewer times than assigned
 * will be removed from the list from left to right. Regimes are compared by id.
 * @param {Object[]} regimesForToday Regimes the participant has been assigned to do today
 * @param {Object[]} regimesDoneToday Regimes the participant has actually done today
 */
function filterCompletedRegimes(regimesForToday, regimesDoneToday) {
    const res = [...regimesForToday];
    const toPull = [];
    const forTodayIds = regimesForToday.map(r => r.id);
    const doneTodayIds = regimesDoneToday.map(r => r.regimeId);
    forTodayIds.forEach((t, todayIdx) => {
        const doneIdx = doneTodayIds.findIndex(d => d == t);
        if (doneIdx !== -1) {
            pullAt(doneTodayIds, doneIdx);
            toPull.push(todayIdx);
        }
    });
    pullAt(res, toPull);
    return res;
}

export { generateRegimesForDay, getRegimesForSession }

export const forTesting = { 
    condA,
    condB,
    stage2ARegimes,
    stage2BRegimes,
    maxSessionDuration
}