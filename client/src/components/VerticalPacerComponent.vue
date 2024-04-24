<template>
    <div style="overflow: hidden;">
        <canvas ref="pacerCanvas" width="170" height="300"></canvas>
        <br/>
    </div>
</template>
<script setup>
import { ref, onMounted } from "vue";
import breathPacerUtils from '../breath-pacer-utils'
import awsSettings from '../../../common/aws-settings.json'

const props = defineProps(['regimes', 'playAudio'])
defineExpose({start, pause, resume})
const emit = defineEmits(['pacer-finished', 'pacer-regime-changed'])
const pacerCanvas = ref(null)
let ballAnimation
let running = false

onMounted(() => {
    // just to draw the initial view of the breath pacer
    // so that there's more than an empty space shown for
    // this component
    const regime = props.regimes[0];
    const breaths = breathPacerUtils.regimeToBreaths(regime);
    ballAnimation = new BallAnimation(pacerCanvas.value, breaths, props.playAudio);
    ballAnimation.draw();
})

function handleVisibilityChange() {
    if (running && document.visibilityState == 'hidden') {
        // call ballAnimation.pause directly here
        // b/c calling just pause() would set running to false
        // that's not our decision to make - external callers control that
        ballAnimation.pause();
    } else if (running) {
        ballAnimation.resume();
    }
}

async function start() {
    let elapsed = 0;
    document.addEventListener("visibilitychange", handleVisibilityChange, false);
    running = true;
    for (const r of props.regimes) {
        const breaths = breathPacerUtils.regimeToBreaths(r);
        emit('pacer-regime-changed', elapsed, r)
        ballAnimation = new BallAnimation(pacerCanvas.value, breaths, props.playAudio);
        elapsed = await ballAnimation.start();
    }
    emit('pacer-finished');
    document.removeEventListener("visibilitychange", handleVisibilityChange, false);
    running = false;
}

function pause() {
    ballAnimation.pause();
    running = false;
}

function resume() {
    ballAnimation.resume();
    running = true;
}

class BallAnimation {
    constructor(canvas, breathSegments, playAudio) {
        this.canvas = canvas;
        this.ctx=canvas.getContext('2d');
        this.breathSegments = breathSegments;
        if (playAudio) {
            this.audioSrcInhale = new Audio(`${awsSettings.ImagesUrl}/assets/breath_in.mp3`);
            this.audioSrcExhale = new Audio(`${awsSettings.ImagesUrl}/assets/breath_out.mp3`);
        }
        // timestamp marking completion of last frame draw
        this.lastTs;
        // the amount of time (ms) since we started displaying a given entry from the breathSegments array
        this.elapsedTime = 0;
        // total time (ms) since we started running through the entire breaths array
        this.runningTime = 0;
        // the entry in the breathSegments array we're currently displaying
        this.curBreathSegment = 0;
        // radius of the ball that moves up and down to show when to inhale/exhale
        this.ballRadius = 10;
        // starting y position of the ball
        this.yPos = canvas.height-this.ballRadius;
        // account for the ball size when determining the size of the canvas,
        // since the ball stops when the bottom of the ball touches the bottom of the canvas
        // and when the top of the ball touches the top of the canvas
        this.effectiveCanvasHeight = canvas.height-this.ballRadius*2;
        // whether or not the animation is currently running
        this.running = false;
        // used to resolve the promise that completes when we finish displaying
        // every entry in the breathSegments array
        this.resolveFunc;
    }

    nextBreath() {
        this.elapsedTime=0;
        this.curBreathSegment+=1;
    }

    animate(ts) {
        if(!this.running)
            return;
        if(this.curBreathSegment >= this.breathSegments.length) {
            this.resolveFunc(Math.round(this.runningTime));
            return;
        }

        const deltaTime=ts-this.lastTs;
        this.elapsedTime+=deltaTime;
        this.runningTime+=deltaTime;
        const { durationMs, breathType } = this.breathSegments[this.curBreathSegment];

        // all breaths start with inhalation, so curBreathSegment == 0 means inhalation
        if (this.curBreathSegment == 0 && this.elapsedTime == 0 && this.audioSrcInhale) {
            this.audioSrcInhale.play()
        }

        if(this.elapsedTime>=durationMs) {
            console.debug('Inhalation sound volume', this.audioSrcInhale.volume)
            if (breathType === 'inhale' && this.audioSrcExhale) {
                this.audioSrcExhale.play();
            } else if (breathType === 'exhale' && this.audioSrcInhale) {
                this.audioSrcInhale.play();
            }
            this.nextBreath();
            requestAnimationFrame(this.animate.bind(this));
            return;
        }

        if(breathType==='inhale') {
            this.yPos -= (this.effectiveCanvasHeight/durationMs)*deltaTime;
            if(this.yPos <= 0 + this.ballRadius) {
                if (this.audioSrcExhale) this.audioSrcExhale.play();
                this.nextBreath();
            }
        } else if(breathType==='exhale') {
            this.yPos += (this.effectiveCanvasHeight/durationMs)*deltaTime;
            if(this.yPos >= this.canvas.height - this.ballRadius) {
                if (this.audioSrcInhale) this.audioSrcInhale.play();
                this.nextBreath();
            }
        }

        this.draw()
        this.lastTs=ts;
        requestAnimationFrame(this.animate.bind(this));
    }

    draw() {
        // draw rectangle around canvas
        this.ctx.strokeStyle = 'rgb(120,120,120)';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.rect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.stroke();
        // draw central vertical line for scale
        this.ctx.moveTo(this.canvas.width/2, this.canvas.height);
        this.ctx.lineTo(this.canvas.width/2, 0);
        this.ctx.stroke();
        // draw tick marks on scale
        for(let i=0;i<this.canvas.height;i+=30) {
            this.ctx.moveTo((this.canvas.width/2)-15, i);
            this.ctx.lineTo((this.canvas.width/2)+15, i);
            this.ctx.stroke();
        }
        // draw ball
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width/2, this.yPos, this.ballRadius, 0, Math.PI*2);
        this.ctx.fillStyle='blue';
        this.ctx.fill();
    }

    zeroAnimationStartTime(ts) {
        this.lastTs=ts;
        this.running=true;
        this.animate(ts);
    }

    start() {
        requestAnimationFrame(this.zeroAnimationStartTime.bind(this));
        return new Promise((res, _rej) => this.resolveFunc=res);
    };

    pause() {
        this.running=false;
    };

    resume() {
        requestAnimationFrame(this.zeroAnimationStartTime.bind(this));
    };
}

</script>