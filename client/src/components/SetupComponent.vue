<template>
    <div class="wrapper">
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
            <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 13.333, randomize: false}]" :factors=factors @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
        </div>
        <div v-else-if="step==4">
            <p>Good work! This will also be paced breathing, but at a different pace.</p>
            <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 12, randomize: false}]" :factors=factors @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
        </div>
        <div v-else-if="step==5">
            <p>
                Nice! One more to go and we'll be all done with setup.
            </p>
            <TrainingComponent :regimes="[{durationMs: 210000, breathsPerMinute: 8.571, randomize: false}]" :factors=factors @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
        </div>
        <div v-else-if="step==6">
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
</template>

<script setup>
    import { ref, onBeforeMount } from '@vue/runtime-core'
    import RestComponent from './RestComponent.vue'
    import TrainingComponent from './TrainingComponent.vue'
    import UploadComponent from './UploadComponent.vue'
    import { getConditionFactors } from '../utils'

    // step 1: instructions
    // step 2: rest breathing
    // step 3: paced breathing @ 4.5s/breath
    // step 4: paced breathing @ 5s/breath
    // step 5: paced breathing @ 7s/breath
    // step 6: upload
    const step = ref(null)
    let pacerHasFinished = false
    const factors = ref(null)
    
    onBeforeMount(async() => {
        factors.value = await getConditionFactors()
        window.mainAPI.setStage(1)
        const curStep = await window.mainAPI.getKeyValue('stage1Step')
        if (!curStep) {
            step.value = 1
        } else {
            step.value = Number.parseInt(curStep)
        }
    })

    async function nextStep() {
        step.value += 1
        await window.mainAPI.setKeyValue('stage1Step', step.value)
        if (step.value > 3 && step.value < 6) {
            // reset the pacer
            pacerHasFinished = false
        }
        if (step.value == 6) {
            await window.mainAPI.setKeyValue('setupComplete', 'true')
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
