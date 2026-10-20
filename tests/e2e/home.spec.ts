import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { canPlayH264, openApp, STREAM, tabTo } from "./helpers";

test("Home sets up a run and starts it, with the keyboard alone", async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await openApp(page, "/");
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");

  await tabTo(page, browserName, page.getByRole("link", { name: "Set up your own run" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#setup$/);

  // Stream: the last choice, your own link, then type it.
  const streams = page.getByRole("group", { name: "Stream" });
  await tabTo(
    page,
    browserName,
    streams.getByRole("radio", { name: "Tears of Steel", exact: true }),
  );
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await expect(streams.getByRole("radio", { name: "Your own link" })).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Link to an HLS playlist (.m3u8)")).toBeFocused();
  await page.keyboard.type(STREAM);

  // Network: three up from the tunnel is Home fibre.
  const networks = page.getByRole("group", { name: "Network" });
  await tabTo(page, browserName, networks.getByRole("radio", { name: "Train through a tunnel" }));
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await expect(networks.getByRole("radio", { name: "Home fibre" })).toBeChecked();

  // Player: the next chip.
  const players = page.getByRole("group", { name: "Player" });
  await tabTo(page, browserName, players.getByRole("radio", { name: "Defaults" }));
  await page.keyboard.press("ArrowRight");
  await expect(players.getByRole("radio", { name: "Low-memory TV" })).toBeChecked();

  await tabTo(page, browserName, page.getByRole("button", { name: "Run · 1:00" }));
  await page.keyboard.press("Enter");

  // The Run screen opens with the setup in its link and starts by itself, then drops `start` from the link.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Home fibre · hls.js low-memory tv",
  );
  await expect(page.getByRole("status")).toHaveText("Running.", { timeout: 15_000 });
  const url = new URL(page.url());
  expect(url.pathname).toBe("/run");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    stream: STREAM,
    network: "home-fibre",
    player: "low-memory-tv",
  });

  await tabTo(page, browserName, page.getByRole("button", { name: "Stop" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 10_000 });
  await expect(page.getByText("Run stopped.")).toBeVisible();
});

test("Home explains a stream link it can't use", async ({ page }) => {
  await openApp(page, "/#setup");
  await page.getByRole("radio", { name: "Your own link" }).check();
  const field = page.getByLabel("Link to an HLS playlist (.m3u8)");
  await field.fill("media.example/video.m3u8");
  await field.press("Enter");

  await expect(page.getByRole("alert")).toHaveText(/^That isn't a web address/);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/#setup$/);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("Try the tunnel opens the Run screen and starts the tunnel", async ({ page }) => {
  await openApp(page, "/");
  await expect(page.getByRole("link", { name: "Try the tunnel" })).toHaveAttribute(
    "href",
    "/run?start=now",
  );
});

test("Home arrives ready to read, and the app takes it over without redrawing it", async ({
  browser,
  page,
}) => {
  const heading = { level: 1, name: "See how a video player survives a bad network." } as const;

  // Without JavaScript, the page already has Home's content (scripts/prerender.mjs).
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noScript.newPage();
  await plain.goto("/");
  await expect(plain.getByRole("heading", heading)).toBeVisible();
  await expect(plain.getByRole("link", { name: "Try the tunnel" })).toBeVisible();
  await noScript.close();

  // With it, React keeps the nodes that came with the page (it hydrates them), and nothing complains.
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      Object.assign(window, { prerenderedHeading: document.querySelector("h1") });
    });
  });
  await openApp(page, "/");
  await expect(page.getByRole("heading", heading)).toBeVisible();
  const kept = await page.evaluate(() => {
    const before = (window as { prerenderedHeading?: Element | null }).prerenderedHeading;
    return before !== undefined && before !== null && before === document.querySelector("h1");
  });
  expect(kept).toBe(true);
  expect(problems).toEqual([]);
});

test("other paths don't show Home's markup while the app loads", async ({ page }) => {
  // Hold the app's entry script back, as a slow network would.
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/networks", { waitUntil: "commit" });
  await expect(page.locator("#root[data-prerendered]")).toBeAttached();
  await expect(
    page.getByRole("heading", { name: "See how a video player survives a bad network." }),
  ).toBeHidden();
  release?.();
  await expect(page.getByRole("heading", { level: 1, name: "Networks" })).toBeVisible();
});
