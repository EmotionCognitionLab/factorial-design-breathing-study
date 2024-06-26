
'use strict';

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { dynamoDocClient as docClient } from '../common/aws-clients.js';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';
import { maxSessionMinutes, statusTypes } from '../../../common/types/types.js';

const snsEndpoint = process.env.SNS_ENDPOINT;
const region = process.env.REGION;

const homeTrainingMsgs = [
    "This is a friendly reminder from the breathing study team! If you haven't done your breathing session today, put a reminder in your calendar to do it later today, or try it now!",
    "Remember to breathe slowly today! Log in to get started.",
    "Ready to take a breather? Find a comfortable, quiet spot and inhale…exhale….and repeat…",
    "Day flying by? Take some time for yourself and breathe.",
    "Hi there! This is your daily reminder to slow your breathing. Log in now for a quick 18-minute session.",
    "Need a break? Take 18 minutes to slow down and breathe. Log your session now.",
    "Are you ready to breathe today? Slow breathing is just a click away.",
    "Don't hold your breath! Log your 18-minute session now and take it one breath at a time.",
    "Hello! It's time for your daily breathing session. Keep calm and breathe on!"
];

const sns = new SNSClient({endpoint: snsEndpoint, apiVersion: '2010-03-31', region: region});
const db = new Db();
db.docClient = docClient;

export async function handler (event) {
    const reminderType = event.reminderType;
    if (reminderType && reminderType =='homeTraining') {
        await sendHomeTraininingReminders(reminderType);
    } else {
        const errMsg = `A reminderType of 'homeTraining' was expected, but '${reminderType}' was received.`;
        console.error(errMsg);
        throw new Error(errMsg);
    }
}

async function sendHomeTraininingReminders(reminderType) {
    let sentCount = 0;
    const usersToRemind = [];
    try {
        const activeUsers = (await db.getActiveUsers()).filter(u => u?.progress?.status == statusTypes.ACTIVE); // filter shouldn't be necessary but better safe than sorry
        for (const u of activeUsers) {
            const todayStart = dayjs().tz('America/Los_Angeles').startOf('day').toDate();
            const todayEnd = dayjs().tz('America/Los_Angeles').endOf('day').toDate();
            const stage2Sessions = await db.sessionsForUser(u.userId, todayStart, todayEnd, 2);
            const minutes = stage2Sessions.reduce((prev, cur) => Math.round(cur.durationSeconds / 60) + prev, 0);
            if (minutes < 2 * maxSessionMinutes) usersToRemind.push(u);
        }
        const randMsgIdx = Math.floor(Math.random() * homeTrainingMsgs.length);
        const msg = homeTrainingMsgs[randMsgIdx];
        if (!msg) {
            const errMsg = `No message details found for message index ${randMsgIdx}.`;
            console.error(errMsg);
            throw new Error(errMsg);
        }
        sentCount = await deliverReminders(usersToRemind, msg);
    } catch (err) {
        console.error(`Error sending reminders for home training (${reminderType}) tasks: ${err.message}`, err);
    }
    console.log(`Done sending ${sentCount} home training reminders.`);
}

async function deliverReminders(recipients, msg) {
    let sentCount = 0;

    const phoneRecipients = recipients.filter(r => r.phone_number_verified);

    const phoneSends = phoneRecipients.map(async u => {
        await sendSMS(u.phone_number, msg);
        sentCount++;
    });

    await Promise.all(phoneSends);

    return sentCount;
}

/**
 * Sends msg to one phone number.
 * @param {string} The e164 formatted phone number we're sending the message to 
 * @param {object} msg An object with an sms field containing the text we're sending
 */
 async function sendSMS(recip, msg) {
    const params = {
        Message: msg,
        PhoneNumber: recip,
        MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
                DataType: 'String',
                StringValue: 'Transactional'
            }
        }
    }
    try {
        await sns.send(new PublishCommand(params));
    } catch (err) {
        console.error(`Error sending sms to ${recip}. (Message: ${msg.sms})`, err);
    }
}
