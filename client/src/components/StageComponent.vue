<template>
    <div>
        <div class="instruction" :class="{hidden: reloadNeeded || doneForToday || hasSeenInstructions}">
            <div>
                <p>
                    Welcome! Let's begin your first breathing practice.
                </p>
                <p>
                    Throughout your session, you will see a "coherence” score. This score shows whether your body is relaxed, according to your heart rate.  The higher the score the better!
                </p>
                <p>
                    If you start to feel lightheaded or dizzy, try breathing less deeply.
                    If that doesn't help, remove the sensor from your ear and take a break.
                    Try again later when you're feeling better.
                    Try to breathe in a relaxed way without taking in more air than necessary.
                    Don't forget to breathe in through your nose and out through your mouth or nose, whichever feels better.
                </p>
                <button @click="instructionsRead">Continue</button>
            </div>
        </div>
        <div :class="{hidden: reloadNeeded || sessionDone || doneForToday || !hasSeenInstructions}">
            <div class="img-instructions" v-if="step == 1">
                <div class="header">
                    <h2>Get ready for your breathing session!</h2>
                </div>
                <div class="container">
                    <div class="left-col">
                        <h3>
                            <ul>
                                <li>Sit on a chair with your feet flat on the floor.</li>
                                <li>Attach the ear sensor to your ear.</li>
                                <li>Rest your hands in your lap.</li>
                                <li>Following the ball pacer, breathe in as the ball goes up and breathe out as it goes down.</li>
                                <li>Breathe in through your nose and breathe out through your nose or mouth.</li>
                            </ul>
                        </h3>
                    </div>
                    <div class="right-col">
                        <img :src="seatedIcon"/>
                    </div>
                </div>
                <button @click="beginSession()">Continue</button>
            </div>
            <div v-if="step == 2">
                <div v-if="showEmoPic">
                    <img class="emoPic" :src="emoPic" />
                    <button @click="showEmoPic=false">Continue</button>
                </div>
                <div v-else>
                    <TrainingComponent 
                        :regimes="[{durationMs: sessionDurationMs, breathsPerMinute: pace, randomize: false}]"
                        :factors=factors
                        @pacerFinished="pacerFinished"
                        @sessionRestart="saveEmWaveSessionData">
                    </TrainingComponent>
                </div>
            </div>
        </div>

        <div v-if="!reloadNeeded && sessionDone">
            <UploadComponent @uploadComplete="showEndOfSessionText">
                <template #preUploadText>
                    <div class="instruction">Terrific! Please wait while we upload your data...</div>
                </template>
                <template #postUploadText>
                        <div class="instructions">
                            <div id="waiting" :class="{hidden: showFirstSessionPostUploadText || showSubsequentSessionPostUploadText}">
                                Crunching the numbers...
                                <i class="fa fa-spinner fa-spin" style="font-size: 48px;"></i>
                            </div>
                            <div :class="{hidden: !showFirstSessionPostUploadText}">
                                <p>
                                    Congratulations on completing your first session! 
                                    You will receive a small payment for every 18 minute practice each day. 
                                    You can view these payments by going to the "View" menu and selecting "Earnings".
                                    In addition to these payments, after each session, we will check whether you earned any 
                                    bonuses. The first session is not eligible for any bonuses but subsequent sessions will be.
                                </p>
                                <p v-if="factors.rewards=='completion'">
                                    Your bonuses will be based on your streaks of practice session completion. 
                                    You can earn a bonus for completing both sessions each day, and for completing at least one
                                    session three days in a row. The more consistently you practice, the better!
                                </p>
                                <p v-else>
                                    Your bonuses will be based on your coherence scores during your practice sessions. 
                                    The higher your coherence score, the better!
                                </p>
                            </div>
                            <div id="subsequentSession" :class="{hidden: !showSubsequentSessionPostUploadText}">
                                <p>You have finished your session. Great job!</p>
                                <p>
                                    {{ rewardText }}
                                </p>
                            </div>
                        </div>
                    <br/>
                    <button class="button" @click="quit">Quit</button>
                </template>
            </UploadComponent>
        </div>

        <div class="instruction" :class="{hidden: !reloadNeeded}">
            It looks like the Factorial Design Breathing Study application has been left running overnight. Please quit and restart before resuming your practice.
            <br/>
            <button class="button" @click="quit">Quit</button>
        </div>

        <div class="instruction" :class="{hidden: !doneForToday}">
            You're all finished with your training today. Please come back tomorrow to train again!
        </div>
    </div>
