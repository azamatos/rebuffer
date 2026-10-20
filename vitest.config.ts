import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests cover the framework-free core (and tests/unit: checks across files); screens are tested with Playwright.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
