<template>
    <div>
        <slot name="bodyText">Please log in to continue.<br/></slot>
        <button id="startSetup" @click="login">
            <slot name="btnText">Login</slot>
        </button>
    </div>
</template>
<script setup>
    import { useRoute } from "vue-router";

    const route = useRoute();

    const login = () => {
        if (route.query.postLoginPath !== undefined) {
            window.sessionStorage.setItem('FDS.postLoginPath', route.query.postLoginPath)
        }
        window.mainAPI.showLoginWindow()
    }

</script>
