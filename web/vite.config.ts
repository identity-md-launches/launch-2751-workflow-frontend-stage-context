import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const exportDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
export default defineConfig({
  plugins: [
    react(),
    {
      name: "generated-deployment-for-dev",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url ?? "").split("?")[0];
          if (
            path !== "/imd-deployment.json" &&
            !/^\/abi\/[A-Za-z0-9_]+\.json$/.test(path)
          )
            return next();
          try {
            const bytes = await readFile(resolve(exportDir, path.slice(1)));
            res.setHeader("Content-Type", "application/json");
            res.end(bytes);
          } catch {
            res.statusCode = 503;
            res.end("Build the export first with npm run build.");
          }
        });
      },
    },
  ],
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
