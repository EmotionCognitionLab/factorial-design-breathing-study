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

