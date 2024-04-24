<template>
    <div>
        <div id="timer" class="timer-text" :class="{small: countBy=='minutes'}" >{{ timeLeft }}</div>
        <div v-if="showButtons">
            <button class="timer-button" id="startTimer" @click="startTimer">Start</button>
            <button class="timer-button" id="stopTimer" @click="stopTimer">Stop</button>
        </div>
    </div>
</template>
<script setup>
    import { ref, computed, watch } from 'vue'

    const props = defineProps(['secondsDuration', 'showButtons', 'countBy'])
    const emit = defineEmits(['timer-started', 'timer-stopped', 'timer-finished'])
    let running = ref(false)

    let secondsRemaining = ref(props.secondsDuration)
    let interval = null
    const countBy = props.countBy ? ref(props.countBy) : ref('seconds')

    watch(running, (isRunning) => {
        if (isRunning) {
            startTimer()
        } else {
            stopTimer()
        }
    })

    watch(() => props.secondsDuration, newVal => {
        secondsRemaining.value = newVal
    })

    function reset() {
        secondsRemaining.value = props.secondsDuration
    }

    defineExpose({running, reset})

    const timeLeft = computed(() => {
        const minutes = Math.floor(secondsRemaining.value / 60)
        const seconds = secondsRemaining.value % 60
        if (countBy.value === 'seconds') {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        }

        // 14:01 - 15:00 is "15 minutes remaining"
        const minRem = seconds > 0 ? minutes + 1 : minutes
        const minTxt = minRem > 1 ? "minutes" : "minute"
        if (minRem > 0) return `${minRem.toString()} ${minTxt} remaining`
        return ''
    })

    function startTimer() {
        interval = setInterval(() => updateSecondsRemaining(), 1000)
        emit('timer-started')
    }

    function stopTimer() {
        clearInterval(interval)
        emit('timer-stopped')
    }

    function updateSecondsRemaining() {
        secondsRemaining.value -= 1
        if (secondsRemaining.value <= 0) {
            clearInterval(interval)
            emit('timer-finished')
        }
    }
</script>
<style scoped>
    .timer-text {
        font-size: 64px;
        margin: 5px 5px 5px 5px;
    }
    .timer-button {
        padding: 8px;
        font-size: 18px;
        font-weight: bold;
        margin-right: 4px;
    }
    .small {
        font-size: 24px;
    }
</style>