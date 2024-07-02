'use strict';

import { trainingQualityRewards, trainingTimeRewards } from "../earnings.js"
import { earningsTypes, maxSessionMinutes } from '../../../../common/types/types.js';
import dayjs from 'dayjs';

const customParseFormat = require('dayjs/plugin/customParseFormat.js');
dayjs.extend(customParseFormat);

const mockEarningsForUser = jest.fn(() => []);
const mockGetAllUsers = jest.fn(() => []);
const mockSaveEarnings = jest.fn(() => {});

const dbMocks = [mockEarningsForUser, mockGetAllUsers, mockSaveEarnings];

jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            earningsForUser: (userId, earnType) => mockEarningsForUser(userId, earnType),
            getAllUsers: () => mockGetAllUsers(),
            saveEarnings: (userId, earningsType, dateDone) => mockSaveEarnings(userId, earningsType, dateDone),
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

    const latestQualityEarnings = {
        userId: 'abc123',
        date: '2024-03-09', 
        type: earningsTypes.STREAK_BONUS,
        amount: 5
    };

    it("should throw an error if the condition is < 0", () => {
        expect(() => trainingQualityRewards(sqliteMock, -9, latestQualityEarnings)).toThrow();
    });

    it("should throw an error if the condition is > 63", () => {
        expect(() => trainingQualityRewards(sqliteMock, 72, latestQualityEarnings)).toThrow();
    });

    describe("for completion conditions", () => {
        it("should not be granted if they have received a streak bonus in the prior three days", () => {
            const yesterday = dayjs().subtract(1, 'day').format();
            const latestEarnings = { userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: yesterday };

            const res = trainingQualityRewards(sqliteMock, 2, latestEarnings);
            expect(sqliteMock.prepare().all).not.toHaveBeenCalled();
            expect(res).toStrictEqual([]);
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
            const res = trainingQualityRewards(sqliteMock, 2, { userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: lastStreakDate.format() });
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
                dbResults.push({pulse_start_time: day.unix(), duration_seconds: 18*60});
            }
            allMock.mockReturnValueOnce(dbResults);

            const lastStreakDate = dayjs.tz('2024-03-02', 'YYYY-MM-DD', 'America/Los_Angeles');
            const res = trainingQualityRewards(sqliteMock, 2, { userId: 'ab12', type: earningsTypes.STREAK_BONUS, date: lastStreakDate.format() });
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(allMock.mock.calls[0][0]).toBe(lastStreakDate.add(1, 'day').unix());
            const expectedStreakDay = dayjs.unix(dbResults[2].pulse_start_time).tz('America/Los_Angeles').format('YYYY-MM-DD');
            expect(res).toStrictEqual([{
                day: dayjs.tz(expectedStreakDay, 'YYYY-MM-DD', 'America/Los_Angeles').format(), 
                earnings: earningsTypes.STREAK_BONUS
            }]);
        });

        it(`should throw an error if the most recent earning type is not ${earningsTypes.STREAK_BONUS}`, () => {
            expect(() => trainingQualityRewards(sqliteMock, 72, {userId: 'abc123', date: '2024-06-05T19:03:11-07:00', type: earningsTypes.TOP_25, amount: 3})).toThrow();
        });
    });

    describe("for performance conditions", () => {
        it("should not provide any bonuses for the first session", () => {
            const res = trainingQualityRewards(sqliteMock, 17, null,
                [{
                    startDateTime: dayjs().subtract(1, 'day').tz('America/Los_Angeles').unix(), 
                    weightedAvgCoherence: 2.7
            }], []);
            expect(res.length).toBe(0);
        });

        it("should provide a 66th percentile bonus if the weighted avg coherence score is in the top 66% of all weighted avg coherence scores and not in the top 25%", () => {
            const priorCoherenceVals = [1,2,3,4,5,6];
            const sessDate = dayjs().tz('America/Los_Angeles');
            const sess = buildSession(4, sessDate);
            const res = trainingQualityRewards(sqliteMock, 7, null, [sess], priorCoherenceVals);
            expect(res.length).toBe(1);
            expect(res).toEqual(expect.arrayContaining([{day: sessDate.format(), earnings: earningsTypes.TOP_66}]));
        });

        it("should provide a 25th percentile bonus if the weighted avg coherence score is in the top 25% of all weighted avg coherence scores", () => {
            const priorCoherenceVals = [1,2,3,4,5,6];
            const sessDate = dayjs().tz('America/Los_Angeles');
            const sess = buildSession(5, sessDate);
            const res = trainingQualityRewards(sqliteMock, 7, null, [sess], priorCoherenceVals);
            expect(res.length).toBe(1);
            expect(res).toEqual(expect.arrayContaining([{day: sessDate.format(), earnings: earningsTypes.TOP_25}]));
        });

        it("should provide no bonus if the weighted avg coherence score is not in the top 66% of all weighted avg coherence sccores", () => {
            const priorCoherenceVals = [1,2,3,4,5,6];
            const sessDate = dayjs().tz('America/Los_Angeles');
            const sess = buildSession(1.8, sessDate);
            const res = trainingQualityRewards(sqliteMock, 7, null, [sess], priorCoherenceVals);
            expect(res.length).toBe(0);
        });

        it("should work when there is only one prior coherence value", () => {
            const sessDate = dayjs().subtract(1, 'day').tz('America/Los_Angeles');
            const res = trainingQualityRewards(sqliteMock, 9, null,
                [{
                    startDateTime: sessDate.unix(), 
                    weightedAvgCoherence: 2.7
            }], [2.2]);
            expect(res.length).toBe(1);
            expect(res).toEqual(expect.arrayContaining([{day: sessDate.format(), earnings: earningsTypes.TOP_25}]));
        });

        it("should work when there are 0 prior coherence values and multiple sessions are uploaded", () => {
            const today = dayjs().tz('America/Los_Angeles');
            const allSessions = [
                { startDateTime: today.subtract(3, 'days').unix(), weightedAvgCoherence: 2.7 },
                { startDateTime: today.subtract(3, 'days').add(4, 'hours').unix(), weightedAvgCoherence: 2.2 },
                { startDateTime: today.subtract(2, 'days').unix(), weightedAvgCoherence: 1.8 },
                { startDateTime: today.subtract(2, 'days').add(3, 'hours').unix(), weightedAvgCoherence: 2.7 },
            ];
            const res = trainingQualityRewards(sqliteMock, 9, null, allSessions, []);
            expect(res).toEqual(expect.arrayContaining([
                {day: dayjs.unix(allSessions[3].startDateTime).tz('America/Los_Angeles').format(), earnings: earningsTypes.TOP_25}
            ]));
        });

        it("should add weighted avg coherence values to the set of prior coherence values when processing multiple sessions", () => {
            const priorCoherenceValues = [1,2,3,4,5,6]; // >=3 == 66%, >=5 == 25%   [1,2,3,4,5,5,5,5,6] >=4 == 66%, >=5 == 25%
            const sessDate = dayjs().tz('America/Los_Angeles').subtract(4, 'days');
            const sessions = [];
            const expectedResults = [];
            for (let i=0; i<4; i++) {
                // giving the first three sessions a coherence of 5 should push the
                // 66th percentile above 3 for subsequent sessions
                const coherence = i>=3 ? 3 : 5;
                const date = sessDate.add(i, 'days');
                sessions.push(buildSession(coherence, date));
                if (i < 3) {
                    expectedResults.push({day: date.format(), earnings: earningsTypes.TOP_25});
                }
            }
            const res = trainingQualityRewards(sqliteMock, 21, null, sessions, priorCoherenceValues);
            expect(res.length).toBe(3);
            expect(res).toEqual(expect.arrayContaining(expectedResults));
        });
    });
});

