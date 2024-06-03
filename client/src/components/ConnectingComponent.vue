<template>
    <div>
        <div v-if="!connectionError">
            <h2>Connecting to pulse sensor...</h2>
            <i class="fa fa-spinner fa-spin" style="font-size: 48px;"></i>
        </div>
        <div v-else>
            <h2>Unable to connect to sensor. If you encounter this frequently you may want to restart your computer.</h2>
            <button @click="quit">Quit</button>
        </div>
    </div>
</template>
<script setup>
    import { ref } from 'vue'
    import { useRouter } from "vue-router"

    const router = useRouter()
    const connectionError = ref(false)

    function handleEmWaveStatusEvent(_event, message) {
        if (message === 'ConnectionFailure') {
            connectionError.value = true
        } else if (message === 'Connected') {
            router.push({path: '/setup'})
        }
    }

    window.mainAPI.handleEmWaveStatusEvent(handleEmWaveStatusEvent)

    function quit() {
        window.mainAPI.quit()
    }

</script>
<style scoped>
@import 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css';
</style>