// Home's JavaScript is everything index.html loads: the entry script and the chunks it preloads. The bundler names
// shared chunks after whichever module it picks (React once came out as "settings-*.js"), so the list comes from the
// built page instead of a file-name pattern.
import { readFileSync } from "node:fs";

let html;
try {
  html = readFileSync(new URL("./dist/index.html", import.meta.url), "utf8");
} catch {
  throw new Error("No dist/index.html: run `pnpm build` before `pnpm size`.");
}
const homeScripts = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  (match) => `dist/${match[1]}`,
);

export default [
  { name: "Home: JavaScript (brotli)", path: homeScripts, limit: "100 kB" },
  { name: "Home: CSS (brotli)", path: "dist/assets/index-*.css", limit: "8 kB" },
];
