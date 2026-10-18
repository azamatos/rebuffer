import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
const alias = { "@": src };

/** Bundles the Service Worker on its own, so it never shares a chunk with the app. */
async function bundleServiceWorker(mode: "development" | "production"): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "warn",
    mode,
    publicDir: false,
    resolve: { alias },
    define: { "process.env.NODE_ENV": JSON.stringify(mode) },
    build: {
      write: false,
      minify: mode === "production",
      lib: { entry: `${src}/sw/sw.ts`, formats: ["iife"], name: "rebufferShaper" },
    },
  });
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) continue;
    const chunk = output.output.find((file) => file.type === "chunk");
    if (chunk) return chunk.code;
  }
  throw new Error("The Service Worker bundle came out empty.");
}

/**
 * Serves the network shaper at /sw.js with scope "/": a classic script, because module Service
 * Workers came late to some engines. `pnpm dev` bundles it on request (cached until a source file
 * changes); `pnpm build` writes dist/sw.js, which `pnpm preview` and the host serve as a static file.
 */
function serviceWorker(): Plugin {
  let cached: Promise<string> | undefined;
  return {
    name: "rebuffer:service-worker",
    configureServer(server) {
      server.watcher.on("all", (_event, file) => {
        if (file.startsWith(src)) cached = undefined;
      });
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/sw.js") {
          next();
          return;
        }
        cached ??= bundleServiceWorker("development");
        cached.then(
          (code) => {
            response.setHeader("Content-Type", "text/javascript");
            response.setHeader("Cache-Control", "no-cache");
            response.end(code);
          },
          (error: unknown) => {
            cached = undefined;
            next(error);
          },
        );
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: await bundleServiceWorker("production"),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: { alias },
});
