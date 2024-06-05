/**
 * Provides remote logging to CloudWatch.
 * 
 * There are two ways to use it:
 * override=true (default) and override=false .
 * 
 * In the first, it will override console.log, .info, .warn and
 * .error. All calls to those methods will be cause logging events
 * to be sent to CloudWatch, as well as logged to process.stdout 
 * (for .log, .info and .warn) or process.stderr (for .error).
 * 
 * In the second, console.log, .info, .warn and .error are NOT
 * overridden and no console logging will cause log events to
 * be sent to CloudWatch. 
 * 
 * In either case you can also use it like this:
 *   const l = new Logger();
 *   await l.init();
 *   l.log("This is a log message");
 *   l.error("This is an error message");
 * 
 * Calls to Logger's own .log, .info, .warn and .error
 * methods will always be sent to CloudWatch and logged
 * to process.stdout or stderr.
 * 
 * The log stream name will always be YYYY-MM-DD. The log group name
 * and other aws settings details are found in aws-settings.json.
 * 
 * Logs are written to ClougWatch every pushFrequency ms (defaults to 10000).
 * 
 * Uses local storage to save the CloudWatch sequence token and the stream name.
 */

import awsSettings from '../aws-settings.json';
import { CloudWatchLogsClient, CreateLogStreamCommand, DescribeLogStreamsCommand, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs"; 
import util from 'util';

const streamKey = 'ConsoleCloudWatch:stream';

// if we're not in a browser environment we don't need persistent localStorage
class LocalStorage {
    constructor() {
        this.storage = {};
    }
    
    getItem(name) {
        return this.storage[name];
    }

    setItem(name, value) {
        this.storage[name] = value;
    }
}

class Logger {
    /**
     * Creates and initializes Logger instance.
     * @param {*} override true to override console.log, .info, .warn and .error, false to leave them alone.
     */
    constructor(override=true, user="unknown") {
        this.origConsole = {};
        this.override = override;
        this.user = user;
        const cloudWatchClientParams = {
            region: awsSettings.AWSRegion, 
            credentials: {
                accessKeyId: awsSettings.CloudwatchWriter, 
                secretAccessKey: awsSettings.CloudwatchWriterKey
            }
        };
        if (process.env.CLOUDWATCH_ENDPOINT) {
            cloudWatchClientParams['endpoint'] = process.env.CLOUDWATCH_ENDPOINT;
        }
        this.cwLogs = new CloudWatchLogsClient(cloudWatchClientParams);
        
        this.logGroupName = awsSettings.CloudwatchLogGroup;
        this.logEntries = [];
        this.pushFrequency = 10000; // push new log entries to cloudwatch every 10s
        if (typeof window === "undefined" || typeof window.localStorage === "undefined" || window.localStorage === null) {  
            if (typeof global === "undefined" || typeof global.localStorage === "undefined" || global.localStorage === null) {
                this.localStorage = new LocalStorage();
            } else {
                this.localStorage = global.localStorage;
            }
        } else {
            this.localStorage = window.localStorage;
        }
    }

    /**
     * Creates the log stream and saves the name to local storage. Called
     * at initialization and every pushFrequency ms thereafter.
     */
    async setStream() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const stream = `${year}-${month}-${day}`;
        const curStream = this.localStorage.getItem(streamKey);
        if (stream !== curStream) {
            const cmd = new CreateLogStreamCommand({
                logGroupName: this.logGroupName,
                logStreamName: stream
            });
            try {
                await this.cwLogs.send(cmd);
                this.localStorage.setItem(streamKey, stream);
            } catch (err) {
                if (err.name !== "ResourceAlreadyExistsException") {
                    this.error(err, err.stack);
                } else {
                    this.localStorage.setItem(streamKey, stream);
                }
            }
        }
    }

    storeLogMsg(origLogFn, level, ...args) {
        if (args.length === 0) return;

        const msg = util.format(args[0], ...args.slice(1), "\n");
        this.logEntries.push({message: JSON.stringify({message: msg, level: level, user: this.user}), timestamp: Date.now()});

        origLogFn.apply(this, args);
    }

    buildLogFn(origLogFn, level)  {
        this[level] = (...args) => this.storeLogMsg(origLogFn, level, ...args); // creates this.log, this.info, etc.
        return this[level];
    }

    async init() {
        const levels = ["log", "info", "warn", "error"];
        levels.forEach(level => {
            const origFn = console[level].bind(console);
            this.origConsole[level] = origFn;
            const newFn = this.buildLogFn(origFn, level); // creates this.log, this.info, etc.
            if (typeof(console) !== "undefined" && this.override) {
                console[level] = newFn;
            }
        });
        await this.setStream();

        // This timer both writes logs to CloudWatch periodically and calls setStream
        // to see if a new log stream needs to be created (i.e., when the date changes).
        const loggingInterval = setInterval(async () => {
            await this.setStream();
            const unsent = this.logEntries.splice(0);
            let streamName = this.localStorage.getItem(streamKey);
            // for some reason the stream name is occasionally
            // undefined. Maybe issue with localStorage?
            for (let i=0; i<3; i++) {
                if (streamName !== undefined) break;

                await this.setStream();
                streamName = this.localStorage.getItem(streamKey);
                await new Promise(res => setTimeout(res, 1000));
            }
            
            if (unsent.length) {
                const cmd = new DescribeLogStreamsCommand({
                    logGroupName: this.logGroupName,
                    logStreamNamePrefix: streamName
                });
                let descLogStreamsResp;
                try {
                    descLogStreamsResp = await this.cwLogs.send(cmd);
                    if (descLogStreamsResp.logStreams.length !== 1) {
                        this.error(`Expected to get one stream with name ${streamName}, but got ${descLogStreamsResp.logStreams.length}.`);
                        return;
                    }
                    if (descLogStreamsResp.logStreams.length == 1 && 
                        descLogStreamsResp.logStreams[0].logStreamName !== streamName) {
                        this.error(`Expected logStreamName to be ${streamName}, but it is ${descLogStreamsResp.logStreams[0].logStreamName}.`);
                        return;
                    }
                } catch (err) {
                    this.error("Error calling describeLogStreams", err);
                    return;
                }
                
                const seqToken = descLogStreamsResp.logStreams[0].uploadSequenceToken;
                const putLogEventsCmd = new PutLogEventsCommand({
                    logEvents: unsent,
                    sequenceToken: seqToken,
                    logGroupName: this.logGroupName,
                    logStreamName: streamName
                });
                try {
                    await this.cwLogs.send(putLogEventsCmd);
                } catch (err) {
                    this.logEntries = unsent.concat(this.logEntries);
                    if (err.code !== "InvalidSequenceTokenException") {
                        // if we get an InvalidSequenceTokenException
                        // ignore it - someone must have written to the stream since we called describeLogStreams
                        // we'll just log everything on the next call

                        this.origConsole.error.call(this, "Error calling putLogEvents", err);
                    }
                }
                
            }
        }, this.pushFrequency || 10000);
        // if this is running in a node process we don't want this logging
        // interval to keep the process running forever. Calling unref()
        // will ensure it doesn't.
        // https://nodejs.org/api/timers.html#timers_timeout_unref
        if (loggingInterval.unref) loggingInterval.unref();
    }
}

export default Logger;
