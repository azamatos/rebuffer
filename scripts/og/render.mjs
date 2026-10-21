#!/usr/bin/env node
// Makes the link preview and the home-screen icon in public/: og.png (1200×630) from scripts/og/card.html, and
// apple-touch-icon.png (180×180) from the favicon, square (iOS rounds the corners itself). Run it again when the
// card or the favicon changes:
//   node scripts/og/render.mjs
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const publicDir = new URL("../../public/", import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(new URL("card.html", import.meta.url).href);
  // A string: it runs in the page, where `document` is.
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.screenshot({ path: new URL("og.png", publicDir).pathname });

  const favicon = readFileSync(new URL("favicon.svg", publicDir), "utf8").replace(
    'rx="16"',
    'rx="0"',
  );
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(
    `<style>html,body{margin:0;background:#101214}svg{display:block;width:180px;height:180px}</style>${favicon}`,
  );
  await page.screenshot({ path: new URL("apple-touch-icon.png", publicDir).pathname });
  console.log("Wrote public/og.png and public/apple-touch-icon.png.");
} finally {
  await browser.close();
}
