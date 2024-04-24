import { generateRegimesForDay, getRegimesForSession, forTesting } from "../src/regimes.js";

function regimesEqual(r1, r2) {
    if (Object.entries(r1).length !== Object.entries(r2).length) return false;
    const mandatoryProps = ["durationMs", "breathsPerMinute", "randomize"];
    for (let prop of mandatoryProps) {
        if (!r1.hasOwnProperty(prop)) return false;
        if (!r2.hasOwnProperty(prop)) return false;
        if (r1[prop] !== r2[prop]) return false;
    }
    if (r1.hasOwnProperty("holdPos") && !r2.hasOwnProperty("holdPos")) return false;
    if (!r1.hasOwnProperty("holdPos") && r2.hasOwnProperty("holdPos")) return false;
    if (r1.hasOwnProperty("holdPos") && r1["holdPos"] !== r2["holdPos"]) return false;

    return true;
}

// TODO re-write all tests for generateRegimesForDay as calls to getRegimesForSession
describe("Generating regimes for a given day and experimental condition", () => {
    it("should throw an error if the condition is neither a nor b", () => {
        expect(() => {
            generateRegimesForDay('foo');
        }).toThrow();
    });
});

describe.each([
    {condition: forTesting.condA, expectedRegimes: forTesting.stage2ARegimes},
    {condition: forTesting.condB, expectedRegimes: forTesting.stage2BRegimes},
])("Regimes for condition $condition, stage 2", ({condition, expectedRegimes}) => {
    it("should match the expected static regimes for the condition in stage 2", () => {
        const res = generateRegimesForDay(condition, 2);
        expect(res.length).toBe(6);
        for (let expectedRegime of expectedRegimes) {
            const expectedFoundTimes = res.filter(receivedRegime => regimesEqual(receivedRegime, expectedRegime)).length;
            expect(expectedFoundTimes).toBe(1);
        }
    });
});

jest.mock('../src/breath-data.js', () => ({
    getAvgRestCoherence: jest.fn(() => 0.0),
    getRegimeStats: jest.fn(() => {}),
    getAllRegimeIds: jest.fn(() => [1,2,3]),
    lookupRegime: jest.fn(id => ( {id: id, durationMs: 300000} )),
    setRegimeBestCnt: jest.fn(() => {}),
    getRegimeId: jest.fn(() =>  Math.floor(Math.random() * 100) + 5),
    getRegimesForDay: jest.fn(() => []),
    getSegmentsAfterDate: jest.fn(() => []),
    getTrainingDayCount: jest.fn(() => -1),
    saveRegimesForDay: jest.fn(() => {}),
    getMinCoherencePacedRegimeId: jest.fn(() => -1),
    isStageComplete: jest.fn(() => false)
}));

import { getAvgRestCoherence, getRegimeStats, lookupRegime, setRegimeBestCnt, getRegimeId, getAllRegimeIds, saveRegimesForDay, getMinCoherencePacedRegimeId, isStageComplete } from '../src/breath-data';