</template>
<script setup>
import { ref, onBeforeMount } from '@vue/runtime-core'
import ApiClient from '../../../common/api/client.js'
import { SessionStore } from '../session-store.js'
import TrainingComponent from './TrainingComponent.vue'
import UploadComponent from './UploadComponent.vue'
import { yyyymmddString, conditionToFactors, emoPicExt } from '../utils'
import { earningsTypes, maxSessionMinutes, minSessionSeconds } from '../../../common/types/types.js'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
dayjs.extend(timezone)
dayjs.extend(utc)

import seatedIcon from '../assets/seated-person.png'

const props = defineProps(['stageNum'])
let stage
const doneForToday = ref(false)
const sessionDone = ref(false)
const hasSeenInstructions = ref(false)
const startDay = yyyymmddString(new Date())
let dateCheckInterval
const reloadNeeded = ref(false)
const step = ref(1)
const factors = ref(null)
let emoPicNum
const emoPic = ref(null)
const showEmoPic = ref(false)
const pace = ref(null)
const sessionDurationMs = ref(maxSessionMinutes*60*1000)
let apiClient
let startEarnings
let stage2Sessions

const showFirstSessionPostUploadText = ref(false)
const showSubsequentSessionPostUploadText = ref(false)
const rewardText = ref(null)


onBeforeMount(async() => {
    try {
        hasSeenInstructions.value = await window.mainAPI.getKeyValue('hasSeenInstructions') === 'true'
        stage = Number.parseInt(props.stageNum)
        window.mainAPI.setStage(stage)
        const session = await SessionStore.getRendererSession()
        apiClient = new ApiClient(session)
        startEarnings = await apiClient.getEarningsForSelf()
        const data = await apiClient.getSelf()
        pace.value = data.pace
        factors.value = conditionToFactors(data.condition)
        if (factors.value.showPosEmoInstructions) {
            emoPicNum = await window.mainAPI.getNextEmoPic()
            emoPic.value = new URL(`../assets/emopics/${emoPicNum}${emoPicExt}`, import.meta.url).href
            showEmoPic.value = true
        }
        
        const minutesDoneToday = await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 2)
        const remainingMinutes = (2 * maxSessionMinutes) - minutesDoneToday
        if (remainingMinutes < 1) {
            doneForToday.value = true
            return
        }
        
        sessionDurationMs.value = Math.min(maxSessionMinutes, remainingMinutes) * 60 * 1000

        dateCheckInterval = setInterval(() => {
            const today = yyyymmddString(new Date());
            if (today != startDay) {
                // they've crossed into a new day
                // force them to quit the app
                reloadNeeded.value = true
                clearInterval(dateCheckInterval)
            }
        }, 60000);
    } catch (err) {
        console.error(err)
    }
})

async function instructionsRead() {
    await window.mainAPI.setKeyValue('hasSeenInstructions', 'true')
    hasSeenInstructions.value = true
}

async function beginSession() {
    // prevent them from jumping to look at earnings from here on out
    await window.mainAPI.disableMenus()
    step.value=2
}

