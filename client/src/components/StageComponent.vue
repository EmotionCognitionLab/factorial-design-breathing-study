<template>
    <div>
        <div class="instruction" :class="{hidden: reloadNeeded || hasSeenInstructions}">
            <div v-if="condition === 'A'">
                <p>
                    In this study we are testing how breathing to boost your relaxation for 30 min/day affects people's emotion regulation.
                </p>
                <p>
                    You will use a paced breathing sequence to maintain a relaxed state, during two 15-minute training sessions each day. In the first few days, we will be testing which breathing sequences work best for you.
                </p>
                <p>
                    Throughout your practice session, we will show you your "coherence” score. This score indicates a pattern of heart rate associated with relaxation. You should aim to keep the score high.
                </p>
            </div>
            <div v-else>
                <p>
                    In this study we are testing how breathing to boost your alertness for 30 min/day affects people's emotion regulation.
                </p>
                <p>
                    You will use a paced breathing sequence to maintain an alert state, during two 15-minute training sessions each day. In the first few days, we will be testing which breathing sequences work best for you.
                </p>
                <p>
                    Throughout your practice session, we will show you your "coherence” score. This score indicates a pattern of heart rate associated with alertness. You should aim to keep the score high.
                </p>
            </div>
            <div>
                If you start to feel lightheaded or dizzy, try breathing less deeply. If that doesn't help, remove the sensor from your ear and take a break. Try again later when you're feeling better. Try to breathe in a relaxed way without taking in more air than necessary to stay in synchrony with the pacer.
                <br/>
                <button @click="instructionsRead">Continue</button>
            </div>
        </div>
        <div :class="{hidden: reloadNeeded || sessionDone || doneForToday || !hasSeenInstructions}">
            <div class="instructions" v-if="step == 1">
                <p>
                    We will now begin the breathing practice. Please start by attaching your pulse sensor to your ear and to the computer. Please remember to sit on a chair with your feet flat on the floor and hands resting on your legs for this breathing practice.
                </p>
                <p>
                    Please breathe following the ball on the screen.
                    Breathe in while the ball is moving up and breathe out while the ball is moving down.
                    Pause your breathing when the ball is not going up or down.
                    Make sure you have the pulse device attached to your ear, and click the "Start" button on the next screen when you're ready to begin.
                </p>
                <button @click="step=2">Continue</button>
            </div>
            <div v-if="step == 2">
                <TrainingComponent :showScore="false" :regimes=regimes :condition=condition @pacerFinished="pacerFinished"></TrainingComponent>
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
import { yyyymmddString } from '../utils'

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

onBeforeMount(async() => {
    stage = Number.parseInt(props.stageNum)
    window.mainAPI.setStage(stage)
    const session = await SessionStore.getRendererSession()
    const apiClient = new ApiClient(session)
    const data = await apiClient.getSelf()
    condition.value = data.condition
    hasSeenInstructions.value = await window.mainAPI.getKeyValue('hasSeenInstructions') === 'true'
    await setRegimes()
    dateCheckInterval = setInterval(() => {
        const today = yyyymmddString(new Date());
        if (today != startDay) {
            // they've crossed into a new day
            // force them to quit the app
            reloadNeeded.value = true
            clearInterval(dateCheckInterval)
        }
    }, 60000);
})

async function instructionsRead() {
    await window.mainAPI.setKeyValue('hasSeenInstructions', 'true')
    hasSeenInstructions.value = true
}

async function setRegimes() {
    const sessRegimes = await window.mainAPI.regimesForSession(condition.value, stage)
    doneForToday.value = sessRegimes.length == 0
    sessionDone.value = sessRegimes.length == 0
    regimes.value = sessRegimes
}

async function pacerFinished() {
    sessionDone.value = true
    setTimeout(async () => { // use setTimeout to avoid race condition with the data from last regime being saved
        // note we don't set regimes.value here
        // doing so reloads the PacedBreathingComponent, losing its reference
        // to the emwaveListener before we successfully stop the pulse sensor
        const sessRegimes = await window.mainAPI.regimesForSession(condition.value, stage)
        doneForToday.value = sessRegimes.length == 0
    }, 50) 
}

function quit() {
    window.mainAPI.quit()
}

</script>
<style scoped>
.hidden {
    display: none;
}
</style>