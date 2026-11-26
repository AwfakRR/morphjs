import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      morphjs: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      'morph-stripped': fileURLToPath(new URL('./packages/morph-stripped/src/index.ts', import.meta.url)),
    },
  },
});
