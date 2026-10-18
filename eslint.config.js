import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/",
      "media/",
      "playwright-report/",
      "test-results/",
      ".lighthouseci/",
      ".claude/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/sw/**"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  // The Service Worker runs in its own global scope: no window, no document.
  {
    files: ["src/sw/**/*.ts"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  // AGENTS.md rule 3: the core and the Service Worker stay framework-free.
  {
    files: ["src/core/**/*.ts", "src/sw/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react/*", "react-dom", "react-dom/*", "zustand", "@tanstack/*"],
              message: "src/core and src/sw stay framework-free (AGENTS.md rule 3).",
            },
            {
              group: ["@/ui/*", "@/charts/*"],
              message: "The core must not depend on the UI layer.",
            },
          ],
        },
      ],
    },
  },
);