describe("Generating regimes for stage 3", () => {
    it("should return the regime with the lowest average coherence in stage 2 when the condition is b", () => {
        const targetRegimeId = 3;
        getMinCoherencePacedRegimeId.mockReturnValueOnce(targetRegimeId);
        const res = generateRegimesForDay(forTesting.condB, 3);
        expect(res.length).toBe(6);
        expect(res.every(r => r.id === targetRegimeId)).toBeTruthy();
    });

    it("should generate two new regimes when the condition is a and zero regimes have a confidence interval overlapping the highest average coherence (other than the regime with the highest average coherence, which overlaps itself)", () => {
        const regimeStats = [
            // if you change this make sure the first entry is always the highest avg coherence
            {id: 1, mean: 2.7, low90CI: 2.6, high90CI: 3.0}, 
            {id: 2, mean: 1.7, low90CI: 1.6, high90CI: 1.9},
            {id: 3, mean: 0.9, low90CI: 0.6, high90CI: 1.2}
        ];
        getRegimeStats.mockImplementation(id => regimeStats.find(rs => rs.id === id));
        const fakeBpm = (someVal) => someVal * 4;
        const defaultIsBestCnt = 1;
        lookupRegime.mockImplementationOnce(id => ({id: id, breathsPerMinute: fakeBpm(id), isBestCnt: defaultIsBestCnt}));
        const res = generateRegimesForDay(forTesting.condA, 3);

        expect(res.length).toBe(6);
        expect(setRegimeBestCnt).toHaveBeenCalledWith(regimeStats[0].id, defaultIsBestCnt + 1);

        const expectedBpmDiff = 1 / (2 ** (defaultIsBestCnt + 1));
        expect(res.filter(r => r.breathsPerMinute == fakeBpm(regimeStats[0].id) - expectedBpmDiff).length).toBe(2);
        expect(res.filter(r => r.breathsPerMinute == fakeBpm(regimeStats[0].id)).length).toBe(2);
        expect(res.filter(r => r.breathsPerMinute == fakeBpm(regimeStats[0].id) + expectedBpmDiff).length).toBe(2);

        expect(getRegimeId).toHaveBeenCalledTimes(2);
        const call1 = getRegimeId.mock.calls[0][0];
        expect(call1.breathsPerMinute).toBe(fakeBpm(regimeStats[0].id) + expectedBpmDiff);
        expect(call1.isBestCnt).toBe(0);
        const call2 = getRegimeId.mock.calls[1][0];
        expect(call2.breathsPerMinute).toBe(fakeBpm(regimeStats[0].id) - expectedBpmDiff);
        expect(call2.isBestCnt).toBe(0);
    });

    it("should use is_best_cnt when generating new regimes in condition a with only one overlapping confidence interval", () => {
        const regimeStats = [
            // if you change this make sure the first entry is always the highest avg coherence
            {id: 1, mean: 2.7, low90CI: 2.6, high90CI: 3.0}, 
            {id: 2, mean: 1.7, low90CI: 1.6, high90CI: 1.9},
            {id: 3, mean: 0.9, low90CI: 0.6, high90CI: 1.2}
        ];
        getRegimeStats.mockImplementation(id => regimeStats.find(rs => rs.id === id));
        const defaultBpm = 6;
        const defaultIsBestCnt = 2;
        lookupRegime.mockImplementationOnce(id => ({id: id, breathsPerMinute: defaultBpm, isBestCnt: defaultIsBestCnt}));
        const res = generateRegimesForDay(forTesting.condA, 3);

        expect(res.length).toBe(6);
        const expectedBpmDiff = 1 / (2 ** (defaultIsBestCnt + 1));
        expect(res.filter(r => r.breathsPerMinute == defaultBpm - expectedBpmDiff).length).toBe(2);
        expect(res.filter(r => r.breathsPerMinute == defaultBpm).length).toBe(2);
        expect(res.filter(r => r.breathsPerMinute == defaultBpm + expectedBpmDiff).length).toBe(2);
    });

    it("should include regimes whose mean and confidence interval can't be calculated along with any overlapping regimes", () => {
        const avgRestCoherence = 2.8;
        getAvgRestCoherence.mockReturnValueOnce(avgRestCoherence);
        const regimeStats = [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: NaN, low90CI: NaN, high90CI: NaN},
            {id: 3, mean: 0.9, low90CI: 0.4, high90CI: 1.2}
        ];
        getRegimeStats.mockImplementation(id => regimeStats.find(rs => rs.id === id));
        const expectedRegimeIds = [1,2];
        const res = generateRegimesForDay(forTesting.condA, 3);
        const resIds = res.map(r => r.id);
        expect(res.length).toBe(6);
        expect(expectedRegimeIds.every(erId => resIds.includes(erId))).toBeTruthy();
        expect(resIds.every(rid => expectedRegimeIds.includes(rid))).toBeTruthy();
    });

    describe.each([
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 2, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 0.9, low90CI: 0.6, high90CI: 1.0}
        ]},
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 3, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 1.9, low90CI: 1.6, high90CI: 2.3}
        ]},
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 4, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 1.9, low90CI: 1.6, high90CI: 2.3},
            {id: 4, mean: 1.8, low90CI: 1.6, high90CI: 2.2}
        ]},
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 5, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 1.9, low90CI: 1.6, high90CI: 2.3},
            {id: 4, mean: 1.8, low90CI: 1.6, high90CI: 2.2},
            {id: 5, mean: 2.0, low90CI: 2.0, high90CI: 2.21}
        ]},
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 6, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 1.9, low90CI: 1.6, high90CI: 2.3},
            {id: 4, mean: 1.8, low90CI: 1.6, high90CI: 2.2},
            {id: 5, mean: 2.0, low90CI: 2.0, high90CI: 2.21},
            {id: 6, mean: 2.15, low90CI: 1.77, high90CI: 2.3}
        ]},
        {condition: forTesting.condA, avgRestCoherence: null, overlapCnt: 7, regimeStats: [
            {id: 1, mean: 2.2, low90CI: 2.1, high90CI: 3.0},
            {id: 2, mean: 2.0, low90CI: 1.8, high90CI: 2.4},
            {id: 3, mean: 1.9, low90CI: 1.6, high90CI: 2.3},
            {id: 4, mean: 1.8, low90CI: 1.6, high90CI: 2.2},
            {id: 5, mean: 2.0, low90CI: 2.0, high90CI: 2.21},
            {id: 6, mean: 2.15, low90CI: 1.77, high90CI: 2.3},
            {id: 7, mean: 1.76, low90CI: 1.5, high90CI: 2.2}
        ]},
    ])("for condition $condition with $overlapCnt overlapping regimes", ({condition, avgRestCoherence, overlapCnt, regimeStats}) => {
        it("should use the overlapping regimes (and only the overlapping regimes)", () => {
            const allRegimeIds = regimeStats.map(rs => rs.id);
            getAllRegimeIds.mockImplementation(() => allRegimeIds);
            getAvgRestCoherence.mockReturnValue(avgRestCoherence);
            getRegimeStats.mockImplementation(id => regimeStats.find(rs => rs.id === id));
            let targetCoh = condition === forTesting.condA ? Math.max(...(regimeStats.map(rs => rs.mean))) : avgRestCoherence;
            const expectedRegimes = regimeStats.filter(rs => rs.low90CI <= targetCoh && rs.high90CI >= targetCoh);
            const res = generateRegimesForDay(condition, 3);
            expect(res.length).toBe(6);
            const expectedRegimeIds = expectedRegimes.map(er => er.id);
            expect(res.every(receivedRegime => expectedRegimeIds.includes(receivedRegime.id))).toBeTruthy();
            const receivedRegimeIds = res.map(r => r.id);
            if (condition === forTesting.condA) {
                let bestRegimeId = regimeStats[0].id;
                let bestMean = regimeStats[0].mean;
                expectedRegimeIds.splice(expectedRegimeIds.indexOf(bestRegimeId), 1);

                if (overlapCnt <= 6) {
                    expect(expectedRegimeIds.every(id => receivedRegimeIds.includes(id))).toBeTruthy();
                }
                regimeStats.forEach(rs => {
                    if (rs.mean > bestMean) {
                        bestRegimeId = rs.id;
                        bestMean = rs.mean;
                    }
                });
                if (overlapCnt < 6 && overlapCnt > 1) {
                    const bestRepeats = 6 - overlapCnt;
                    expect(receivedRegimeIds[0] === bestRegimeId || receivedRegimeIds[5] === bestRegimeId).toBeTruthy();
                    if (receivedRegimeIds[0] === bestRegimeId) {
                        expect(receivedRegimeIds.slice(0, bestRepeats)).toEqual(Array(bestRepeats).fill(bestRegimeId));
                    } else if (receivedRegimeIds[5] == bestRegimeId) {
                        expect(receivedRegimeIds.slice(-bestRepeats)).toEqual(Array(bestRepeats).fill(bestRegimeId));
                    }
                }

                if (overlapCnt == 6) {
                    // we already checked that the received regimes contain all of the expected regimes
                    // other than the best regime, so just check that here
                    expect(receivedRegimeIds.includes(bestRegimeId)).toBeTruthy();
                }
    
                if (overlapCnt > 6) {
                    const idCount = {};
                    res.forEach(r => idCount[r.id] = idCount[r.id] ? idCount[r.id] + 1 : 1);
                    // make sure no regime appears more than once
                    expect(Object.values(idCount).every(cnt => cnt == 1)).toBeTruthy();
                }
            }
            if (condition === forTesting.condB) {
                if (overlapCnt <= 6) { // if we have more than 6 regimes to pick from we aren't going to use all of them
                    expect(expectedRegimeIds.every(id => receivedRegimeIds.includes(id))).toBeTruthy();
                }
                if (6 % overlapCnt === 0) {
                    // check that every regime is evenly represented
                    const idCount = {};
                    res.forEach(r => idCount[r.id] = idCount[r.id] ? idCount[r.id] + 1 : 1);
                    expect(Object.values(idCount).every(v => v === 6 / Object.keys(idCount).length)).toBeTruthy();
                }
            }
        });
    });
});

