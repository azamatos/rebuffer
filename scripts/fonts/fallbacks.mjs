#!/usr/bin/env node
// Writes src/fonts-fallback.css: fallback faces sized to take the same room as Geist and Space Mono, so the page
// doesn't move when the web fonts arrive (`font-display: swap`). The method is Capsize's and next/font's: scale the
// fallback by the ratio of average character widths (`size-adjust`, weighted by how often each character appears in
// English), and give it the web font's ascent, descent and line gap divided by that scale.
//
// Widths are measured in Chromium (Playwright), because the variable Geist is drawn at the weights we use (400 and
// 600) and fontkit can't vary a WOFF2. Vertical metrics come from the font files (fontkit). The fallbacks are system
// fonts: Arial and Arial Bold (macOS and Windows; Liberation Sans and Arimo on Linux share Arial's metrics), Courier
// New (Liberation Mono and Cousine share it), and Roboto on Android (Capsize's published metrics; there's no file
// here, so one face covers every weight). Run on macOS, where Arial and Courier New are installed:
//   node scripts/fonts/fallbacks.mjs
import { readFileSync, writeFileSync } from "node:fs";
import arialMetrics from "@capsizecss/metrics/arial";
import courierNewMetrics from "@capsizecss/metrics/courierNew";
import roboto from "@capsizecss/metrics/roboto";
import { chromium } from "@playwright/test";
import * as prettier from "prettier";
import * as fontkit from "fontkit";

const root = new URL("../../", import.meta.url);
const GEIST = new URL(
  "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  root,
);
const SPACE_MONO = new URL(
  "node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2",
  root,
);

// How often each character appears in English text: Capsize's Latin weightings (@capsizecss/unpack, MIT).
// prettier-ignore
const WEIGHTS = {
  0: 0.0053, 1: 0.0023, 2: 0.0026, 3: 0.001, 4: 0.0008, 5: 0.0015, 6: 0.0007, 7: 0.0005, 8: 0.0007, 9: 0.0006,
  ",": 0.0083, " ": 0.154, t: 0.0672, h: 0.0351, e: 0.0922, o: 0.0571, f: 0.017, P: 0.0023, p: 0.0163, l: 0.0304,
  "'": 0.0014, s: 0.0469, R: 0.0015, u: 0.0207, b: 0.0114, i: 0.0588, c: 0.0232, C: 0.0031, n: 0.0578, a: 0.0668,
  d: 0.0298, y: 0.0123, w: 0.011, B: 0.002, r: 0.0526, z: 0.0011, G: 0.0011, j: 0.0009, T: 0.0041, ".": 0.0079,
  L: 0.0012, k: 0.0046, m: 0.0181, "]": 0.0007, J: 0.0009, F: 0.0015, v: 0.0076, g: 0.0155, A: 0.004, N: 0.0014,
  "-": 0.0018, H: 0.0013, D: 0.0013, M: 0.0025, I: 0.0022, E: 0.0011, '"': 0.0012, S: 0.0041, "(": 0.001,
  ")": 0.001, x: 0.0025, W: 0.0012, Q: 0.0001, Y: 0.0003, q: 0.0008, V: 0.0005, á: 0.0001, K: 0.0007, U: 0.0016,
  "=": 0.0007, "[": 0.0021, O: 0.0009, é: 0.0001, $: 0.0002, ":": 0.0008, "|": 0.0038, "/": 0.0001, "%": 0.0001,
  Z: 0.0002, ";": 0.0001, X: 0.0001,
};

const dataUrl = (file) => `data:font/woff2;base64,${readFileSync(file).toString("base64")}`;

