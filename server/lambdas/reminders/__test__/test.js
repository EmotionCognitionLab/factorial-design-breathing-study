'use strict';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock'

const path = require('path');
require('dotenv').config({path: path.join(__dirname, './env.sh')});
import { statusTypes, maxSessionMinutes } from '../../../../common/types/types';
import { handler } from '../reminders';

const defaultUser =  { userId: '123abc', email: 'nobody@example.com', phone: '+11112223333', phone_number_verified: true, progress: {status: statusTypes.ACTIVE}};
const unverifiedPhoneUser = { userId: '678ghi', email:'badphone@example.com', phone: '+14445556666', phone_number_verified: false, progress: {status: statusTypes.ACTIVE}};
const mockGetActiveUsers = jest.fn(() => [ defaultUser ]);
const mockSessionsForUser = jest.fn(() => []);

const mockSNSClient = mockClient(SNSClient);


jest.mock('db/db', () => {
    return jest.fn().mockImplementation(() => {
        return {
            getActiveUsers: () => mockGetActiveUsers(),
            sessionsForUser: () => mockSessionsForUser()
        };
    });
});

describe("reminders", () => {
    afterEach(() => {
        mockGetActiveUsers.mockClear();
        mockSessionsForUser.mockClear();
        mockSNSClient.resetHistory();
    });

    it("should throw an error if no reminderType is provided", async () => {
        await expect(() => handler({})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'undefined' was received."));
    });

    it("should throw an error if an unexpected reminderType is provided", async () => {
        await expect(() => handler({reminderType: 'make your bed'})).rejects.toEqual(Error("A reminderType of 'homeTraining' was expected, but 'make your bed' was received."));
    });

    it("should send an sms when the reminderType is correct and the participant has not trained", async () => {
        await handler({reminderType: 'homeTraining'});
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(1);
        expect(mockSNSClient.commandCalls(PublishCommand)[0].args[0].input.PhoneNumber).toBe(defaultUser.phone_number);
    });

    it("should not send a reminder to someone who has dropped out", async () => {
        const droppedUser = { userId: '123abc', email: 'nobody@example.com', progress: { status: statusTypes.DROPPED }, phone_number_verified: true,};
        mockGetActiveUsers.mockImplementationOnce(() => [droppedUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has finished stage 3", async() => {
        const doneUser = { userId: 'abc123', email: 'nobody@example.com', progress: { status: statusTypes.COMPLETE}, phone_number_verified: true,};
        mockGetActiveUsers.mockImplementationOnce(() => [doneUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone whose phone number has not been verified", async() => {
        mockGetActiveUsers.mockImplementationOnce(() => [unverifiedPhoneUser]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should not send a reminder to someone who has already done two full sessions today", async() => {
        mockSessionsForUser.mockImplementationOnce(() => [
            {durationSeconds: maxSessionMinutes * 60},
            {durationSeconds: (maxSessionMinutes / 2) * 60},
            {durationSeconds: (maxSessionMinutes / 2) * 60}
        ]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSessionsForUser).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(0);
    });

    it("should send a reminder to someone who has done >0 minutes of training and less than two full sessions today", async() => {
        mockSessionsForUser.mockImplementationOnce(() => [
            {durationSeconds: maxSessionMinutes * 60}
        ]);
        await handler({reminderType: 'homeTraining'});
        expect(mockGetActiveUsers).toHaveBeenCalledTimes(1);
        expect(mockSessionsForUser).toHaveBeenCalledTimes(1);
        expect(mockSNSClient.commandCalls(PublishCommand).length).toBe(1);
    });
});

