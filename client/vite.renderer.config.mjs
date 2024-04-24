import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config
export default defineConfig({
       plugins: [vue()],
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
});
