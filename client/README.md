# HeartBeam

An application (based on [Vue](vuejs.org) and [Electron](electronjs.org)) that provides an alternative interface to [emWave](https://store.heartmath.com/emwavepro) for heartbeat data from the emWave sensor and that guides participants in the HeartBeam study through a daily series of tasks.

If you don't already have them, you will need [node](nodejs.org) and [yarn](https://yarnpkg.com) installed. (And, of course, [emWave](https://store.heartmath.com/emwavepro).) Once you have those, you can use the commands below to set up and run the project.

## Project setup
If you haven't already done so, go into every directory in ../common and do `npm install`. In the ../common/pay-info directory also do `npm run build`

Next, return to this directory and do:
```
yarn install
```

### Compiles and hot-reloads for development
```
yarn electron:serve
```

### Compiles and minifies for production
TODO: Replace with electron-forge documentation

As of 3/22/22, builds have to be done [with node 15 or lower](https://github.com/electron-userland/electron-builder/issues/5858). Since node 14 is LTS, we'll use that for now - that's why the `n 14.19.1` command appears below. (See the [n NPM package](https://www.npmjs.com/package/n) for details on controlling node versions.)
```
n 14.19.1
yarn run electron:build
```

### Lints and fixes files
```
yarn lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
