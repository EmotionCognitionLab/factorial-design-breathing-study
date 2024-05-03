import { defineConfig, mergeConfig } from 'vite';
import {
  getBuildConfig,
  getBuildDefine,
  external,
  pluginHotRestart,
} from './vite.base.config.mjs';
import { builtinModules } from "node:module";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config = {
    resolve: {
      // Some libs that can run in both Web and Node.js, such as `axios`, we need to tell Vite to build them in Node.js.
      browserField: false,
      conditions: ['node'],
      mainFields: ['module', 'jsnext:main', 'jsnext'],
    },
    build: {
      lib: {
        entry: forgeConfigSelf.entry,
        fileName: () => '[name].js',
        formats: ['cjs'],
      },
      rollupOptions: {
        external: [...builtinModules, "electron", "better-sqlite3", "@aws-sdk/client-sts", "@aws-sdk/client-sso-oidc"],
      },
      sourcemap: true,
    },
    plugins: [pluginHotRestart('restart')],
    define
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
  
});
