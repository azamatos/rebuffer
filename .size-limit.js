// Home's JavaScript is everything its first screen runs: the scripts index.html loads (the bundler names shared chunks
// after whichever module it picks, so the list comes from the built page rather than a file-name pattern), plus the
// app itself, which src/main.tsx imports right after the first paint, with the chunks it needs. The bundler lists
// those in the entry script's preload map (`__vite__mapDeps`).
import { readFileSync } from "node:fs";

const read = (path) => {
  try {
    return readFileSync(new URL(`./dist/${path}`, import.meta.url), "utf8");
  } catch {
    throw new Error(`No dist/${path}: run \`pnpm build\` before \`pnpm size\`.`);
  }
};

const entries = [...read("index.html").matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map(
  (match) => match[1],
);
const app = entries.flatMap((entry) => {
  const deps = /__vite__mapDeps=.*?m\.f=(\[[^\]]*\])/.exec(read(entry))?.[1];
  return deps ? JSON.parse(deps) : [];
});
if (!app.some((file) => /^assets\/app-[\w-]+\.js$/.test(file)))
  throw new Error("The entry script no longer preloads the app chunk: update .size-limit.js.");
const homeScripts = [...new Set([...entries, ...app])].map((file) => `dist/${file}`);

export default [
  { name: "Home: JavaScript (brotli)", path: homeScripts, limit: "100 kB" },
  { name: "Home: CSS (brotli)", path: "dist/assets/index-*.css", limit: "8 kB" },
];
