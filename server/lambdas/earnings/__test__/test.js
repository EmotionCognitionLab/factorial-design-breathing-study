'use strict';

import { handler } from "../earnings.js"
import { earningsTypes } from '../../../../common/types/types.js';
import dayjs from 'dayjs';

const mockEarningsForUser = jest.fn(() => []);
const mockGetAllUsers = jest.fn(() => []);
const mockSaveEarnings = jest.fn(() => {});
const mockSegmentsForUser = jest.fn(() => []);

const allMocks = [mockEarningsForUser, mockGetAllUsers, mockSaveEarnings, mockSegmentsForUser];

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

describe("Breathing earnings calculation", () => {

    const users = [
        {
            userId: 'someuser',
            progress: { visit1: '2023-01-01T07:08:09-07:00'}
        }
    ];

    beforeEach(() => {
        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockReturnValue([{
            userId: users[0].userId,
            type: earningsTypes.VISIT1,
            date: users[0].progress.visit1.substring(0, 10)
        }]);
    })

    afterEach(() => {
        allMocks.forEach(mock => mock.mockClear());
    });

    it("should continue with other users if an error is thrown on one user", async () => {
        const users = [
            {userId: 'error'},
            {userId: 'ok'}
        ];

        mockGetAllUsers.mockReturnValue(users);
        mockEarningsForUser.mockImplementation(userId => {
            if (userId === 'error') {
                throw new Error('Fake error for testing');
            }
            return [];
        });
        const segDate = dayjs().subtract(3, 'day').tz('America/Los_Angeles');
        const segs = makeBreathSegments(users[1].userId, 3, segDate.unix());
        mockSegmentsForUser.mockImplementation(() => segs);

        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(1);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[1].userId, earningsTypes.BREATH1, segDate.format('YYYY-MM-DD'));
    });

    it("should save one breath earnings on days with >= 3 segments", async () => {
        const segs = makeBreathSegments(users[0].userId, 3);
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(1);
        const earningsDate = dayjs(segs[0].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, earningsDate);
    });

    it("should save two breath earnings on days with >= 6 segments", async () => {
        const segs = makeBreathSegments(users[0].userId, 6);
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        expect(mockSaveEarnings).toHaveBeenCalledTimes(2);
        const earningsDate = dayjs(segs[0].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, earningsDate);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH2, earningsDate);
    });

    it("should only save breath earnings for segments that happened after the last breath earnings date", async () => {
        const lastEarningsDate = dayjs("2023-06-19");
        const earnings = [
            {
                userId: users[0].userId,
                type: earningsTypes.BREATH1,
                date: lastEarningsDate.format("YYYY-MM-DD")
            }
        ];
        mockEarningsForUser.mockReturnValue(earnings);
        const segs = makeBreathingDays(users[0].userId, 2, lastEarningsDate.add(1, 'day'));
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        const earningsDate = dayjs(segs.slice(-1)[0].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, earningsDate);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH2, earningsDate);
        const alreadyEarnedDate = dayjs(segs[0].endDateTime * 1000).tz('America/Los_Angeles');
        expect(alreadyEarnedDate.format('YYYY-MM-DD')).toBe(earnings[0].date);
        expect(mockSaveEarnings).not.toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, alreadyEarnedDate);
    });

    it("should not save earnings for breathing segments done today", async () => {
        await handler();
        const now = Math.floor(Date.now() / 1000);
        expect(mockSegmentsForUser).toHaveBeenCalledTimes(1);
        const segsForUserEndDate = mockSegmentsForUser.mock.calls[0][3];
        expect(segsForUserEndDate.getTime() / 1000).toBeLessThan(now);
    });

    it("should save breath earnings for both stage 2 and stage 3 breathing", async () => {
        const stage2Day = dayjs().subtract(2, 'days').tz('America/Los_Angeles');
        const stage3Day = dayjs().subtract(1, 'days').tz('America/Los_Angeles');
        const stage2Segs = makeBreathSegments(users[0].userId, 6, stage2Day.unix());
        const stage3Segs = makeBreathSegments(users[0].userId, 3, stage3Day.unix());
        mockSegmentsForUser.mockImplementation(() => [...stage2Segs, ...stage3Segs]);
        await handler();
        expect(mockSegmentsForUser).toHaveBeenCalledTimes(1);
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, stage2Day.format("YYYY-MM-DD"));
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH2, stage2Day.format("YYYY-MM-DD"));
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.BREATH1, stage3Day.format("YYYY-MM-DD"));
    });

    it("should save a streak_bonus_1 payment after six consecutive days", async () => {
        const segs = makeBreathingDays(users[0].userId, 6);
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        const earningsDate = dayjs(segs[segs.length - 1].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS1, earningsDate);
    });

    it("should save a streak_bonus_1 payment after six consecutive days even if they do not begin the first day", async () => {
        const day1 = dayjs().subtract(9, 'days').tz('America/Los_Angeles');
        const day1Segs = makeBreathSegments(users[0].userId, 6, day1.unix());
        const remainingSegs = makeBreathingDays(users[0].userId, 6, day1.add(2, 'days'));
        mockSegmentsForUser.mockImplementation(() => [...day1Segs, ...remainingSegs]);
        await handler();
        const earningsDate = dayjs(remainingSegs[remainingSegs.length - 1].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS1, earningsDate);
    });

    it("should save a streak_bonus_2 payment for each consecutive day after six", async () => {
        const segs = makeBreathingDays(users[0].userId, 8);
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        const earnings1Date = dayjs(segs[35].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS1, earnings1Date);
        const earnings2Date = dayjs(segs[41].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS2, earnings2Date);
        const earnings3Date = dayjs(segs[47].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS2, earnings3Date);
    });

    it("should ignore consecutive days before the last streak bonus when calculating streaks", async () => {
        const lastEarningsDate = dayjs("2023-06-19");
        const earnings = [
            {
                userId: users[0].userId,
                type: earningsTypes.STREAK_BONUS1,
                date: lastEarningsDate.format("YYYY-MM-DD")
            }
        ];
        mockEarningsForUser.mockReturnValue(earnings);
        const segs = makeBreathingDays(users[0].userId, 6, lastEarningsDate.subtract(1, 'day'));
        mockSegmentsForUser.mockImplementation(() => segs);
        await handler();
        const earnedTypes = mockSaveEarnings.mock.calls.map(call => call[1]);
        expect(earnedTypes).not.toContain(earningsTypes.STREAK_BONUS2);
        expect(earnedTypes).not.toContain(earningsTypes.STREAK_BONUS1);
    });

    it("should not save any new streak bonus payments after the first one if there is a gap in training days", async () => {
        const day1 = dayjs().subtract(9, 'days').tz('America/Los_Angeles');
        const consecutiveSegs = makeBreathingDays(users[0].userId, 6, day1);
        const nonConsecDay = dayjs().subtract(2, 'days').tz('America/Los_Angeles').unix();
        const nextSegs = makeBreathSegments(users[0].userId, 6, nonConsecDay);
        mockSegmentsForUser.mockImplementation(() => [...consecutiveSegs, ...nextSegs]);
        await handler();
        const earnings1Date = dayjs(consecutiveSegs[consecutiveSegs.length - 1].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS1, earnings1Date);
        const earnedTypes = mockSaveEarnings.mock.calls.map(call => call[1]);
        expect(earnedTypes).not.toContain(earningsTypes.STREAK_BONUS2);
    });

    it("should not save a new streak bonus payment if the user did fewer than six segments on one of the relevant days", async () => {
        const day1 = dayjs().subtract(9, 'days').tz('America/Los_Angeles');
        const consecutiveSegs = makeBreathingDays(users[0].userId, 6, day1);
        const partialDay = dayjs().subtract(3, 'days').tz('America/Los_Angeles').unix();
        const partialDaySegs = makeBreathSegments(users[0].userId, 3, partialDay);
        const nextDay = dayjs().subtract(2, 'days').tz('America/Los_Angeles').unix();
        const nextDaySegs = makeBreathSegments(users[0].userId, 6, nextDay);
        mockSegmentsForUser.mockImplementation(() => [...consecutiveSegs, ...partialDaySegs, ...nextDaySegs]);
        await handler();
        const earnings1Date = dayjs(consecutiveSegs[consecutiveSegs.length - 1].endDateTime * 1000).tz('America/Los_Angeles').format('YYYY-MM-DD');
        expect(mockSaveEarnings).toHaveBeenCalledWith(users[0].userId, earningsTypes.STREAK_BONUS1, earnings1Date);
        const earnedTypes = mockSaveEarnings.mock.calls.map(call => call[1]);
        expect(earnedTypes).not.toContain(earningsTypes.STREAK_BONUS2);
    });

});

function makeBreathSegments(userId, numSegments, baseDate=null) {
    const result = [];
    const baseSegDate = baseDate ? baseDate : dayjs().subtract(1, 'day').tz('America/Los_Angeles').unix();
    for (let i=0; i<numSegments; i++) {
        // NB this date calculation will cause problems if numSegments
        // is high enough that the segments cross into the next day
        // or if the test is run close enough to midnight that they cross into the next day
        result.push({userId: userId, endDateTime: baseSegDate + (i * 22 * 60)}); 
    }
    return result;
}

function makeBreathingDays(userId, numConsecutiveDays, startDay=null) {
    const result = [];
    const startDate = startDay ? startDay: dayjs().subtract(numConsecutiveDays+1, 'day').tz('America/Los_Angeles');
    for (let i=0; i<numConsecutiveDays; i++) {
        const segs = makeBreathSegments(userId, 6, startDate.add(i, 'days').unix());
        result.push(...segs);
    }
    return result;
}
