<template>
    <div>
        <div class="instruction">
            You're all done for today. Please come back tomorrow to continue!
        </div>
        <br/>
        <button class="button" @click="quit">Quit</button>
    </div>
</template>
<script setup>

function quit() {
    window.mainAPI.quit()
}

</script>