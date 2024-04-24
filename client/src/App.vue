<template>
    <div id="router">
      <router-view></router-view>
    </div>
</template>

<script setup>
// import 'logger'
import { getCurrentUser } from '../../common/auth/auth.js'

// new logger.Logger(true, getCurrentUser())

window.mainAPI.onGetCurrentUser((event) => {
  event.sender.send('current-user', getCurrentUser())
})

</script>

<style>
body {
  font-family: Arial, sans-serif;
  font-size: 22px;
  line-height: 1.6em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  background-color: beige;
  height: 100%;
  width: 100%;
}
.instruction {
    max-width: 40em;
    padding: 2.5%;
    margin: auto;
}
</style>
