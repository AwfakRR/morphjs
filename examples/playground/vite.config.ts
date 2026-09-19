import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      'morph-stripped': resolve(__dirname, '../../packages/morph-stripped/src/index.ts'),
      morphjs: resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
