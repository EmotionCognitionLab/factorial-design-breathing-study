'use strict';

import { forTesting, trainingQualityRewards, trainingTimeRewards } from "../earnings.js"
import { earningsTypes, maxSessionMinutes } from '../../../../common/types/types.js';
import dayjs from 'dayjs';

const customParseFormat = require('dayjs/plugin/customParseFormat.js');
dayjs.extend(customParseFormat);

const mockEarningsForUser = jest.fn(() => []);
const mockGetAllUsers = jest.fn(() => []);
const mockSaveEarnings = jest.fn(() => {});
const mockSegmentsForUser = jest.fn(() => []);

const dbMocks = [mockEarningsForUser, mockGetAllUsers, mockSaveEarnings, mockSegmentsForUser];

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            earningsForUser: (userId, earnType) => mockEarningsForUser(userId, earnType),
            getAllUsers: () => mockGetAllUsers(),
            saveEarnings: (userId, earningsType, dateDone) => mockSaveEarnings(userId, earningsType, dateDone),
            segmentsForUser: (userId, stage, startDate, endDate) => mockSegmentsForUser(userId, stage, startDate, endDate),
        };
    });
});

describe("quality rewards", () => {
    const allMock = jest.fn(() => [{}]);
    const sqliteMock = {
        prepare: () => ({ all: allMock})
    };

    afterEach(() => {
        allMock.mockClear();
    });

    const latestQualityEarnings = [{
        userId: 'abc123',
        date: '2024-03-09', 
        type: earningsTypes.STREAK_BONUS,
        amount: 5
    }];

    it("should throw an error if the condition is < 0", () => {
        expect(() => trainingQualityRewards(sqliteMock, -9, latestQualityEarnings)).toThrow();
    });

    it("should throw an error if the condition is > 63", () => {
        expect(() => trainingQualityRewards(sqliteMock, 72, latestQualityEarnings)).toThrow();
    });

    describe("for completion conditions", () => {
        it("should not be granted if they have received a streak bonus in the prior three days", () => {
            const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
            const latestEarnings = [{ userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: yesterday }];

            const res = trainingQualityRewards(sqliteMock, 2, latestEarnings);
            expect(sqliteMock.prepare().all).not.toHaveBeenCalled();
            expect(res).toBeNull();
        });

        it(`should not be granted if they have not done at least ${maxSessionMinutes} minutes of training each of the prior three days`, () => {
            const trainingMinutesPerDay = [18, 0, 19];

            const forDay = dayjs();
            const threeDaysAgo = forDay.startOf('day').subtract(2, 'days');
            const dbResults = [];
            for (let i=0; i<3; i++) {
                const day = threeDaysAgo.add(i, 'days');
                dbResults.push({day: day.format('YYYY-MM-DD'), minutes: trainingMinutesPerDay[i]});
            }
            allMock.mockReturnValueOnce(dbResults);

            const lastStreakDate = dayjs.tz('2024-03-02', 'YYYY-MM-DD', 'America/Los_Angeles');
            const res = trainingQualityRewards(sqliteMock, 2, [{ userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: lastStreakDate.format('YYYY-MM-DD') }]);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(allMock.mock.calls[0][0]).toBe(lastStreakDate.add(1, 'day').unix());
            expect(res).toStrictEqual([]);
        });

        it(`should be granted if they have done at least ${maxSessionMinutes} minutes of training each of the prior three days and have not received a streak bonus in that time`, () => {
            const forDay = dayjs();
            const threeDaysAgo = forDay.startOf('day').subtract(2, 'days');
            const dbResults = [];
            for (let i=0; i<3; i++) {
                const day = threeDaysAgo.add(i, 'days');
                dbResults.push({day: day.format('YYYY-MM-DD'), minutes: 18});
            }
            allMock.mockReturnValueOnce(dbResults);

            const lastStreakDate = dayjs.tz('2024-03-02', 'YYYY-MM-DD', 'America/Los_Angeles');
            const res = trainingQualityRewards(sqliteMock, 2, [{ userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: lastStreakDate.format('YYYY-MM-DD') }]);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(allMock.mock.calls[0][0]).toBe(lastStreakDate.add(1, 'day').unix());
            expect(res).toStrictEqual([{day: dbResults[2].day, earnings: [earningsTypes.STREAK_BONUS]}]);
        });
    });

    describe("for performance conditions", () => {
        it("should not provide any bonuses for the first session", () => {

        });

        it("should provide a 66th percentile bonus if the weighted avg coherence score is in the top 66% of all weighted avg coherence scores and not in the top 25%", () => {

        });

        it("should provide a 25th percentile bonus if the weighted avg coherence score is in the top 25% of all weighted avg coherence scores", () => {

        });

        it("should provide no bonus if the weighted avg coherence score is not in the top 66% of all weighted avg coherence sccores", () => {

        });
    });
});

