import { defineConfig } from 'vite';
import { builtinModules } from "node:module";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Some libs that can run in both Web and Node.js, such as `axios`, we need to tell Vite to build them in Node.js.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
  build: {
  	rollupOptions: {
		  external: [...builtinModules, "electron", "better-sqlite3"],
	  },
    sourcemap: true,
  }
});
