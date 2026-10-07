import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Dev/preview: serve dashboard.html for /<city> (production uses public/_redirects). */
function cityRoutes(): Plugin {
  const rewrite = (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, _res, next) => {
      const slug = /^\/([a-z0-9_]+)\/?(\?.*)?$/.exec(req.url ?? "")?.[1];
      if (slug && existsSync(resolve("public/data", `${slug}.json`))) req.url = "/dashboard.html";
      next();
    });
  };
  return { name: "city-routes", configureServer: rewrite, configurePreviewServer: rewrite };
}

export default defineConfig({
  server: { port: 8080 },
  plugins: [cityRoutes()],
  build: {
    target: "es2022",
    rollupOptions: {
      input: { main: resolve("index.html"), dashboard: resolve("dashboard.html") },
    },
  },
});
