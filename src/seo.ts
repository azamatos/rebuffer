/**
 * The pages the build gives a head of their own (scripts/prerender.mjs): link previews and search engines read the
 * title, description and image from the HTML, before any JavaScript runs. The router's titles come from here too.
 */

/** The site's address: canonical links, Open Graph and the sitemap name pages by it. */
export const SITE_URL = "https://rebuffer.azamatos.com";

export interface PageHead {
  path: string;
  /** The file the build writes: Cloudflare Pages serves /inspect from inspect.html. */
  file: string;
  title: string;
  description: string;
}

export const PAGES = {
  home: {
    path: "/",
    file: "index.html",
    title: "Rebuffer: see how a video player survives a bad network",
    description:
      "Run a real HLS player through a simulated bad network in your browser. Watch its quality, buffer and stalls live, then read a scored report. Nothing is uploaded.",
  },
  inspect: {
    path: "/inspect",
    file: "inspect.html",
    title: "Inspect a stream · Rebuffer",
    description:
      "Check an HLS stream in your browser: its qualities, codecs and segments, bitrates measured against what it declares, and what breaks RFC 8216 or Apple's authoring spec.",
  },
  networks: {
    path: "/networks",
    file: "networks.html",
    title: "Networks · Rebuffer",
    description:
      "Bad networks as bandwidth curves: seven presets and four recorded 4G trips. Draw your own, keep it in this browser, and run a real HLS player through it.",
  },
  about: {
    path: "/about",
    file: "about.html",
    title: "About · Rebuffer",
    description:
      "How a run works, where the simulation stops, how repeatable it is, how the score is computed, what stays in your browser, and the credits.",
  },
  runs: {
    path: "/runs",
    file: "runs.html",
    title: "Runs · Rebuffer",
    description:
      "The runs saved in this browser, with their scores and reports; compare two of them.",
  },
} as const satisfies Record<string, PageHead>;

/** The image link previews show: made by scripts/og/render.mjs into public/og.png. */
export const PREVIEW_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "Rebuffer: a real run through a train tunnel with 12 seconds of no signal. The quality steps down from 720p, the buffer falls from 22 s to 10 s and the video never stops; score 57 out of 100.",
};

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A page's <head> tags: title, description, canonical link, Open Graph and Twitter's card; Home adds JSON-LD. */
export function headTags(page: PageHead): string {
  const url = `${SITE_URL}${page.path}`;
  const title = escape(page.title);
  const description = escape(page.description);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Rebuffer" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${SITE_URL}${PREVIEW_IMAGE.path}" />`,
    `<meta property="og:image:width" content="${String(PREVIEW_IMAGE.width)}" />`,
    `<meta property="og:image:height" content="${String(PREVIEW_IMAGE.height)}" />`,
    `<meta property="og:image:alt" content="${escape(PREVIEW_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];
  if (page.path === "/") {
    const app = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Rebuffer",
      url,
      description: page.description,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any, in a modern browser",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@type": "Person", name: "Azamat Jorayev", url: "https://azamatos.com" },
    };
    // JSON in a data block; `<` can't close the script early.
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(app).replace(/</g, "\\u003c")}</script>`,
    );
  }
  return tags.join("\n    ");
}

/** sitemap.xml: the pages worth finding (not Runs, which only holds this browser's own runs). */
export function sitemap(): string {
  const urls = [PAGES.home, PAGES.inspect, PAGES.networks, PAGES.about]
    .map((page) => `  <url><loc>${SITE_URL}${page.path}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