describe("time rewards", () => {
    const allMock = jest.fn(() => [{}]);
    const sqliteMock = {
        prepare: () => ({ all: allMock})
    };

    afterEach(() => {
        allMock.mockClear();
    });

    const latestTimeEarnings = {
        userId: 'abc123',
        date: '2024-03-09', 
        type: earningsTypes.BREATH1,
        amount: 5
    };

    it("should throw an error if the condition is < 0", () => {
        expect(() => trainingTimeRewards(sqliteMock, -9, latestTimeEarnings)).toThrow();
    });

    it("should throw an error if the condition is > 63", () => {
        expect(() => trainingTimeRewards(sqliteMock, 72, latestTimeEarnings)).toThrow();
    });

    const testSecondSessionReward = (date, condition) => {
        const earnings = {userId: 'ab12', date: date.format('YYYY-MM-DD'), type: earningsTypes.BREATH1, amount: 2};
        allMock.mockReturnValueOnce([{
            day: date.format('YYYY-MM-DD'),
            minutes: 38
        }]);
        return trainingTimeRewards(sqliteMock, condition, earnings);
    }

    it("should give a reward for the second session on the same day", () => {
        const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
        const res = testSecondSessionReward(today, 26);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toEqual(expect.arrayContaining([{ day: today.format('YYYY-MM-DD'), earnings: [ earningsTypes.COMPLETION_BREATH2 ] }]));
        expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
    });

    it("should not give a reward after the second session on the same day", () => {
        const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
        const earnings = {userId: 'ab12', date: today.format('YYYY-MM-DD'), type: earningsTypes.PERFORMANCE_BREATH2, amount: 2};
        allMock.mockReturnValueOnce([{
            day: today.format('YYYY-MM-DD'),
            minutes: 38
        }]);
        const res = trainingTimeRewards(sqliteMock, 25, earnings);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toStrictEqual([]);
        expect(allMock.mock.calls[0][0]).toEqual(today.add(1, 'day').startOf('day').unix());
    });

    it("should give rewards for all eligible days if there are no previous earnings", () => {
        allMock.mockReturnValueOnce([
            {
                day: '2024-03-09',
                minutes: 38
            },
            {
                day: '2024-03-10',
                minutes: 17
            },
            {
                day: '2024-03-11',
                minutes: 18
            },
            {
                day: '2024-03-12',
                minutes: 36
            }
        ]);
        const res = trainingTimeRewards(sqliteMock, 25, null);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toEqual(expect.arrayContaining([
            {
                day: '2024-03-09', earnings: [earningsTypes.BREATH1, earningsTypes.PERFORMANCE_BREATH2]
            },
            {
                day: '2024-03-11', earnings: [earningsTypes.BREATH1]
            },
            {
                day: '2024-03-12', earnings: [earningsTypes.BREATH1, earningsTypes.PERFORMANCE_BREATH2]
            },
        ]));
        expect(allMock.mock.calls[0][0]).toEqual(dayjs('1970-01-01 00:00').tz('America/Los_Angeles').unix());
    });

    describe("for completion conditions", () => {
        it("should give the correct reward type for the second session of the day", () => {
            const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
            const res = testSecondSessionReward(today, 26);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(res).toEqual(expect.arrayContaining([{ day: today.format('YYYY-MM-DD'), earnings: [ earningsTypes.COMPLETION_BREATH2 ] }]));
            expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
        });
    });

    describe("for performance conditions", () => {
        it("should give the correct reward type for the second session of the day", () => {
            const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
            const res = testSecondSessionReward(today, 17);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(res).toEqual(expect.arrayContaining([{ day: today.format('YYYY-MM-DD'), earnings: [ earningsTypes.PERFORMANCE_BREATH2 ] }]));
            expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
        });
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
