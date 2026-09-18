import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
      entryRoot: 'src',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MorphJS',
      fileName: 'morphjs',
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      external: [
        'motion',
        'animejs',
        /^motion\/.*/,
        /^animejs\/.*/,
      ],
      output: {
        exports: 'named',
        globals: {
          motion: 'Motion',
          animejs: 'anime',
        },
      },
    },
    sourcemap: true,
  },
});
