import { defineConfig, devices } from "@playwright/test";

const PORT = 4012;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "pnpm build && pnpm preview",
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // A second origin with deterministic files for the network shaper tests (tests/e2e/shaper.spec.ts).
    {
      command: "node tests/e2e/servers/files.mjs",
      url: "http://localhost:4013/",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
