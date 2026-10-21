# Claude Design sync: notes for the next run

- Rebuffer is an app, not a component library: there's no dist entry and no `.d.ts` tree. `.design-sync/entry.ts`
  re-exports the synced parts from `src/ui/` (plus `toast`), and `cfg.componentSrcMap` names them. Pages are left out
  on purpose. To sync another part: add it to `entry.ts` and `componentSrcMap`, then author its preview.
- Build: `pnpm build && node .design-sync/app-css.mjs` (`cfg.buildCmd`), then
  `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./.design-sync/entry.ts --out ./ds-bundle`.
- CSS: `cfg.cssEntry` is the app's compiled Tailwind stylesheet (`dist/assets/index-*.css`), copied by
  `app-css.mjs` to `.design-sync/.cache/app.css` without its web-font faces, whose `/assets/` URLs don't exist in
  Claude Design. The fonts ship from `@fontsource` via `cfg.extraFonts`. The stylesheet holds only the classes the
  app uses, so previews and `conventions.md` must use existing classes (grep `ds-bundle/_ds_bundle.css`).
- Path aliases: the converter's tsconfig-paths plugin (`lib/bundle.mjs`) resolves `@/core/metrics` to the
  directory, not its `index.ts` (it tries the bare path first and `existsSync` is true for a directory). So
  `cfg.tsconfig` is NOT set; esbuild resolves `@/*` and the JSX runtime from the root `tsconfig.json`, which carries
  `paths` and `jsx` for that reason.
- Previews: the card pages paint a white body over the app's dark base, so every preview wraps its content in
  `rounded-xl bg-ground p-5 text-fg`. The light theme needs `data-theme="light"` on `<html>`, so previews show only
  the dark one.
- `Wordmark` has one size (`text-lg`); it doesn't follow the surrounding font size.
- Playwright for the render check: `.ds-sync` needs `playwright@1.64.1`, the repo's version, whose Chromium is
  already in `~/Library/Caches/ms-playwright`.
- Lint and format: `eslint.config.js` ignores `.ds-sync/`, `ds-bundle/` and `.design-sync/` (the converter compiles
  the entry and previews itself; the type-checked lint has no project for them).

## Known render warns

None after the previews were authored (2026-10-21: 14/14 render cleanly).

## Re-sync risks

- `app-css.mjs` expects exactly one `dist/assets/index-*.css` and that only font faces point at `/assets/`; a new
  asset referenced from CSS would fail it loudly.
- The ChartOrTable preview draws an SVG sketch of a network where the app draws a canvas chart: it shows the
  component's frame, not the app's chart code.
- The Toaster preview calls `toast()` every 3 s to keep the 3.2 s toast in view.
- `conventions.md` names classes from the compiled stylesheet: a class the app stops using disappears from it.
  Re-check the names against `ds-bundle/_ds_bundle.css` on every sync.