import { getRegimesForDay, getSegmentsAfterDate, getTrainingDayCount } from '../src/breath-data';

/**
 * Given a list of regimes, return those that can be completed within durationMs.
 * @param {*} regimes 
 * @param {*} durationMs 
 */
function getRegimesForDuration(regimes, durationMs) {
    const regimeTimeRunningSum = regimes.reduce((prev, cur) => {
        prev.push(cur.durationMs + prev[prev.length - 1]);
        return prev;
     }, [0]).slice(1);
    return regimes.map((r, idx) => regimeTimeRunningSum[idx] <= durationMs ? r : -1).filter(i => i != -1);
}

describe("getRegimesForSession", () => {

    const makeRegime = (id) => ({id: id, durationMs: 300000});

    beforeAll(() => {
        // so that tests don't inadvertently break if run too close to midnight,
        // causing filterRegimesByAvailableSessionTime to filter out some regimes
        // that should be in
        const date = new Date();
        date.setHours(0); date.setMinutes(0); date.setSeconds(0);
        jest.useFakeTimers("modern");
        jest.setSystemTime(date);
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    it("should throw if the number of regimes for the day is > 0 and !== 6", () => {
        const regimeSets = [[3,5], [1,2,3,4,5,6,7]]
        regimeSets.forEach(rs => {
            const regimes = rs.map(makeRegime);
            getRegimesForDay.mockImplementation(() => regimes);
            expect(() => {
                getRegimesForSession('a');
            }).toThrow();   
        }); 
    });

    it("should filter out regimes already done today", () => {
        const regimeIds = [1,2,3,4,5,6];
        const regimes = regimeIds.map(makeRegime);
        getRegimesForDay.mockImplementation(() => regimes);
        
        
        const doneSegments = regimeIds.slice(0,3).map(id => ({regimeId: id}));
        getSegmentsAfterDate.mockImplementation(() => doneSegments);

        const expectedRegimes = [];
        regimes.forEach((r, idx) => {
            if (idx > doneSegments.length - 1 || r.id !== doneSegments[idx].regimeId) {
                expectedRegimes.push(r);
            }
        });

        const stage = 2;
        const forSession = getRegimesForSession('b', stage);
        const today = new Date();
        today.setHours(0); today.setMinutes(0); today.setSeconds(0);
        expect(getSegmentsAfterDate).toHaveBeenCalledWith(today, stage);
        expect(forSession).toEqual(expectedRegimes);
    });

    it("should filter out a regime already done today only the number of times it has been done", () => {
        const regimeIds = [1,1,1,1,2,3];
        const regimes = regimeIds.map(makeRegime);
        getRegimesForDay.mockImplementation(() => regimes);

        const doneSegments = regimeIds.slice(0, 3).map(id => ({regimeId: id}));
        getSegmentsAfterDate.mockImplementation(() => doneSegments);

        const expectedRegimes = [];
        regimes.forEach((r, idx) => {
            if (idx > doneSegments.length - 1 || r.id !== doneSegments[idx].regimeId) {
                expectedRegimes.push(r);
            }
        });
        const forSession = getRegimesForSession('a');
        expect(forSession).toEqual(expectedRegimes);
    });

    it("should filter out all done regimes even if they were not done in the expected order", () => {
        const regimeIds = [2,3,2,4,3,4];
        const regimes = regimeIds.map(makeRegime);
        getRegimesForDay.mockImplementation(() => regimes);

        const doneSegments = [2,2,3,3,4,4].map(id => ({regimeId: id}));

        getSegmentsAfterDate.mockImplementation(() => doneSegments);

        const forSession = getRegimesForSession('a', 3);
        expect(forSession).toEqual([]);
    });

    it("should filter out all done regimes even if some were done more often than expected", () => {
        const regimeIds = [2,3,2,4,3,4];
        const regimes = regimeIds.map(makeRegime);
        getRegimesForDay.mockImplementation(() => regimes);

        const doneSegments = [2,3,2,4,4,3,4].map(id => ({regimeId: id}));

        getSegmentsAfterDate.mockImplementation(() => doneSegments);

        const forSession = getRegimesForSession('a', 3);
        expect(forSession).toEqual([]);
    });

    it("should never return more than 15 minutes worth of regimes", () => {
        const regimeIds = [3,4,5,6];
        const regimes = [{id: 1, durationMs: 800000}, {id: 2, durationMs: 100000}];
        regimes.push(...regimeIds.map(makeRegime));
        getRegimesForDay.mockImplementation(() => regimes);
        getSegmentsAfterDate.mockImplementation(() => []);
        
        const expectedRegimes = getRegimesForDuration(regimes,  15 * 60 * 1000);
        
        const forSession = getRegimesForSession('b');
        expect(forSession).toEqual(expectedRegimes);
    });

    it("should never return a session that can't be completed by midnight", () => {
        const regimeIds = [1,2,3,4,5,6];
        const regimes = regimeIds.map(makeRegime);
        getRegimesForDay.mockImplementation(() => regimes);

        const date = new Date();
        date.setHours(23); date.setMinutes(54); date.setSeconds(0);
        jest.setSystemTime(date);

        const midnight = new Date();
        midnight.setHours(23); midnight.setMinutes(59); midnight.setSeconds(59);
        const msRemainingToday = midnight.getTime() - date.getTime();
        const expectedRegimes = getRegimesForDuration(regimes, msRemainingToday);
       
        getSegmentsAfterDate.mockImplementation(() => []);
        const forSession = getRegimesForSession('b');
        expect(forSession).toEqual(expectedRegimes);
    });

    it("should not return a session that can't be completed by midnight even for the first session of the day", () => {
        getRegimesForDay.mockImplementation(() => []);
        getSegmentsAfterDate.mockImplementation(() => []);
        getTrainingDayCount.mockImplementation(() => 0);

        const date = new Date();
        date.setHours(23); date.setMinutes(54); date.setSeconds(0);
        jest.setSystemTime(date);

        const midnight = new Date();
        midnight.setHours(23); midnight.setMinutes(59); midnight.setSeconds(59);
        const msRemainingToday = midnight.getTime() - date.getTime();
        
        getRegimeStats.mockImplementation((regimeId) => ({ id: regimeId, mean: NaN, low90CI: NaN, high90CI: NaN }))
        const forSession = getRegimesForSession('A', 3);
        const sessionDuration = forSession.reduce((prev, cur) => prev.durationMs + cur.durationMs, {durationMs: 0});
        expect(sessionDuration).toBeLessThanOrEqual(msRemainingToday);
    });

    it("should call saveRegimesForDay", () => {
        getRegimesForDay.mockImplementation(() => []);
        getSegmentsAfterDate.mockImplementation(() => []);
        getTrainingDayCount.mockImplementation(() => 0);
        const forSession = getRegimesForSession('A', 3);
        expect(saveRegimesForDay).toHaveBeenCalled();
    });

    it("should return an empty array if stage 3 is complete", () => {
        getRegimesForDay.mockImplementation(() => []);
        isStageComplete.mockImplementationOnce(() => true)
        const forSession = getRegimesForSession('B', 3);
        expect(forSession.length).toBe(0);
    });
});