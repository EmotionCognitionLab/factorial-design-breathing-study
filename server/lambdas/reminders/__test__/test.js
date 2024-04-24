'use strict';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock'

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});

import { handler } from '../reminders';

const defaultUser =  { userId: '123abc', humanId: 'BigIdea', email: 'nobody@example.com' };
const emailUser = { userId: '123abc', email:'email@example.com', phone: '+11112223333', notifyPref: 'email', phone_number_verified: true};
const phoneUser = { userId: '345def', email:'phone@example.com', phone: '+11112223333', notifyPref: 'phone', phone_number_verified: true};
const unverifiedPhoneUser = { userId: '678ghi', email:'badphone@example.com', phone: '+14445556666', notifyPref: 'phone', phone_number_verified: false};
const mockGetAllUsers = jest.fn(() => [ defaultUser ]);
const mockSegmentsForUser = jest.fn(() => []);

const mockSESClient = mockClient(SESClient);
const mockSNSClient = mockClient(SNSClient);


jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getAllUsers: () => mockGetAllUsers(),
            segmentsForUser: (userId, stage, startDate, endDate) => mockSegmentsForUser(userId, stage, startDate, endDate),
        };
    });
});

describe("reminders", () => {
    afterEach(() => {
        mockSegmentsForUser.mockClear();
        mockGetAllUsers.mockClear();
        mockSESClient.resetHistory();
        mockSNSClient.resetHistory();
    });

    it("should throw an error if no reminderType is provided", async () => {
        await expect(() => handler({})).rejects.toEqual(Error("A reminderType of 'homeTraining.morning' or 'homeTraining.evening' was expected, but 'undefined' was received."));
    });

    it("should throw an error if an unexpected reminderType is provided", async () => {
        await expect(() => handler({reminderType: 'make your bed'})).rejects.toEqual(Error("A reminderType of 'homeTraining.morning' or 'homeTraining.evening' was expected, but 'make your bed' was received."));
    });

    it("should fail if an unexpected message type is received", async () => {
        await handler({reminderType: 'homeTraining.end-of-the-year'});
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should send an email when the user's preference is email", async () => {
        mockGetAllUsers.mockImplementationOnce(() => [emailUser]);
        await handler({reminderType: 'homeTraining.morning'});
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSESClient.commandCalls(SendEmailCommand)[0].args[0].input.Destination.ToAddresses).toStrictEqual([emailUser.email]);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should send an sms when the user's preference is sms", async () => {
        mockGetAllUsers.mockImplementationOnce(() => [phoneUser]);
        await handler({commType: 'sms', reminderType: 'homeTraining.evening'});
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand)[0].args[0].input.PhoneNumber).toBe(phoneUser.phone_number);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
    });

    it("should send an email, not an sms, to people whose phone numbers are not verified", async () => {
        mockGetAllUsers.mockImplementationOnce(() => [unverifiedPhoneUser]);
        await handler({commType: 'sms', reminderType: 'homeTraining.morning'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSESClient.commandCalls(SendEmailCommand)[0].args[0].input.Destination.ToAddresses).toStrictEqual([unverifiedPhoneUser.email]);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has dropped out", async () => {
        const droppedUser = { userId: '123abc', email: 'nobody@example.com', progress: { dropped: true }};
        mockGetAllUsers.mockImplementationOnce(() => [droppedUser]);
        await handler({commType: 'email', reminderType: 'homeTraining.evening'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has finished stage 3", async() => {
        const doneUser = { userId: 'abc123', email: 'nobody@example.com', progress: { stage3Complete: true}};
        mockGetAllUsers.mockImplementationOnce(() => [doneUser]);
        await handler({commType: 'email', reminderType: 'homeTraining.morning'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });
});

describe("home training reminders", () => {

    afterEach(() => {
        mockSegmentsForUser.mockReset();
        mockSegmentsForUser.mockImplementation(() => [])
        mockGetAllUsers.mockClear();
        mockSESClient.resetHistory();
        mockSNSClient.resetHistory();
    });

    function makeSegments(stage, endDate, count) {
        const res = [];
        for (let i = 0; i < count; i++) {
            res.push({stage: stage, endDateTime: endDate.getTime() / 1000 })
        }
        return res;
    }

    it("should be sent if < 12 stage 2 segments have been done and fewer than 6 have been done today", async () => {
        const oldSegs = makeSegments(2, new Date(0), 6);
        const todaySegs = makeSegments(2, new Date(), 2);
        await testWithSegments([...oldSegs, ...todaySegs]);
        expect(mockSegmentsForUser.mock.calls.length).toBe(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
        expect(mockSESClient.commandCalls(SendEmailCommand)[0].args[0].input.Destination.ToAddresses).toStrictEqual([defaultUser.email]);
    });

    it("should not be sent if < 12 stage 2 segments have been done and 6 or more have been done today", async () => {
        const oldSegs = makeSegments(2, new Date(0), 4);
        const todaySegs = makeSegments(2, new Date(), 6);
        await testWithSegments([...oldSegs, ...todaySegs]);
        expect(mockSegmentsForUser.mock.calls.length).toBe(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);   
    });

    it("should be sent if >= 12 stage 2 segments have been done and fewer than 6 stage 3 segments have been done today", async () => {
        const stage2Segs = makeSegments(2, new Date(0), 12);
        const stage3Segs = makeSegments(3, new Date(), 4);
        await testWithSegments([...stage2Segs, ...stage3Segs]);
        expect(mockSegmentsForUser.mock.calls.length).toBe(2);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSegmentsForUser.mock.calls[1][1]).toBe(3);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
        expect(mockSESClient.commandCalls(SendEmailCommand)[0].args[0].input.Destination.ToAddresses).toStrictEqual([defaultUser.email]);
    });

    it("should not be sent if >= 12 stage 2 segments have been done and 6 or more stage 3 segments have been done today", async () => {
        const stage2Segs = makeSegments(2, new Date(0), 12);
        const stage3Segs = makeSegments(3, new Date(), 6);
        await testWithSegments([...stage2Segs, ...stage3Segs]);
        expect(mockSegmentsForUser.mock.calls.length).toBe(2);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSegmentsForUser.mock.calls[1][1]).toBe(3);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(0);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);   
    });

    async function testWithSegments(segments) {
        mockSegmentsForUser.mockImplementation((_userId, stage, startDate = new Date(0), endDate = new Date(1000 * 60 * 60 * 24 * 365 * 1000)) => {
            const result = segments.filter(s => {
                return s.stage == stage && s.endDateTime >= startDate.getTime() / 1000 && s.endDateTime <= endDate.getTime() / 1000
            });
            return result;
        });
        await handler({commType: 'email', reminderType: 'homeTraining.evening'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
    }

    it("should not be sent if the participant has dropped out", async () => {
        const droppedUser =  { userId: '456def', humanId: 'BigText', email: 'dropped@example.com', progress: { dropped: true }};
        mockGetAllUsers.mockImplementationOnce(() => [droppedUser, defaultUser]);
        await handler({commType: 'email', reminderType: 'homeTraining.morning'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not be sent if the participant has finished the study", async () => {
        const doneUser =  { userId: '456def', humanId: 'BigText', email: 'dropped@example.com', progress: { stage3Complete: true }};
        mockGetAllUsers.mockImplementationOnce(() => [doneUser, defaultUser]);
        await handler({commType: 'email', reminderType: 'homeTraining.evening'});
        expect(mockGetAllUsers).toHaveBeenCalledTimes(1);
        expect(mockSegmentsForUser.mock.calls[0][0]).toBe(defaultUser.userId);
        expect(mockSegmentsForUser.mock.calls[0][1]).toBe(2);
        expect(mockSESClient.commandCalls(SendEmailCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });
});

