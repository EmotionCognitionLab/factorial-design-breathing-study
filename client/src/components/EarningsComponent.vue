<template>
    <div>
        <div ref="payErr">
        </div>
        <div class="pay-info" ref="payInfo">

        </div>
        <button @click="goToTasks" class="button">Return to Daily Training</button>
    </div>
</template>
<script setup>
import { ref, onBeforeMount } from '@vue/runtime-core'
import { useRouter } from "vue-router"
import { SessionStore } from '../session-store.js'
import  { Payboard } from 'pay-info'
import ApiClient from "../../../common/api/client.js"
import { getCurrentUser } from '../../../common/auth/auth.js'

const router = useRouter();
const payErr = ref(null)
const payInfo = ref(null)

onBeforeMount(async () => {
    const session = await SessionStore.getRendererSession()
    const apiClient = new ApiClient(session)
    const pb = new Payboard(payInfo.value, payErr.value, apiClient, getCurrentUser())
    pb.refresh()
})

function goToTasks() {
    router.push({path: "/current-stage"})
}

</script>
<style src="pay-info/style.css"></style>