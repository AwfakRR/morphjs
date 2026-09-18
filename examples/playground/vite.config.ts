import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      morphjs: resolve(__dirname, "../../packages/core/src"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
