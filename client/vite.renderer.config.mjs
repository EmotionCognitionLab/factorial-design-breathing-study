import { defineConfig } from 'vite';
import { pluginExposeRenderer } from './vite.base.config.mjs';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config
export default defineConfig((env) => {
       const forgeEnv = env;
       const { root, mode, forgeConfigSelf } = forgeEnv;
       const name = forgeConfigSelf.name ?? '';

       return {
              root,
              mode,
              base: './',
              build: {
                     outDir: `.vite/renderer/${name}`
              },
              plugins: [pluginExposeRenderer(name), vue()],
              define: {
                     'process.env.NODE_DEBUG': false
              },
              optimizeDeps: {
                     esbuildOptions: {
                            // Node.js global to browser globalThis
                            // amazon-cognito-auth-js expects
                            // global.btoa and global.atob to exist
                            define: {
                                   global: 'globalThis',
                            },
                     },
              },
              resolve: {
                     preserveSymLinks: true,
              },
              clearScreen: false
       }   
});
