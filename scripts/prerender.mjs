// Renders Home into dist/index.html after `vite build`, so its first paint doesn't wait for the JavaScript
// (Lighthouse on GitHub's runners measured 0.82 for performance without it); src/app.tsx hydrates it.
// Every other path is served the same file: the script in index.html marks those, and the CSS hides the markup there
// until the app has rendered its own screen.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const page = new URL("../dist/index.html", import.meta.url);
const empty = '<div id="root"></div>';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "warn",
});
try {
  /** @type {{ render: (path: string) => Promise<string> }} */
  const { render } = await server.ssrLoadModule("/src/prerender.tsx");
  // The route's <title> comes first; index.html's <head> has the same one already.
  const html = (await render("/")).replace(/^<title>[^<]*<\/title>/, "");
  if (html.includes("<title>"))
    throw new Error("Home's markup has a <title> where none was expected.");
  const built = readFileSync(page, "utf8");
  if (!built.includes(empty)) throw new Error(`dist/index.html has no empty ${empty} to fill.`);
  // In the browser, TanStack Router wraps the screen in a Suspense boundary that its server render leaves out (it
  // expects its own SSR set-up, whose inline scripts our CSP doesn't allow): add the markers of a finished boundary,
  // so React hydrates instead of throwing the markup away. tests/e2e/home.spec.ts fails if they stop matching.
  const markup = `<!--$-->${html}<!--/$-->`;
  // The Latin fonts start loading with the page rather than after the CSS, so they're usually there for the first
  // paint; when they aren't, the sized fallbacks keep the text in place (src/fonts-fallback.css).
  const fonts = readdirSync(new URL("../dist/assets/", import.meta.url)).filter((file) =>
    /^(geist-latin-wght|space-mono-latin-400)-normal-[\w-]+\.woff2$/.test(file),
  );
  if (fonts.length !== 2)
    throw new Error(`Expected the two Latin fonts in dist/assets, found ${fonts.length}.`);
  const preloads = fonts
    .map(
      (file) =>
        `<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin />`,
    )
    .join("");
  writeFileSync(
    page,
    built
      .replace(empty, `<div id="root" data-prerendered>${markup}</div>`)
      .replace("</title>", `</title>${preloads}`),
  );
  console.log(
    `Prerendered Home into dist/index.html (${(html.length / 1024).toFixed(1)} KB of HTML).`,
  );
} finally {
  await server.close();
}
