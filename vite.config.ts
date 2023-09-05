import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  base: "./",
  build: {
    target: "esnext",
  },
  server: {
    // it confuses WebGPU
    hmr: false,
  },
});
