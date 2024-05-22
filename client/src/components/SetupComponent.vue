<template>
    <div class="wrapper">
        <div class="error" v-if="errorText != null">
            {{ errorText }}
            <div v-if="errorRequiresQuit">
                <button class="button" @click="quit">Quit</button>
            </div>
            <div v-else>
                <button class="button" @click="errorText = null">OK</button>
            </div>
        </div>
        <div v-else>
            <div class="instruction" v-if="step==1">
                Welcome! We're going to do some breathing exercises to familiarize you with the heart rate sensor and software. Please sit comfortably and connect the pulse sensor to your ear.
                <br/>
                <button @click="nextStep">Continue</button>
            </div>
            <div v-else-if="step==2">
                <RestComponent @timerFinished="nextStep" />
            </div>
            <div v-else-if="step==3">
                <p>Next you're going to breathe at a specific pace. Breathe in when the ball is going up and out when it is going down.</p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 13.333, randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==4">
                <p>Good work! This will also be paced breathing, but at a different pace.</p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 12, randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==5">
                <p>
                    Nice! One more to go and we'll be all done with setup.
                </p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 8.571, randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==6 && errorText == null">
                <UploadComponent>
                    <template #preUploadText>
                        <div class="instruction">Terrific! Thank you for completing this orientation. Please wait while we upload your data...</div>
                    </template>
                    <template #postUploadText>
                        <div class="instruction">Upload complete! At home please log in to the app to start your home training.</div>
                        <br/>
                        <button class="button" @click="quit">Quit</button>
                    </template>
                </UploadComponent>
            </div>
        </div>
    </div>
</template>

<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import RestComponent from './RestComponent.vue'
    import TrainingComponent from './TrainingComponent.vue'
    import UploadComponent from './UploadComponent.vue'
    import { getConditionFactors, slowBreathsPerMinute, slowerBreathsPerMinute } from '../utils'
    import { SessionStore } from '../session-store'
    import ApiClient from '../../../common/api/client';

    // step 1: instructions
    // step 2: rest breathing
    // step 3: paced breathing @ 4.5s/breath
    // step 4: paced breathing @ 5s/breath
    // step 5: paced breathing @ 7s/breath
    // step 6: upload
    const step = ref(null)
    const errorText = ref(null)
    const errorRequiresQuit = ref(false)
    let pacerHasFinished = false
    let factors
    let session;
    let apiClient;
    const ibiData = [];
    const stage = 1;
    
    onBeforeMount(async() => {
        session = await SessionStore.getRendererSession()
        apiClient = new ApiClient(session)
        factors = await getConditionFactors(apiClient)
        window.mainAPI.setStage(stage)
        const curStep = await window.mainAPI.getKeyValue('stage1Step')
        if (!curStep) {
            step.value = 1
        } else {
            step.value = Number.parseInt(curStep)
        }
    })

    async function saveEmWaveSessionData() {
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, true))[0]
        if (s.validStatus != 1) return false

        ibiData.push(s.liveIBI)
        await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage)
        return true
    }

    async function nextStep() {
        if (step.value == 1) {
            // They've just read an instruction screen - no need to save emwave data
            step.value += 1
            return
        }

        const sessionGood = await saveEmWaveSessionData();
        if (!sessionGood) {
            errorText.value = "Unfortunately the data for that session were invalid. Please repeat it."
            return
        }
        
        step.value += 1
        await window.mainAPI.setKeyValue('stage1Step', step.value)
        if (step.value > 3 && step.value < 6) {
            // reset the pacer
            pacerHasFinished = false
        }
        if (step.value == 6) {
            if (factors.paceSelection === 'standard') {
                await setStandardPaces()
            } else {
                await setPersonalizedPaces()
            }
            await window.mainAPI.setKeyValue('setupComplete', 'true')
        }
    }

    async function setStandardPaces() {
        if (factors.breathingFrequency === 'slower') {
            await apiClient.updateSelf({'pace': slowerBreathsPerMinute})
        } else {
            await apiClient.updateSelf({'pace': slowBreathsPerMinute})
        }
    }

    async function setPersonalizedPaces() {
        if (ibiData.length !== 4) {
            const verb = ibiData.length == 1 ? 'was' : 'were'
            errorText.value = `An error has occurred. Please ask the experimenter for assistance.
            Experimenter: Four sessions with IBI data were expected, but ${ibiData.length} ${verb} found. Please 
            quit the app, delete the fd-breath-study.sqlite file, and restart the app.
            `
            errorRequiresQuit.value = true
            return
        }
        const hrvResultPromises = ibiData.map(ibis => apiClient.getHRVAnalysis(ibis))
        const hrvResults = await Promise.all(hrvResultPromises)
        // TODO calculate personalized pace using the hrvResults
    }

    async function pacerFinished() {
        pacerHasFinished = true
    }

    function pacerStopped() {
        if (pacerHasFinished) {
            // we're all done - the pacer finished and when the sensor
            // stopped this got emitted
            nextStep()
        }
    }

    function quit() {
        window.mainAPI.quit()
    }

</script>
<style scoped>
    .wrapper {
    display: flex;
    margin: auto;
    flex: 1 1 100%;
    width: 100%;
    justify-content: center;
    }
</style>
