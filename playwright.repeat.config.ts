import { defineConfig, devices } from "@playwright/test";

// The repeatability job (tests/repeat/README.md): every network preset, run several times in Chromium on a synthetic
// stream from a local server, one run at a time. `pnpm repeat`; about an hour for five runs of each preset.
const PORT = 4014;

export default defineConfig({
  testDir: "./tests/repeat",
  // The spec computes metrics with src/core, whose modules import each other through the "@/" alias.
  tsconfig: "./tsconfig.node.json",
  globalSetup: "./tests/repeat/global-setup.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "node tests/e2e/servers/files.mjs",
      url: "http://localhost:4013/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
