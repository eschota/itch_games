import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5174
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        characterControllerTest: resolve(__dirname, "character-controller-test.html")
      }
    }
  }
});
