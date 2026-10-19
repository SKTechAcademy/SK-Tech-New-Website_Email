import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    cssCodeSplit: true,
    sourcemap: true,
    reportCompressedSize: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        interviews: resolve(process.cwd(), "interviews.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
  },
});
