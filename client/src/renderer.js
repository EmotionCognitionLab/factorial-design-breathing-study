/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import { createApp } from 'vue';
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import App from './App.vue';
// import { process } from 'electron';

import SetupComponent from './components/SetupComponent.vue'
import UploadComponent from './components/UploadComponent.vue'
import LoginComponent from './components/LoginComponent.vue'
import StageComponent from './components/StageComponent.vue'
import StudyCompleteComponent from './components/StudyCompleteComponent.vue'
import EarningsComponent from './components/EarningsComponent.vue'
import DoneTodayComponent from './components/DoneTodayComponent.vue'
import OauthRedirectComponent from './components/OauthRedirectComponent.vue'
import ConnectingComponent from './components/ConnectingComponent.vue'


import { isAuthenticated, getAuth } from '../../common/auth/auth'
import { SessionStore } from './session-store'


const routes = [
    { path: '/setup', component: SetupComponent, props: {loggedIn: false} },
    { path: '/upload', component: UploadComponent },
    { path: '/signin', component: LoginComponent, name: 'signin', props: true },
    { path: '/login', beforeEnter: handleOauthRedirect, component: OauthRedirectComponent }, // TODO eliminate now-obsolete OauthRedirectComponent; the beforeEnter guard is now doing all the work
    { path: '/earnings', beforeEnter: earningsOrSetup, component: EarningsComponent },
    { path: '/stage/:stageNum', component: StageComponent, props: true },
    { path: '/donetoday', component: DoneTodayComponent},
    { path: '/alldone', component: StudyCompleteComponent},
    { path: '/current-stage', beforeEnter: chooseStage, component: StageComponent},
    { path: '/', name: 'landing-page', component: ConnectingComponent},
]

const noAuthRoutes = ['/signin', '/login', '/']
const dbRequiredRoutes = ['/earnings', '/current-stage']

const router = createRouter({
    history: process.env.IS_ELECTRON ? createWebHashHistory() : createWebHistory(),
    routes: routes
})

let isDbInitialized = false

async function earningsOrSetup() {
    if (!isDbInitialized) {
        console.error(`Database is not initialized; unable to tell if participant requires setup.`)
        return false // TODO should we just send them through signup again?
    }
    if (await window.mainAPI.getKeyValue('setupComplete') !== 'true') {
        return { path: '/setup' }
    }

    return true
}

async function chooseStage() {
    const stage2Complete = await window.mainAPI.isStageComplete(2)
    if (!stage2Complete) return {path: '/stage/2'}
    const stage3Complete = await window.mainAPI.isStageComplete(3)
    if (!stage3Complete) return {path: '/stage/3'}
    return {path: '/alldone'}
}

async function handleLoginSuccess(session) {
    SessionStore.session = session
    await window.mainAPI.loginSucceeded(session)
    isDbInitialized = true
}

async function handleOauthRedirect() {
    const curUrl = window.location.href;
    if (curUrl.indexOf('?') > -1) {
        // we're handling a redirect from the oauth server
        // take the code and state from query string and let cognito parse them
        const p = new Promise((res, rej) => {
            const cognitoAuth = getAuth()
            cognitoAuth.userhandler = {
                onSuccess: session => res(session),
                onFailure: err => {
                    console.error(err)
                    rej(err)
                }
            }

            cognitoAuth.parseCognitoWebResponse(curUrl.slice(curUrl.indexOf('?')))
        })
        
        const session = await p
        await handleLoginSuccess(session)
    }
    const dest = window.sessionStorage.getItem('FDS.postLoginPath') ? window.sessionStorage.getItem('FDS.postLoginPath') : '/'
    window.sessionStorage.removeItem('FDS.postLoginPath')
    router.push({path: dest})
}

// use navigation guards to handle authentication
router.beforeEach(async (to) => {
    // index.html means we're running as a packaged app and win.loadFile has been called
    if (to.path.endsWith('index.html')) return { path: '/' }

    if (!isAuthenticated() && !noAuthRoutes.includes(to.path)) {
        return { name: 'signin', query: { 'postLoginPath': to.path } }
    }

    if (!dbRequiredRoutes.includes(to.path)) return true

    // make sure we have a session and use it to announce login success
    // and initialize db
    const sess = await SessionStore.getRendererSession()
    if (isAuthenticated() && !sess) {
        const p = new Promise((res, rej) => {
            const cognitoAuth = getAuth()
            cognitoAuth.userhandler = {
                onSuccess: session => res(session),
                onFailure: err => {
                    console.error(err)
                    rej(err)
                }
            }
            cognitoAuth.getSession()
        })

        const session = await p
        await handleLoginSuccess(session)
    }
    return true
})

window.mainAPI.onGoTo((routePath) => {
    if (routePath.indexOf('?') !== -1) {
        const queryItems = routePath.slice(routePath.indexOf('?') + 1).split('&')
        const query = {}
        queryItems.forEach(qi => {
            const parts = qi.split('=')
            const key = parts[0]
            const value = parts.length > 1 ? parts[1] : null
            query[key] = value
        })
        router.push({path: routePath, query: query})
    } else {
        router.push({path: routePath});
    }
})


const app = createApp(App)
app.use(router)

app.mount('#app')
