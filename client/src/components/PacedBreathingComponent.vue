<template>
    <div class="instruction-small">
        Please breathe following the ball on the screen.
        Breathe in while the ball is moving up and breathe out while the ball is moving down.
        Pause your breathing when the ball is not going up or down.
        Make sure you have the pulse device attached to your ear, and click "Start" when you're ready to begin.
        <PacerComponent 
            :regimes="startRegimes"
            :scaleH=290
            :scaleT=0.1 
            :offsetProportionX=0.25
            :offsetProportionY=0.8
            @pacerFinished="pacerFinished"
            @pacerRegimeChanged="updateRegimeStatus"
            ref="pacer" />
        <TimerComponent :secondsDuration=secondsDuration :showButtons=false :countBy="'minutes'" ref="timer" />
        <EmWaveListener :showIbi=false :showScore=showScore :condition=condition @pulseSensorCalibrated="startPacer" @pulseSensorStopped="stopPacer" @pulseSensorSignalLost="stopPacer" @pulseSensorSignalRestored="resumePacer" @pulseSensorSessionEnded="resetPacer" ref="emwaveListener"/>
    </div>
</template>

<script setup>
    import { ref, computed, watch } from '@vue/runtime-core'
    import { pullAt } from 'lodash'
    import PacerComponent from './PacerComponent.vue'
    import TimerComponent from './TimerComponent.vue'
    import EmWaveListener from './EmWaveListener.vue'

    const props = defineProps(['startRegimes', 'condition', 'showScore'])
    const emit = defineEmits(['pacer-started', 'pacer-stopped', 'pacer-finished'])

    const pacer = ref(null)
    const emwaveListener = ref(null)
    const timer = ref(null)
    const remainingRegimes = ref(props.startRegimes)
    let inProgressRegime
    const finishedRegimes = []
    const secondsDuration = computed(() => {
        return (remainingRegimes.value.reduce((prev, cur) => prev + cur.durationMs, 0)) / 1000
    })
    
    watch(() => props.startRegimes, (newVal) => {
        finishedRegimes.splice(finishedRegimes.length)
        remainingRegimes.value = newVal
    })

    async function pacerFinished() {
        emwaveListener.value.stopSensor = true
        timer.value.running = false
        emit('pacer-finished')
    }

    async function startPacer() {
        if (pacer) pacer.value.start = true
        if (timer) timer.value.running = true
        await window.mainAPI.disableMenus()
        emit('pacer-started')
    }

    function stopPacer() {
        pacer.value.pause = true
        timer.value.running = false
        emit('pacer-stopped')
    }

    function resumePacer() {
        pacer.value.resume = true
        timer.value.running = true
        emit('pacer-started')
    }

    async function updateRegimeStatus(startTime, regime) {
        if (inProgressRegime) finishedRegimes.push(inProgressRegime)
        inProgressRegime = regime
        await window.mainAPI.pacerRegimeChanged(startTime, regime)
    }

    function resetPacer() {
        pacer.value.pause = true
        timer.value.running = false
        inProgressRegime = null
        const toPull = finishedRegimes.map(r => remainingRegimes.value.findIndex(elem => elem.id === r.id)).filter(idx => idx !== -1)
        if (toPull.length > 0) pullAt(remainingRegimes.value, toPull)
        timer.value.reset()
        pacer.value.buildBreathPacer(remainingRegimes.value)
    }
</script>

<style scoped>
.instruction-small {
    max-width: 60em;
    font-size: 80%;
    padding-left: 40px;
 }
</style>