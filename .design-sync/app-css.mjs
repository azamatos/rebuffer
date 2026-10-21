// The app's compiled stylesheet for Claude Design (/design-sync's cssEntry), after `pnpm build`: every class the app
// uses, the colour tokens of both themes, the base styles. Its web fonts point at /assets/, which doesn't exist in
// Claude Design, so those faces are dropped here and the fonts ship from their packages instead (cfg.extraFonts);
// the sized fallback faces, which name local fonts only, stay.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const assets = new URL("../dist/assets/", import.meta.url);
const [file, ...others] = readdirSync(assets).filter((name) => /^index-[\w-]+\.css$/.test(name));
if (!file || others.length > 0) throw new Error("Expected one dist/assets/index-*.css: run `pnpm build`.");
const css = readFileSync(new URL(file, assets), "utf8").replace(/@font-face\{[^}]*url\(\/assets\/[^}]*\}/g, "");
if (css.includes("/assets/")) throw new Error("The app's CSS still points at /assets/ after dropping its fonts.");
const cache = new URL("./.cache/", import.meta.url);
mkdirSync(cache, { recursive: true });
writeFileSync(new URL("app.css", cache), css);
console.log(`Wrote .design-sync/.cache/app.css from dist/assets/${file}.`);
