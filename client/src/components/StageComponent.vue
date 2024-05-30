<template>
    <div>
        <div class="instruction" :class="{hidden: reloadNeeded || hasSeenInstructions}">
            <div>
                <p>
                    Throughout your session, you will see a "coherence” score. This score shows whether your body is relaxed, according to your heart rate.  The higher the score the better!
                </p>
                <p>
                    If you start to feel lightheaded or dizzy, try breathing less deeply. If that doesn't help, remove the sensor from your ear and take a break. Try again later when you're feeling better. Try to breathe in a relaxed way without taking in more air than necessary to stay in synchrony with the pacer.
                </p>
                <button @click="instructionsRead">Continue</button>
            </div>
        </div>
        <div :class="{hidden: reloadNeeded || sessionDone || doneForToday || !hasSeenInstructions}">
            <div class="instructions" v-if="step == 1">
                <p>
                    Please start by attaching your pulse sensor to your ear and to the computer. Please remember to sit on a chair with your feet flat on the floor and hands resting on your legs for this breathing practice.
                </p>
                <img :src="seatedIcon" />
                <p>
                    Please breathe following the breath pacer on the screen.
                    Breathe in while the ball is moving up and breathe out while the ball is moving down.
                    Pause your breathing when the ball is not going up or down.
                    Make sure you have the pulse device attached to your ear, and click the "Start" button on the next screen when you're ready to begin.
                </p>
                <button @click="step=2">Continue</button>
            </div>
            <div v-if="step == 2">
                <div v-if="showEmoPic">
                    <img class="emoPic" :src="emoPic" />
                    <button @click="showEmoPic=false">Continue</button>
                </div>
                <div v-else>
                    <TrainingComponent :regimes="[{durationMs: 18*60*1000, breathsPerMinute: pace, randomize: false}]" :factors=factors @pacerFinished="pacerFinished"></TrainingComponent>
                </div>
            </div>
        </div>

        <div v-if="!reloadNeeded && sessionDone">
            <UploadComponent>
                <template #preUploadText>
                    <div class="instruction">Terrific! Please wait while we upload your data...</div>
                </template>
                <template #postUploadText>
                        <div v-if="!doneForToday" class="instruction">Upload complete! Please come back later today for more training.</div>
                        <div v-else class="instructions">Upload complete. You're all done for today! Please come back tomorrow for more training.</div>
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
    </div>
</template>
<script setup>
import { ref, onBeforeMount } from '@vue/runtime-core'
import ApiClient from '../../../common/api/client.js'
import { SessionStore } from '../session-store.js'
import TrainingComponent from './TrainingComponent.vue'
import UploadComponent from './UploadComponent.vue'
import { yyyymmddString, conditionToFactors, emoPicExt } from '../utils'

import seatedIcon from '../assets/seated-person.png'

const props = defineProps(['stageNum'])
let stage
const doneForToday = ref(false)
const sessionDone = ref(false)
const condition = ref(null)
const hasSeenInstructions = ref(false)
const startDay = yyyymmddString(new Date())
let dateCheckInterval
const reloadNeeded = ref(false)
const step = ref(1)
const regimes = ref([])
const factors = ref(null)
let emoPicNum
const emoPic = ref(null)
const showEmoPic = ref(false)
const pace = ref(null)

onBeforeMount(async() => {
    try {
        hasSeenInstructions.value = await window.mainAPI.getKeyValue('hasSeenInstructions') === 'true'
        stage = Number.parseInt(props.stageNum)
        window.mainAPI.setStage(stage)
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const data = await apiClient.getSelf()
        pace.value = data.pace
        factors.value = conditionToFactors(data.condition)
        if (factors.value.showPosEmoInstructions) {
            emoPicNum = await window.mainAPI.getNextEmoPic()
            emoPic.value = new URL(`../assets/emopics/${emoPicNum}${emoPicExt}`, import.meta.url).href
            showEmoPic.value = true
        }
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

async function pacerFinished() {
    sessionDone.value = true
    setTimeout(async () => { // use setTimeout to give emWave a moment to save the session
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage, emoPicNum)
        
        doneForToday.value = (await window.mainAPI.getgetEmWaveSessionMinutesForDayAndStage) >= 36 // two 18-minute sessions/day
    }, 500) 
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
    margin-left: -380px;
}
</style>