function buildSession(sessCoh, sessDate) {
    return { startDateTime: sessDate.unix(), weightedAvgCoherence: sessCoh };
}

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
        const earnings = {userId: 'ab12', date: date.format(), type: earningsTypes.BREATH1, amount: 2};
        allMock.mockReturnValueOnce([
            { pulse_start_time: date.unix(), duration_seconds: 19*60 },
            { pulse_start_time: date.add(1, 'hour').unix(), duration_seconds: 19*60 }
        ]);
        return trainingTimeRewards(sqliteMock, condition, earnings);
    }

    const formatDate = (yyyyMMDD) => {
        return dayjs.tz(yyyyMMDD, 'YYYY-MM-DD', 'America/Los_Angeles').format();
    }

    it("should give a reward for the second session on the same day", () => {
        const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
        const res = testSecondSessionReward(today, 26);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toEqual(expect.arrayContaining([{ day: today.startOf('day').format(), earnings: earningsTypes.COMPLETION_BREATH2 }]));
        expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
    });

    it("should not give a reward after the second session on the same day", () => {
        const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
        const earnings = {userId: 'ab12', date: today.format(), type: earningsTypes.PERFORMANCE_BREATH2, amount: 2};
        allMock.mockReturnValueOnce([]);
        const res = trainingTimeRewards(sqliteMock, 25, earnings);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toStrictEqual([]);
        expect(allMock.mock.calls[0][0]).toEqual(today.endOf('day').add(1, 'second').unix());
    });

    it("should give rewards for all eligible days if there are no previous earnings", () => {
        allMock.mockReturnValueOnce([
            { pulse_start_time: dayjs('2024-03-09 09:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60 },
            { pulse_start_time: dayjs('2024-03-09 10:00', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 19*60 },
            { pulse_start_time: dayjs('2024-03-10 09:30', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 17*60 },
            { pulse_start_time: dayjs('2024-03-11 19:42', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60 },
            { pulse_start_time: dayjs('2024-03-12 15:19', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60 },
            { pulse_start_time: dayjs('2024-03-12 16:11', 'YYYY-MM-DD HH:mm').unix(), duration_seconds: 18*60 },
        ]);
        const res = trainingTimeRewards(sqliteMock, 25, null);
        expect(allMock).toHaveBeenCalledTimes(1);
        expect(res).toEqual(expect.arrayContaining([
            {
                day: formatDate('2024-03-09'), earnings: earningsTypes.BREATH1
            },
            {
                day: formatDate('2024-03-09'), earnings: earningsTypes.PERFORMANCE_BREATH2
            },
            {
                day: formatDate('2024-03-11'), earnings: earningsTypes.BREATH1
            },
            {
                day: formatDate('2024-03-12'), earnings: earningsTypes.BREATH1
            },
            {
                day: formatDate('2024-03-12'), earnings: earningsTypes.PERFORMANCE_BREATH2
            },
        ]));
        expect(allMock.mock.calls[0][0]).toEqual(dayjs('1970-01-01 00:00').tz('America/Los_Angeles').unix());
    });

    describe("for completion conditions", () => {
        it("should give the correct reward type for the second session of the day", () => {
            const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
            const res = testSecondSessionReward(today, 26);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(res).toEqual(expect.arrayContaining([{ day: today.startOf('day').format(), earnings: earningsTypes.COMPLETION_BREATH2 }]));
            expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
        });
    });

    describe("for performance conditions", () => {
        it("should give the correct reward type for the second session of the day", () => {
            const today = dayjs().subtract(1, 'hour').tz('America/Los_Angeles');
            const res = testSecondSessionReward(today, 17);
            expect(allMock).toHaveBeenCalledTimes(1);
            expect(res).toEqual(expect.arrayContaining([{ day: today.startOf('day').format(), earnings: earningsTypes.PERFORMANCE_BREATH2 }]));
            expect(allMock.mock.calls[0][0]).toEqual(today.startOf('day').unix());
        });
    });
});

