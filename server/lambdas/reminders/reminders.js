
'use strict';

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import Db from 'db/db.js';

const sesEndpoint = process.env.SES_ENDPOINT;
const snsEndpoint = process.env.SNS_ENDPOINT;
const emailSender = process.env.EMAIL_SENDER;
const region = process.env.REGION;

const homeTrainingMsg = {
    morning: {
        subject: "What is your training plan for today?",
        html: "If you haven't had time to train your brain and heart today, put a reminder in your calendar to train later today, or try it now!",
        text: "If you haven't had time to train your brain and heart today, put a reminder in your calendar to train later today, or try it now!",
        sms: "If you haven't had time to train your brain and heart today, put a reminder in your calendar to train later today, or try it now!"
    },
    evening: {
        subject: "Remember to train today!",
        html: "Ready, set, train! Remember to train your brain and heart today!",
        text: "Ready, set, train! Remember to train your brain and heart today!",
        sms: "Ready, set, train! Remember to train your brain and heart today!"
    }
}


const ses = new SESClient({endpoint: sesEndpoint, apiVersion: '2010-12-01', region: region});
const sns = new SNSClient({endpoint: snsEndpoint, apiVersion: '2010-03-31', region: region});
const db = new Db();

export async function handler (event) {
    const reminderType = event.reminderType;
    if (reminderType && reminderType.startsWith('homeTraining')) {
        await sendHomeTraininingReminders(reminderType);
    } else {
        const errMsg = `A reminderType of 'homeTraining.morning' or 'homeTraining.evening' was expected, but '${reminderType}' was received.`;
        console.error(errMsg);
        throw new Error(errMsg);
    }
}

async function sendHomeTraininingReminders(reminderType) {
    let sentCount = 0;
    const usersToRemind = [];
    try {
        const msgType = reminderType.split('.')[1]; // reminderType is homeTraining.morning or homeTraining.evening
        const allUsers = await db.getAllUsers();
        for (const u of allUsers.filter(u => 
            !u.progress || (u.progress && !u.progress.dropped && !u.progress.stage3Complete))) {
            const todayStart = dayjs().tz('America/Los_Angeles').startOf('day').toDate();
            const todayEnd = dayjs().tz('America/Los_Angeles').endOf('day').toDate();
            const allStage2Segments = await db.segmentsForUser(u.userId, 2);
            if (allStage2Segments.length >= 12) {
                // check their stage 3 progress
                const todayStage3Segments = await db.segmentsForUser(u.userId, 3, todayStart, todayEnd);
                if (todayStage3Segments.length < 6) {
                    usersToRemind.push(u);
                }
            } else {
                // see where they are with their stage 2 segments today
                const startDateEpoch = Math.floor(todayStart.getTime() / 1000);
                const endDateEpoch = Math.floor(todayEnd.getTime() / 1000);
                const todayStage2Segments = allStage2Segments.filter(s => s.endDateTime >= startDateEpoch && s.endDateTime <= endDateEpoch);
                if (todayStage2Segments.length < 6) {
                    usersToRemind.push(u);
                }
            }
        }
        const msgDetails = homeTrainingMsg[msgType];
        if (!msgDetails) {
            const errMsg = `No message details found for message type ${msgType}.`;
            console.error(errMsg);
            throw new Error(errMsg);
        }
        sentCount = await deliverReminders(usersToRemind, msgDetails);
    } catch (err) {
        console.error(`Error sending reminders for home training (${reminderType}) tasks: ${err.message}`, err);
    }
    console.log(`Done sending ${sentCount} home training reminders.`);
}

async function deliverReminders(recipients, msg) {
    let sentCount = 0;

    const validRecipients = recipients.filter(r => !r.progress || (r.progress && !r.progress.dropped));
    const emailRecipents = validRecipients.filter(r => r.notifyPref == "email" || !r.phone_number_verified); // fall back to email for participants whose phone couldn't be verified
    const phoneRecipients = validRecipients.filter(r => r.notifyPref == "phone" && r.phone_number_verified);

    const emailSends = emailRecipents.map(async u => {
        await sendEmail(u.email, msg);
        sentCount++
    });

    const phoneSends = phoneRecipients.map(async u => {
        await sendSMS(u.phone_number, msg);
        sentCount++;
    });

    await Promise.all([...emailSends, ...phoneSends]);

    return sentCount;
}

/**
 * Sends email message msg to a single recipient
 * @param {string} recip Email address of the recipient
 * @param {object} msg msg object with html, text, subject fields
 */
 async function sendEmail(recip, msg) {
    const params = {
        Destination: {
            ToAddresses: [recip]
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: msg.html
                },
                Text: {
                    Charset: "UTF-8",
                    Data: msg.text
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: msg.subject
            }
        },
        Source: emailSender
    }
    try {
        await ses.send(new SendEmailCommand(params));
    } catch (err) {
        console.error(`Error sending email to ${recip}. (Message: ${msg.text})`, err);
    }
}

/**
 * Sends msg to one phone number.
 * @param {string} The e164 formatted phone number we're sending the message to 
 * @param {object} msg An object with an sms field containing the text we're sending
 */
 async function sendSMS(recip, msg) {
    const params = {
        Message: msg.sms,
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
