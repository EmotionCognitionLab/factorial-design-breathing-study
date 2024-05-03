import { mockClient } from 'aws-sdk-client-mock';
import { Logger } from "../index.js";
import { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';
import awsSettings from '../../aws-settings.json';

function logStreamName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const nextSequenceToken = 'ABC123';
const mockCwLogsClient = mockClient(CloudWatchLogsClient);
mockCwLogsClient.on(DescribeLogStreamsCommand)
    .resolves({
        logStreams: [ { logStreamName: logStreamName(), uploadSequenceToken: nextSequenceToken }]
    });

describe("Logger", () => {
    let origStorage;
    let l;
    let localStorageMock;
    const localStorage = {};

    beforeEach(async () => {
        jest.useFakeTimers();
        localStorageMock = {
            getItem: jest.fn((key) => localStorage[key]),
            setItem: jest.fn((key, item) => localStorage[key] = item)
        };
        origStorage = global.localStorage;
        global.localStorage = localStorageMock;
        l = new Logger();
        await l.init();
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
        for (let key in localStorage) delete localStorage[key];
        localStorageMock.getItem.mockClear();
        localStorageMock.setItem.mockClear();
        global.localStorage = origStorage;
        mockCwLogsClient.resetHistory();
    });

    it("should override console .log, .info, .warn and .error", () => {
        const logMock = jest.fn();
        l.storeLogMsg = logMock;
        ["log", "info", "warn", "error"].forEach(level => {
            const msg = `Testing console.${level} to ensure it is overridden`;
            console[level](msg);
            expect(logMock.mock.calls.length).toBe(1);
            expect(logMock.mock.calls[0][1]).toBe(level);
            logMock.mockClear();
        });
    });

    it("should not override console .log, .info, .warn and .error when override is false", async () => {
        const noOverride = new Logger(false);
        await noOverride.init();
        const logMock = jest.fn();
        noOverride.storeLogMsg = logMock;
        ["log", "info", "warn", "error"].forEach(level => {
            const msg = `Testing console.${level} to ensure it is NOT overridden`;
            console[level](msg);
            expect(logMock.mock.calls.length).toBe(0);
            logMock.mockClear();
        });
    });

    it("should create a log stream named using today's date", () => {
        expect(mockCwLogsClient.commandCalls(CreateLogStreamCommand).length).toBe(1);
        const today = logStreamName();
        expect(mockCwLogsClient.commandCalls(CreateLogStreamCommand)[0].args[0].input).toStrictEqual({logGroupName: awsSettings.CloudwatchLogGroup, logStreamName: today});
    });

    it("should save the log stream name to local storage", () => {
        expect(localStorageMock.setItem.mock.calls.length).toBe(1);
        const streamName = logStreamName();
        expect(localStorageMock.setItem.mock.calls[0][1]).toBe(streamName);
    });

    it("should write all log events to cloudwatch every pushFrequncy milliseconds", async () => {
        const logMsg = "A log call";
        const errorMsg = "An error call";
        console.log(logMsg);
        console.error(errorMsg);
        await jest.advanceTimersByTimeAsync(l.pushFrequency);
        expect(mockCwLogsClient.commandCalls(PutLogEventsCommand).length).toBe(1);
        const messages = mockCwLogsClient.commandCalls(PutLogEventsCommand)[0].args[0].input.logEvents.map(le => le.message);
        expect(messages).toContain(JSON.stringify({message: logMsg + " \n", level: "log", user: "unknown"}));
        expect(messages).toContain(JSON.stringify({message: errorMsg + " \n", level: "error", user: "unknown"}));
    });

    it("should log user information if provided", () => {
        const userId = "some-user-id";
        l.user = userId;
        const logMsg = "I am logging from a user";
        console.log(logMsg);
        const message = l.logEntries[0].message;
        expect(message).toContain(JSON.stringify({message: logMsg + " \n", level: "log", user: userId}));
    });

    describe("with mocked Date.now", () => {
        let dateSpy;
        const now = Date.now();
        const mockDate = new Date(now + 24 * 60 * 60 * 1000);
        let origDateNowFn;

        beforeEach(() => {
            origDateNowFn = Date.now;
            dateSpy = jest.spyOn(global, "Date").mockImplementation(() => mockDate);
            Date.now = jest.fn(() => now + 24 * 60 * 60 * 1000);
            mockCwLogsClient.on(DescribeLogStreamsCommand)
            .resolvesOnce({
                logStreams: [ { logStreamName: logStreamName(), uploadSequenceToken: nextSequenceToken }]
            });

        });

        afterEach(() => {
            dateSpy.mockRestore();
            Date.now = origDateNowFn;
            // reset mock to use regular, unmocked date
            mockCwLogsClient.on(DescribeLogStreamsCommand)
            .resolves({
                logStreams: [ { logStreamName: logStreamName(), uploadSequenceToken: nextSequenceToken }]
            });

        });

        it("should create a new log stream when attempting to log something on a new day", async () => {
            await jest.advanceTimersByTimeAsync(l.pushFrequency);
            expect(mockCwLogsClient.commandCalls(CreateLogStreamCommand).length).toBe(2);
            expect(mockCwLogsClient.commandCalls(CreateLogStreamCommand)[1].args[0].input.logStreamName).toBe(logStreamName());
        });
    });

    it("should call describeLogStreams before pushing to cloudwatch and use the token returned when pushing", async () => {
        console.log("Confirming call to describeLogStreams");
        await jest.advanceTimersByTimeAsync(l.pushFrequency);
        const descCalls = mockCwLogsClient.commandCalls(DescribeLogStreamsCommand);
        expect(descCalls.length).toBe(1);
        expect(descCalls[0].args[0].input.logStreamNamePrefix).toBe(logStreamName());
        const putCalls = mockCwLogsClient.commandCalls(PutLogEventsCommand);
        expect(putCalls.length).toBe(1);
        expect(putCalls[0].args[0].input.sequenceToken).toBe(nextSequenceToken);
    });

    describe("with error on putLogEvents", () => {
        const putLogError = {
            code: "SomeRandomException",
            message: `Insert obscure error code here: CDE-123-ABC-789`
        };

        beforeEach(() => {
            mockCwLogsClient.on(PutLogEventsCommand).rejectsOnce(putLogError);
        });

        afterEach(() => {
            jest.clearAllTimers();
        });

        it("should write log events on the second try if the first one fails", async () => {
            const msg1 = "checking log event writing, take 1";
            console.log(msg1);
            await jest.advanceTimersByTimeAsync(l.pushFrequency);
            
            const msg2 = "checking log event writing, take 2";
            console.log(msg2);
            await jest.advanceTimersByTimeAsync(l.pushFrequency);
            const putCalls = mockCwLogsClient.commandCalls(PutLogEventsCommand);
            expect(putCalls.length).toBe(2);
            const messages = putCalls[1].args[0].input.logEvents.map(le => le.message);
            expect(messages).toContain(JSON.stringify({message: msg1 + " \n", level: "log", user: "unknown"}));
            expect(messages).toContain(JSON.stringify({message: msg2 + " \n", level: "log", user: "unknown"}));
        });
    });
});
