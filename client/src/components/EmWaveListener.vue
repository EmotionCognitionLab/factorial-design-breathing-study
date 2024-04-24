<template>
    <div>
        <div v-if="!calibrated && running && !sensorError">
            Waiting for pulse signal..
        </div>
        <div v-if="sensorError">
            No or poor signal detected. Please make sure the device is connected properly and your earlobe is warm.
            (If it is cold, try rubbing it between your thumb and forefinger to warm it up and get blood flowing to it.)
        </div>
        <div v-if="sessionEnded">
            The session has ended because it has been a long time since the device detected a pulse signal.
            Please press the start button when you are ready to start over.
        </div>
        <button class="pulse-sensor-button" id="startSensor" :disabled="running" @click="startPulseSensor">Start</button>
        <div v-if="showIbi" id="ibi">{{ ibi }}</div>
        <div v-if="showScore" id="scoreText">Score (higher is better): <span  id="score">{{ score }}</span></div>
    </div>
   
</template>
<script setup>
    import { ref, watch, computed, onMounted } from '@vue/runtime-core'
    import { epToCoherence } from '../coherence.js'

    const props = defineProps(['showIbi', 'showScore'])
    const emit = defineEmits(['pulse-sensor-calibrated', 'pulse-sensor-signal-lost', 'pulse-sensor-signal-restored', 'pulse-sensor-stopped', 'pulse-sensor-session-ended', 'pulse-data'])
    let ibi = ref(0)
    const ep = ref(-1)
    let calibrated = ref(false)
    let running = ref(false)
    let sensorError = ref(false) // set to true if we fail to get a signal at session start or if we get too many signal artifacts
    let sessionEnded = ref(false) // set to true if emwave ends the session, usually due to prolonged signal loss
    let signalLossInterval = null
    let forcedRestartInterval = null
    let notVisibleInterval = null
    let stopSensor = ref(false)
    defineExpose({stopSensor})

    const score = computed(() => {
        if (ep.value <= 0) return 0

        return epToCoherence(ep.value).toPrecision(2)
    })

    // per Mara, if we go a full minute without signal we should force the user to restart the session
    // If we go 10s without signal we should tell them to mess with their sensor/earlobe.
    const signalLossTimeout = () => !calibrated.value ? 30000 : 10000 // allows longer time for signal acquisition at start of session
    const forcedRestartTimeout = () => 60000 - signalLossTimeout() // this timer doesn't start until after the signal loss timer has fired

    watch(running, (isRunning) => {
        if (isRunning) {
            startSignalLossTimer()
        } else {
            stopSignalLossTimer()
            clearTimeout(notVisibleInterval)
        }
    })

    watch(stopSensor, (shouldStopSensor) => {
        if (shouldStopSensor) {
            stopPulseSensor()
        }
    })

    function handleVisibilityChange() {
        if (running.value && document.visibilityState == 'hidden') {
            // if the user leaves the UI hidden for more than 30s, stop the session
            notVisibleInterval = setTimeout(() => {
                forceSessionEnd()
            }, 30000)
        } else {
           clearTimeout(notVisibleInterval)
        }
    }

    onMounted(() => {
        document.addEventListener("visibilitychange", handleVisibilityChange, false);
    })

    function handleEmWaveIbiEvent(_event, hrData) {
        ibi.value = Number(hrData.ibi)
        if (ibi.value <= 0 || !Object.prototype.hasOwnProperty.call(hrData, 'ep')) return
        
        ep.value = hrData.ep

        if (!calibrated.value) {
            calibrated.value = true
            emit('pulse-sensor-calibrated')
        }
        if (sensorError.value) {
            emit('pulse-sensor-signal-restored')
        }
        emit('pulse-data', hrData)
        resetSignalLossTimer()
        resetForcedRestartTimer()
    }

    window.mainAPI.handleEmWaveIBIEvent(handleEmWaveIbiEvent)

    function handleEmWaveStatusEvent(_event, message) {
        if (message === 'SensorError') {
            stopPulseSensor()
            sensorError.value = true
        } else if (message === 'SessionEnded') {
            endPulseSensorSession()
        }
    }

    window.mainAPI.handleEmWaveStatusEvent(handleEmWaveStatusEvent)

    // eslint-disable-next-line no-unused-vars
    function startPulseSensor() {
        window.mainAPI.startPulseSensor()
        running.value = true
        stopSensor.value = false
        sessionEnded.value = false
        sensorError.value = false
    }
    
    function reset() {
        running.value = false
        calibrated.value = false
        ibi.value = 0
        ep.value = -1
    }

    // eslint-disable-next-line no-unused-vars
    function stopPulseSensor() {
        window.mainAPI.stopPulseSensor()
        emit('pulse-sensor-stopped')
        reset()
        stopSignalLossTimer()
    }

    function endPulseSensorSession() {
        emit('pulse-sensor-session-ended')
        reset()
        sessionEnded.value = true
        clearTimeout(signalLossTimeout)
        clearTimeout(forcedRestartInterval)
    }

    function forceSessionEnd() {
        sessionEnded.value = true
        emit('pulse-sensor-session-ended')
        stopPulseSensor()
    }

    function startSignalLossTimer() {
        signalLossInterval = setTimeout(
            () => { 
                sensorError.value = true
                emit('pulse-sensor-signal-lost')
                startForcedRestartTimer()
            }, 
            signalLossTimeout()
        )
    }

    function startForcedRestartTimer() {
        forcedRestartInterval = setTimeout(() => {
            forceSessionEnd()
        },
        forcedRestartTimeout()
       )
    }

    function resetForcedRestartTimer() {
        clearTimeout(forcedRestartInterval)
    }

    function stopSignalLossTimer() {
        clearTimeout(signalLossInterval)
        sensorError.value = false
    }

    function resetSignalLossTimer() {
        stopSignalLossTimer()
        startSignalLossTimer()
    }

</script>
<style scoped>
    #ibi {
        text-decoration-color: cornflowerblue;
        font-size: 80px;
        margin: 20px;
    }
    #score {
        font-size: 40px;
        display: inline-block;
        margin-left: 10px;
    }
    #scoreText {
        display: flex;
        padding-left: 420px;
    }
    .pulse-sensor-button {
        padding: 8px;
        font-size: 18px;
        font-weight: bold;
        margin-right: 4px;
    }
</style>