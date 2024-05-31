<template>
    <div>
        <div v-if="renderOK && progress == 'init'">
            <h1>Set condition</h1>
            <p>
                Current condition: {{ condition }}
                New condition: {{  newCondition }}
            </p>
            <div id="delete-warning">
                <h3>CAUTION</h3>
                <p>Changes to condition involving these factors will delete all of your data! Make sure you are done testing one condition before you start another.</p>
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
                <br/>
                <label for="showPosEmoInstructions">Show Positive Emotion Instructions</label>
                <input type="checkbox" id="showPosEmoInstructions" v-model="factors['showPosEmoInstructions']">
            </div>
            
            <label for="showHeartRate">Show Heart Rate</label>
            <input type="checkbox" id="showHeartRate" v-model="factors['showHeartRate']">
            <br/>
            <label for="playAudioPacer">Play Audio Pacer</label>
            <input type="checkbox" id="playAudioPacer" v-model="factors['playAudioPacer']">
            <br/>
            <button @click="maybeWarn" :disabled="!condsDiffer()">Save New Condition</button>

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
        <div v-if="!renderOK">
            Initializing...
        </div>
        <div v-if="progress == 'deleting'">
            <h2>Setting condition (and deleting data if necessary)...</h2>
        </div>
        <div v-if="progress == 'complete'">
            <h2>Condition reset. You must restart the app.</h2>
            <br/>
            <button @click="quit">Quit</button>
        </div>
    </div>
    
</template>
<script setup>
    import { ref, computed, onBeforeMount } from '@vue/runtime-core'
    import ApiClient from '../../../common/api/client.js'
    import { SessionStore } from '../session-store.js'
    import { conditionToFactors } from '../utils'

    const factors = ref(null)
    let origFactors
    const renderOK = ref(false)
    const condition = ref(0)
    const warningDialog = ref(null)
    const progress = ref('init')
    let apiClient

    onBeforeMount(async() => {
        try {
            const session = await SessionStore.getRendererSession()
            apiClient = new ApiClient(session)
            const data = await apiClient.getSelf()
            condition.value = data.condition
            origFactors = conditionToFactors(data.condition)
            factors.value = structuredClone(origFactors)
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

    async function maybeWarn() {
        if (requiresDeletion()) {
            warningDialog.value.showModal()
        } else {
            await saveCondition()
        }
    }

    function requiresDeletion() {
        return origFactors.breathingFrequency != factors.value.breathingFrequency ||
            origFactors.paceSelection != factors.value.paceSelection ||
            origFactors.rewards != factors.value.rewards ||
            origFactors.showPosEmoInstructions != factors.value.showPosEmoInstructions
    }

    async function saveCondition() {
        warningDialog.value.close()
        progress.value = 'deleting'

        // call updateSelf to set condition, delete pace and stage1HRVPeaks
        const updates = { condition: newCondition.value }
        if (requiresDeletion()) {
            updates.pace = null
            updates.stage1HrvPeaks = []
        }
        await apiClient.updateSelf(updates)

        if (requiresDeletion()) {
            // delete local data
            await window.mainAPI.deleteLocalData()

            // delete remote data
            await apiClient.deleteSelf();
        }

        condition.value = newCondition.value
        progress.value = 'complete'
    }

    function quit() {
        window.mainAPI.quit()
    }

</script>
<style scoped>
    button {
        margin: 10px
    }

    #delete-warning {
        background-color: rgb(215, 215, 195);
        padding: 30px;
    }
</style>