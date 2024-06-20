<template>
    <div>
        <div id="main">
            <div id="hb-chart" v-if="factors.showHeartRate==true">
                <canvas id="hb-chart-canvas" width="900px"></canvas>
            </div>
            <div id="pacer-animation">
                <VerticalPacerComponent 
                    :regimes="remainingRegimes"
                    :playAudio=factors.playAudioPacer
                    @pacerFinished="pacerFinished"
                    @pacerRegimeChanged="updateRegimeStatus"
                    ref="pacer" />
            </div>
            <div id="breath-dir"><i class="arrow up"></i><br/>breathe in<br/><br/><br/>breathe out <br/><i class="arrow down"></i></div>
        </div>
        <br clear="all"/>
        <div id="feedback-area">
            <div id="feedback" :class="feedbackColor">Score: {{ score }}</div>
            <div id="timer"><TimerComponent :secondsDuration=secondsDuration :showButtons=false :countBy="'minutes'" ref="timer" /></div>
        </div>
        <div v-if="factors.playAudioPacer && !hasSetSound">
            This part of the application will have sound. Make sure your volume is set so you can hear it. <br/>
            <button @click="hasSetSound=true">OK</button>
        </div>
        <div v-else>
            <EmWaveListener :showIbi=false @pulseData="savePulseData" @pulseSensorCalibrated="startDisplay" @pulseSensorStopped="stopDisplay" @pulseSensorSignalLost="stopDisplay" @pulseSensorSignalRestored="resumeDisplay" @pulseSensorSessionEnded="resetDisplay" ref="emwaveListener"/> 
        </div>
    </div>
</template>
<script setup>
import { ref, onMounted, computed } from '@vue/runtime-core'
import { isProxy, toRaw } from 'vue'
import { pullAt } from 'lodash'
import CBuffer from 'CBuffer';
import Chart from 'chart.js/auto'
import 'chartjs-adapter-dayjs-3'
import ChartStreaming from 'chartjs-plugin-streaming'
import EmWaveListener from './EmWaveListener.vue'
import VerticalPacerComponent from './VerticalPacerComponent.vue'
import TimerComponent from './TimerComponent.vue'
import { epToCoherence } from '../coherence.js'

const props = defineProps(['regimes', 'factors'])
const emit = defineEmits(['pacer-started', 'pacer-stopped', 'pacer-finished'])

const ibiData = new CBuffer(2).fill(1000) // we want the chart to show a HR of 60 when the app first loads, and 60000 ms/minute / 1000 ms/beat = 60 beats/minute
const pacer = ref(null)
const emwaveListener = ref(null)
const timer = ref(null)
const remainingRegimes = ref(props.regimes)
let inProgressRegime
const finishedRegimes = []
let ep = ref(0)
let hasSetSound = ref(false)
const secondsDuration = computed(() => {
    return (remainingRegimes.value.reduce((prev, cur) => prev + cur.durationMs, 0)) / 1000
})


const score = computed(() => {
    if (ep.value <= 0) return 0

    return epToCoherence(ep.value).toPrecision(2)
})

const feedbackColor = computed(() => {
    if (score.value < 0.5) return 'red'
    if (score.value >= 0.5 && score.value < 1.0) return 'blue'
    return 'green'
})

Chart.register(ChartStreaming)

const data = {
    datasets: [
        {
            label: 'Heart Rate (bpm)',
            backgroundColor: 'rgb(255, 99, 132)',
            borderColor: 'rgb(255, 99, 132)',
            data: []
        }
    ]
}

const onRefresh = (chart) => {
    chart.data.datasets.forEach(ds => {
        ds.data.push({
            x: Date.now(),
            y: recentHR()
        })
    })
}


function buildChartConfig() {
    return {
        type: 'line',
        data: data,
        options: {
            aspectRatio: 3,
            elements: {
                point: {
                    radius: 0
                }
            },
            plugins: {
                legend: {
                    onClick: (e) => {}
                }
            },
            scales: {
                x: {
                    type: 'realtime',
                    realtime: {
                        duration: 60000,
                        refresh: 1000,
                        onRefresh: onRefresh
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'BPM',
                    },
                    suggestedMin: 60,
                    suggestedMax: 80
                }
            },
            interaction: {
                intersect: false
            }
        }
    }
}

function savePulseData(hrData) {
    if (!hrData.artifact) {
        ibiData.push(Number.parseInt(hrData.ibi))
        ep.value = hrData.ep
    }
}

function recentHR() {
    if (ibiData.some(item => item == 0)) return 0
    const mostRecentSecond = ibiData.slice(0, 2)
    const avgIbi = (mostRecentSecond[0] + mostRecentSecond[1]) / 2
    const recent = 60000 / avgIbi
    return recent
}

async function startDisplay() {
    if (pacer) pacer.value.start()
    if (timer) timer.value.running = true
    emit('pacer-started')
    await window.mainAPI.disableMenus()
}

function stopDisplay() {
    pacer.value.pause()
    timer.value.running = false
    emit('pacer-stopped')
}

function resumeDisplay() {
    pacer.value.resume()
    timer.value.running = true
}

function resetDisplay() {
    pacer.value.pause()
    timer.value.running = false
    inProgressRegime = null
    const toPull = finishedRegimes.map(r => remainingRegimes.value.findIndex(elem => elem.id === r.id)).filter(idx => idx !== -1)
    if (toPull.length > 0) pullAt(remainingRegimes.value, toPull)
    timer.value.reset()
}

onMounted(async () => {
    if (props.factors.showHeartRate) {
        const config = buildChartConfig()
        new Chart(document.getElementById('hb-chart-canvas'), config)
    }
})

async function pacerFinished() {
    emwaveListener.value.stopSensor = true
    timer.value.running = false
    emit('pacer-finished')
}

async function updateRegimeStatus(startTime, regime) {
    if (inProgressRegime) finishedRegimes.push(inProgressRegime)
    inProgressRegime = regime
    // if we don't do this we'll fail to emit regime-changed
    // events b/c Object.clone (used by electron's ipc event system)
    // doesn't work on vue proxies
    const rawRegime = isProxy(regime) ? toRaw(regime) : regime
    await window.mainAPI.pacerRegimeChanged(startTime, rawRegime)
}

</script>
<style scoped>
    .arrow {
        border: solid rgb(75, 75, 75);
        border-width: 0 3px 3px 0;
        display: inline-block;
        padding: 3px;
    }
    .up {
        transform: rotate(-135deg);
    }
    .down {
        transform: rotate(45deg);
    }
    #breath-dir {
        color: rgb(125, 124, 124)
    }
    #feedback {
        width: 150px;
        margin-bottom: 30px;
    }
    #feedback-area {
        display: flex;
        height: 150px;
        flex-direction: column;
        align-items: center;
    }
    #hb-chart {
        width: 900px;
    }
    #main {
        display: flex;
        height: 300px;
        justify-content: center;
        gap: 20px;
    }
    #pacer-animation {
        width: 200px;
    }
    #timer {
       width: 150px;
    }
    .red {
        background-color: rgb(243, 103, 103);
    }
    .blue {
        background-color: rgb(130, 165, 242);
    }
    .green {
        background-color: rgb(124, 231, 124);
    }
</style>