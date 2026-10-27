#!/usr/bin/env node
// Makes the link preview, public/og.png (1200×630), from scripts/og/card.html. Run it again when the card changes:
//   node scripts/og/render.mjs
// The icons in public/ (favicon.svg, favicon.ico, favicon-96x96.png, apple-touch-icon.png, web-app-manifest-*.png)
// come from Claude Design as files; nothing here makes them.
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
  console.log("Wrote public/og.png.");
} finally {
  await browser.close();
}
