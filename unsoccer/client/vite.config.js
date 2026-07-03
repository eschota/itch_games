import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const adminHtmlPath = resolve(__dirname, "public/game-admin.html");

function serveAdminAlias(middlewares) {
  middlewares.use((request, response, next) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/admin" && url.pathname !== "/admin/") {
      next();
      return;
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(readFileSync(adminHtmlPath));
  });
}

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "unsoccer-admin-alias",
      configureServer(server) {
        serveAdminAlias(server.middlewares);
      },
      configurePreviewServer(server) {
        serveAdminAlias(server.middlewares);
      }
    }
  ],
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
