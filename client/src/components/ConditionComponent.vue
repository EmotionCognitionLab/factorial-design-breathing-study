<template>
    <div>
        <h1>Set condition</h1>
        <h3>IMPORTANT</h3>
        <p>This tool will delete all of your data! Make sure you are done testing one condition before you start another.</p>
        <div v-if="renderOK">
            <p>
                Current condition: {{ condition }}
                New condition: {{  newCondition }}
            </p>
            <fieldset>
                <legend>Breathing Frequency</legend>
                <label for="slow">Slow</label>
                <input type="radio" id="slow" value="slow" v-model="factors['breathingFrequency']">
                <label for="slow">Slower</label>
                <input type="radio" id="slower" value="slower" v-model="factors['breathingFrequency']">
            </fieldset>
            <fieldset>
                <legend>Pace Selection</legend>
                <label for="standard">Standard</label>
                <input type="radio" id="standard" value="standard" v-model="factors['paceSelection']">
                <label for="slow">Personalized</label>
                <input type="radio" id="personalized" value="personalized" v-model="factors['paceSelection']">
            </fieldset>
            <fieldset>
                <legend>Rewards</legend>
                <label for="completion">Completion</label>
                <input type="radio" id="completion" value="completion" v-model="factors['rewards']">
                <label for="performance">Performance</label>
                <input type="radio" id="performance" value="performance" v-model="factors['rewards']">
            </fieldset>
            <label for="showHeartRate">Show Heart Rate</label>
            <input type="checkbox" id="showHeartRate" v-model="factors['showHeartRate']">
            <br/>
            <label for="showHeartRate">Show Positive Emotion Instructions</label>
            <input type="checkbox" id="showPosEmoInstructions" v-model="factors['showPosEmoInstructions']">
            <br/>
            <label for="playAudioPacer">Play Audio Pacer</label>
            <input type="checkbox" id="playAudioPacer" v-model="factors['playAudioPacer']">
            <br/>
            <button @click="warningDialog.showModal" :disabled="!condsDiffer()">Save New Condition</button>

            <dialog ref="warningDialog">
                <h2>Warning</h2>
                <p>
                    This will delete all of your application data, both locally and on the server. 
                    It cannot be undone! Are you sure you want to continue?
                </p>
                <button @click="warningDialog.close">Don't do it!</button>
                <button @click="saveCondition">I'm ready - go ahead</button>
            </dialog>
        </div>
        <div v-else>
            Initializing...
        </div>
    </div>
    
</template>
<script setup>
    import { ref, computed, onBeforeMount } from '@vue/runtime-core'
    import ApiClient from '../../../common/api/client.js'
    import { SessionStore } from '../session-store.js'
    import { conditionToFactors } from '../utils'

    const factors = ref(null)
    const renderOK = ref(false)
    const condition = ref(0)
    const warningDialog = ref(null)

    onBeforeMount(async() => {
        try {
            const session = await SessionStore.getRendererSession()
            const apiClient = new ApiClient(session)
            const data = await apiClient.getSelf()
            condition.value = data.condition
            factors.value = conditionToFactors(data.condition)
            renderOK.value = true
        } catch (err) {
            console.error(err)
        }
    })

    const newCondition = computed(() => {
        let binStr = ""
        if (factors.value.breathingFrequency == "slower") {
            binStr += "0"
        } else {
            binStr += "1"
        }
        if (factors.value.paceSelection == "standard") {
            binStr += "0"
        } else {
            binStr += "1"
        }
        if (factors.value.showHeartRate) {
            binStr += "1"
        } else {
            binStr += "0"
        }
        if (factors.value.showPosEmoInstructions) {
            binStr += "1"
        } else {
            binStr += "0"
        }
        if (factors.value.playAudioPacer) {
            binStr += "1"
        } else {
            binStr += "0"
        }
        if (factors.value.rewards == "completion") {
            binStr += "0"
        } else {
            binStr += "1"
        }
        return parseInt(binStr, 2)
    })

    function condsDiffer() {
        return condition.value != newCondition.value
    }

    async function saveCondition() {
        // TODO 
        console.debug('not implemented')
        warningDialog.value.close()
    }
</script>
<style scoped>
    button {
        margin: 10px
    }
</style>