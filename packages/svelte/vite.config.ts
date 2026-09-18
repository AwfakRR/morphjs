import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MorphSvelte',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['svelte', 'svelte/store', 'svelte/transition', 'morphjs', /^morphjs\/.*/],
      output: {
        globals: {
          svelte: 'Svelte',
          'svelte/store': 'SvelteStore',
          'svelte/transition': 'SvelteTransition',
          morphjs: 'MorphJS'
        }
      }
    }
  },
  plugins: [dts({ rollupTypes: true })]
});
