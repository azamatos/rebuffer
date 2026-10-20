#!/usr/bin/env node
// Records the README's GIF: Home, "Try the tunnel", the whole run at 4× speed, then the report. Plays our film from
// media.azamatos.com in Playwright's Chromium, in the dark theme, and writes media/readme/rebuffer.gif (git-ignored:
// media never goes into git). Needs ffmpeg.
//   node scripts/readme/record-gif.mjs --url http://localhost:4012   (a build served by `pnpm preview`)
// The README shows it from media.azamatos.com; the owner uploads it with wrangler:
//   pnpm exec wrangler r2 object put azamatos-media/readme/rebuffer.gif --file media/readme/rebuffer.gif \
//     --content-type image/gif --cache-control "public, max-age=86400" --remote
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const urlFlag = process.argv.indexOf("--url");
const base = urlFlag > 0 ? process.argv[urlFlag + 1] : undefined;
if (!base) {
  console.error(
    "Usage: node scripts/readme/record-gif.mjs --url <the app, e.g. http://localhost:4012>",
  );
  process.exit(1);
}

const out = resolve(import.meta.dirname, "../../media/readme");
const raw = join(out, "raw");
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });

const size = { width: 1280, height: 800 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  colorScheme: "dark",
  recordVideo: { dir: raw, size },
});
// The first-run hint would push the charts below the fold.
await context.addInitScript(() => {
  localStorage.setItem("rebuffer-hints-dismissed", JSON.stringify(["run-charts"]));
});
const page = await context.newPage();
await page.goto(base);
await page.waitForTimeout(3000);
await page.getByRole("link", { name: "Try the tunnel" }).click();
await page.getByRole("status").filter({ hasText: "Finished." }).waitFor({ timeout: 150_000 });
await page.waitForTimeout(2000);
await page.getByRole("link", { name: "See the report" }).click();
await page.waitForTimeout(4000);
await page.mouse.wheel(0, 500);
await page.waitForTimeout(4000);
await context.close();
await browser.close();

const video = readdirSync(raw).find((file) => file.endsWith(".webm"));
if (!video) throw new Error("Playwright saved no video.");
const gif = join(out, "rebuffer.gif");
const result = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    join(raw, video),
    "-vf",
    "setpts=PTS/4,fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    gif,
  ],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`GIF in ${gif}`);
