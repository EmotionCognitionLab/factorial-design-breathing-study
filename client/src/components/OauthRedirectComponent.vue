<template>
    <div class="instruction">
        Logging you in...
    </div>
</template>
<script setup>
    import { useRouter } from "vue-router";
    import { getAuth } from '../../../common/auth/auth.js'
    import { SessionStore } from '../session-store.js'

    const router = useRouter();

    const emit = defineEmits(['login-succeeded'])
    const cognitoAuth = getAuth()
    cognitoAuth.userhandler = {
        onSuccess: (session) => {
            SessionStore.session = session
            emit('login-succeeded')
            window.mainAPI.loginSucceeded(session)
            const dest = window.sessionStorage.getItem('FDS.postLoginPath') ? window.sessionStorage.getItem('FDS.postLoginPath') : '/'
            window.sessionStorage.removeItem('FDS.postLoginPath')
            router.push({path: dest})
        },
        onFailure: err => console.error(err)
    }

    const curUrl = window.location.href;
    if (curUrl.indexOf('?') > -1) {
        // we're handling a redirect from the oauth server
        // take the code and state from query string and let cognito parse them
        cognitoAuth.parseCognitoWebResponse(curUrl.slice(curUrl.indexOf('?')))
    }

</script>