async function pacerFinished() {
    // get all of our stage 2 sessions - we'll need them in showEndOfSessionText
    // and once sessionDone is set to true the database is closed and
    // we can't get them any more
    // use setTimeout to give emWave a moment to write the data
    const p = new Promise(resolve => setTimeout(async () => {
        stage2Sessions = await window.mainAPI.getEmWaveSessionsForStage(2)
        resolve()
    }, 500))
    await p
    await saveEmWaveSessionData()
    doneForToday.value = (await window.mainAPI.getEmWaveSessionMinutesForDayAndStage(new Date(), 2)) >= 36 // two 18-minute sessions/day
    sessionDone.value = true
}

function saveEmWaveSessionData() {
    return new Promise(resolve => setTimeout(async () => { // use setTimeout to give emWave a moment to save the session
        // if the session ended w/o emwave writing any data
        // (e.g., sensor wasn't attached at session start)
        // this may fetch a session that we have already stored,
        // generating unique constraint violation when we try to save
        // it again
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        if (s.durationSec > minSessionSeconds) {
            await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage, emoPicNum)
            // unset emoPicNum so that if this was just a partial session
            // and they begin another one without seeing an emopic we 
            // don't save it on the next one
            emoPicNum = null
        }
        resolve()
    }, 500) );
}

async function showEndOfSessionText() {
    const completeSessionCount = stage2Sessions.filter(s => s.durationSeconds >= maxSessionMinutes * 60).length
    if (completeSessionCount < 1) {
        // then show the end-of-first-session text and we're done
        showFirstSessionPostUploadText.value = true;
        return
    }

    // not the end of the first session
    // give earnings some time to be processed
    await new Promise(resolve => setTimeout(() => resolve(), 5000))
    // now fetch our earnings
    const earnings = await apiClient.getEarningsForSelf();
    const newEarnings = earnings.filter(earning => !startEarnings.some(oldEarning => `${oldEarning.date}|${oldEarning.type}` === `${earning.date}|${earning.type}`))
    if (newEarnings.length == 0) {
        showSubsequentSessionPostUploadText.value = true
        return
    }

    let bonusEarnings
    if (factors.value.rewards == 'completion') {
        bonusEarnings = newEarnings.filter(e => e.type === earningsTypes.STREAK_BONUS || e.type === earningsTypes.COMPLETION_BREATH2)
    } else {
        bonusEarnings = newEarnings.filter(e => e.type === earningsTypes.TOP_25 || e.type === earningsTypes.TOP_66)
    }
    
    const e = bonusEarnings[bonusEarnings.length - 1]; // might have more than one if previous uploads failed; use the last one (which is hopefully the most recent)
    if (e.type === earningsTypes.COMPLETION_BREATH2) {
        rewardText.value = `Congratulations! You received a $${e.amount / 2} bonus for completing all of today's practice sessions!`
    } else if (e.type === earningsTypes.STREAK_BONUS) {
        rewardText.value = `Congratulations! You received a $${e.amount} bonus for doing at least one session per day for three days in a row!`
    } else if (e.type === earningsTypes.TOP_25 || e.type === earningsTypes.TOP_66) {
        const adjective = e.type === earningsTypes.TOP_25 ? 'extraordinary' : 'outstanding'
        rewardText.value = `Congratulations! You received a $${e.amount} bonus for your ${adjective} coherence scores during your practice session!`
    }
    showSubsequentSessionPostUploadText.value = true
}

function quit() {
    window.mainAPI.quit()
}

</script>
<style scoped>
.hidden {
    display: none;
}
.emoPic {
    margin-left: -240px;
    width: 1100px;
}
.container {
    display: flex;
    flex-wrap: wrap;
}
.left-col, .right-col {
    width: 50%;
    padding: 20px;
    box-sizing: border-box;
    text-align: left !important;
}
.left-col li {
    padding-top: 15px;
    padding-left: 60px;
}
.right-col {
    max-height: 72vh;
}
.right-col img {
    max-width: 100%;
}
.img-instructions {
    width: 100vw;
    margin-left: -62%;
}
</style>