module.exports = {
  packagerConfig: {
    ignore: (file) => {
      return /node_modules\/(?!better-sqlite3)(?!bindings)(?!file-uri-to-path)/.test(file) ||
      /test/.test(file) ||
      /__mocks__/.test(file) ||
      /src\/(?!powershell)/.test(file) ||
      /vite.*config.mjs/.test(file) ||
      /.gitignore/.test(file) ||
      /babel.config.json/.test(file) ||
      /forge.config.js/.test(file) ||
      /README.md/.test(file) ||
      /yarn.lock/.test(file) ||
      /package-lock.json/.test(file)
    },
    prune: true
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
  ],
};