/** Average character width in em, weighted as above, for each `[font, weight]` drawn in Chromium. */
async function measure(fonts) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<style>
    @font-face { font-family: "Geist Measured"; src: url(${dataUrl(GEIST)}) format("woff2"); font-weight: 100 900; }
    @font-face { font-family: "Space Mono Measured"; src: url(${dataUrl(SPACE_MONO)}) format("woff2"); }
  </style>`);
  const widths = await page.evaluate(
    async ({ fonts, weights }) => {
      // This runs in the page.
      const { document } = globalThis;
      const canvas = document.createElement("canvas").getContext("2d");
      const results = [];
      for (const [family, weight] of fonts) {
        const font = `${weight} 1000px "${family}"`;
        await document.fonts.load(font);
        canvas.font = font;
        let sum = 0;
        let total = 0;
        for (const [character, share] of Object.entries(weights)) {
          sum += canvas.measureText(character).width * share;
          total += share;
        }
        results.push(sum / total / 1000);
      }
      return results;
    },
    { fonts, weights: WEIGHTS },
  );
  await browser.close();
  return widths;
}

const [geist400, geist600, spaceMono, arial, arialBold, courierNew] = await measure([
  ["Geist Measured", 400],
  ["Geist Measured", 600],
  ["Space Mono Measured", 400],
  ["Arial", 400],
  ["Arial", 700],
  ["Courier New", 400],
]);
// The measurement must agree with Capsize's published metrics; a system font that isn't installed falls back to
// another and wouldn't.
for (const [name, measured, metrics] of [
  ["Arial", arial, arialMetrics],
  ["Courier New", courierNew, courierNewMetrics],
]) {
  const expected = metrics.xWidthAvg / metrics.unitsPerEm;
  if (Math.abs(measured - expected) > 0.002) {
    throw new Error(
      `${name} measured ${measured}, Capsize says ${expected}: is it installed? Run this on macOS.`,
    );
  }
}

/** The vertical metrics of a font file, in em. */
function vertical(file) {
  const font = fontkit.openSync(file.pathname);
  return {
    ascent: font.ascent / font.unitsPerEm,
    descent: Math.abs(font.descent) / font.unitsPerEm,
    lineGap: font.lineGap / font.unitsPerEm,
  };
}

const percent = (value) => `${(value * 100).toFixed(2)}%`;

/** One fallback face: `local()` names, the weights it serves, and the overrides that make it match. */
function face({ family, locals, weight, primaryWidth, fallbackWidth, metrics }) {
  const sizeAdjust = primaryWidth / fallbackWidth;
  return `@font-face {
  font-family: "${family}";
  src: ${locals.map((name) => `local("${name}")`).join(", ")};
  font-weight: ${weight};
  size-adjust: ${percent(sizeAdjust)};
  ascent-override: ${percent(metrics.ascent / sizeAdjust)};
  descent-override: ${percent(metrics.descent / sizeAdjust)};
  line-gap-override: ${percent(metrics.lineGap / sizeAdjust)};
}`;
}

const geistMetrics = vertical(GEIST);
const monoMetrics = vertical(SPACE_MONO);
const arialNames = [
  "Arial",
  "ArialMT",
  "Liberation Sans",
  "LiberationSans",
  "Arimo",
  "Arimo-Regular",
];
const arialBoldNames = [
  "Arial Bold",
  "Arial-BoldMT",
  "Liberation Sans Bold",
  "LiberationSans-Bold",
  "Arimo Bold",
  "Arimo-Bold",
];

const css = `/* Made by scripts/fonts/fallbacks.mjs; run it again rather than editing this file. Fallback faces sized like Geist
   and Space Mono, so text keeps its place when the web fonts swap in (src/styles.css puts them in the font stacks).
   Measured widths, em: Geist ${geist400.toFixed(4)} (400) and ${geist600.toFixed(4)} (600), Arial ${arial.toFixed(4)}, Arial Bold
   ${arialBold.toFixed(4)}, Roboto ${(roboto.xWidthAvg / roboto.unitsPerEm).toFixed(4)} (Capsize), Space Mono ${spaceMono.toFixed(4)}, Courier New ${courierNew.toFixed(4)}. */

${face({ family: "Geist Fallback", locals: arialNames, weight: "100 500", primaryWidth: geist400, fallbackWidth: arial, metrics: geistMetrics })}

${face({ family: "Geist Fallback", locals: arialBoldNames, weight: "600 900", primaryWidth: geist600, fallbackWidth: arialBold, metrics: geistMetrics })}

/* Android has no Arial: Roboto, one face for every weight. */
${face({ family: "Geist Fallback Roboto", locals: ["Roboto", "Roboto-Regular"], weight: "100 900", primaryWidth: geist400, fallbackWidth: roboto.xWidthAvg / roboto.unitsPerEm, metrics: geistMetrics })}

${face({ family: "Space Mono Fallback", locals: ["Courier New", "CourierNewPSMT", "Liberation Mono", "LiberationMono", "Cousine", "Cousine-Regular"], weight: "100 900", primaryWidth: spaceMono, fallbackWidth: courierNew, metrics: monoMetrics })}
`;

const out = new URL("src/fonts-fallback.css", root);
const formatted = await prettier.format(css, {
  ...(await prettier.resolveConfig(out.pathname)),
  filepath: out.pathname,
});
writeFileSync(out, formatted);
console.log(formatted);
