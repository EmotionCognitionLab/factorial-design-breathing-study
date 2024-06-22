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
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==4">
                <p>Good work! This will also be paced breathing, but at a different pace.</p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==5">
                <p>
                    Nice! One more to go and we'll be all done with setup.
                </p>
                <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: paces[step-2], randomize: false}]" :factors="{}" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
            </div>
            <div v-else-if="step==6">
                <p>One moment while we crunch the data...</p>
            </div>
            <div v-else-if="step==7 && errorText == null">
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
    import { calculatePersonalizedPace, getConditionFactors, slowBreathsPerMinute, slowerBreathsPerMinute } from '../utils'
    import { SessionStore } from '../session-store'
    import ApiClient from '../../../common/api/client';

    // step 1: instructions
    // step 2: rest breathing
    // step 3: paced breathing @ 4.5s/breath
    // step 4: paced breathing @ 5s/breath
    // step 5: paced breathing @ 7s/breath
    // step 6: upload
    const step = ref(null)
    const props = defineProps(['stageNum'])
    const paces = ref(['rest', 13.333, 12, 8.571])
    const errorText = ref(null)
    const errorRequiresQuit = ref(false)
    let pacerHasFinished = false
    let factors
    let session;
    let apiClient
    let stage
    
    onBeforeMount(async() => {
        stage = Number.parseInt(props.stageNum)
        session = await SessionStore.getRendererSession()
        apiClient = new ApiClient(session)
        factors = await getConditionFactors(apiClient)
        window.mainAPI.setStage(stage)
        const curStep = await window.mainAPI.getKeyValue('stage1Step')
        if (!curStep) {
            step.value = 1
        } else {
            step.value = Number.parseInt(curStep)
            if (step.value == 6) {
                // something must have gone wrong during HRV analysis
                // call finalizeSetup to trigger it again and move forward
                await finalizeSetup()
            }
        }
    })

    async function saveEmWaveSessionData() {
        const s = (await window.mainAPI.extractEmWaveSessionData(-1, false))[0]
        if (s.validStatus != 1) return false

        await window.mainAPI.saveEmWaveSessionData(s.sessionUuid, s.avgCoherence, s.pulseStartTime, s.validStatus, s.durationSec, stage)
        return true
    }

    async function nextStep() {
        try {
            if (step.value == 1) {
                // They've just read an instruction screen - no need to save emwave data
                step.value += 1
                return
            }

            // give emWave a second to save the session so we don't get the wrong one
            const delayedSaveSession = new Promise((resolve, _) => {
                setTimeout(async () => {
                    const sessionValid = await saveEmWaveSessionData(paces.value[step.value - 2])
                    resolve(sessionValid)
                }, 1000)
            })
            const sessionGood = await delayedSaveSession
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
                await finalizeSetup()
            }
        } catch (err) {
            console.error(err)
        }
        
    }

    async function finalizeSetup() {
        if (stage == 1) {
            const paceSet = await setPace()
            if (!paceSet) return

            await window.mainAPI.setKeyValue('setupComplete', 'true')
        }
        
        step.value += 1 // send them straight to upload; no need for them to click a button
        await window.mainAPI.setKeyValue('stage1Step', step.value)
    }

    async function setPace() {
        const paceData = {}
        const hrvResults = []
        let personalPace

        try {

            if (factors.paceSelection === 'standard') {
                if (factors.breathingFrequency === 'slower') {
                    personalPace = slowerBreathsPerMinute
                } else {
                    personalPace = slowBreathsPerMinute
                }
            } else {
                // they're in the personalized pace condition

                // ensure we have data to calculate personalized pace
                const stage1Sessions = await window.mainAPI.getEmWaveSessionsForStage(stage)
                const sessIds = stage1Sessions.map(s => s.emWaveSessionId)
                const sessData = await window.mainAPI.getEmWaveSessionData(sessIds)
                const ibiData = sessData.map(s => s.liveIBI)
                if (ibiData.length !== 4) {
                    const verb = ibiData.length == 1 ? 'was' : 'were'
                    errorText.value = `An error has occurred. Please ask the experimenter for assistance.
                    Experimenter: Four sessions with IBI data were expected, but ${ibiData.length} ${verb} found. Please 
                    quit the app, delete the fd-breath-study.sqlite file, and restart the app.
                    `
                    errorRequiresQuit.value = true
                    return
                }
                // find hrv peaks and calculate personalized pace
                for (let i=0; i<4; i++) {
                    const ibd = ibiData[i]
                    const pace = paces.value[i]
                    const hrvPeaks = (await apiClient.getHRVAnalysis(ibd))[0] // for some reason hrv analysis results are wrapped in an array
                    hrvResults.push({pace: pace, peaks: hrvPeaks})
                }
                personalPace = calculatePersonalizedPace(factors.breathingFrequency, hrvResults.map(hrv => hrv.peaks))
            }

            paceData['pace'] = personalPace
            if (hrvResults.length > 0) {
                paceData['stage1HrvPeaks'] = hrvResults
            }
            await apiClient.updateSelf(paceData)
            return true
        } catch (err) {
            errorText.value = `An error has occurred. Please ask the experimenter for assistance.
            Experimenter: ${err.message}
            `
            errorRequiresQuit.value = true
            return false
        }
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
