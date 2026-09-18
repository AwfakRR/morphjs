import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MorphTanStack',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['morphjs', /^morphjs\/.*/, /^@tanstack\/.*/],
      output: {
        globals: {
          morphjs: 'MorphJS',
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
