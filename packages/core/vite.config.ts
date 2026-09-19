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
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MorphCore',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        'motion',
        'animejs',
        'gsap',
        /^motion\/.*/,
        /^animejs\/.*/,
        /^gsap\/.*/,
      ],
      output: {
        exports: 'named',
        globals: {
          motion: 'Motion',
          animejs: 'anime',
          gsap: 'gsap',
        },
      },
    },
    sourcemap: true,
  },
});
