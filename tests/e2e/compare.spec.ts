import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp, settle, switchTheme, tabTo } from "./helpers";

// Saved runs written straight into the app's IndexedDB (src/core/persist/runs.ts), so this needs no video
// decoding: A on hls.js defaults stalls for 2 s; B, with Fast start, starts sooner on 240p and never stalls. Their
// summaries are left for the app to make again from the runs, as it does for summaries from an older version.
const levels = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];
const curve = {
  shape: "steps",
  rttMs: 40,
  lengthS: 20,
  points: [
    { t: 0, mbps: 4 },
    { t: 10, mbps: 0.5 },
  ],
};
const sample = (t: number, bufferS: number) => ({
  type: "sample",
  t,
  bufferS,
  estimateBps: 3_000_000,
  droppedFrames: 0,
  position: 0,
});
const request = (i: number, late: boolean) => ({
  type: "request",
  t: 1 + i,
  id: `r${i}`,
  url: `https://media.example/seg${i}.m4s`,
  phase: "end",
  bytes: 100_000,
  firstByteLateMs: 0,
  bodyLateMs: late ? 600 : 0,
});

interface RunOptions {
  fast?: boolean;
  network?: { id: string; name: string };
  /** Stopped at this time, seconds. */
  stopAt?: number;
  /** The real network held back some of its downloads. */
  heldBack?: boolean;
}

function savedRun(
  id: string,
  savedAt: number,
  { fast = false, network = { id: "lift", name: "Lift" }, stopAt, heldBack = false }: RunOptions,
) {
  const all = [
    ...(fast
      ? [
          { type: "levels", t: 0.1, levels },
          { type: "level-shown", t: 0.5, level: 0 },
          { type: "first-frame", t: 0.6 },
          sample(5, 12),
          sample(15, 20),
        ]
      : [
          { type: "levels", t: 0.1, levels },
          { type: "level-shown", t: 0.9, level: 1 },
          { type: "first-frame", t: 1 },
          sample(5, 8),
          { type: "level-shown", t: 10, level: 0 },
          sample(11, 0.5),
          { type: "stall-start", t: 12 },
          { type: "stall-end", t: 14 },
          sample(15, 4),
        ]),
    ...Array.from({ length: 6 }, (_, i) => request(i, heldBack && i < 3)),
  ].sort((x, y) => x.t - y.t);
  const events = [
    ...all.filter((event) => stopAt === undefined || event.t <= stopAt),
    { type: "end", t: stopAt ?? 20, reason: stopAt === undefined ? "complete" : "stopped" },
  ];
  const player = fast
    ? { presetId: "fast-start", name: "Fast start", settings: { startLevel: 0 } }
    : { presetId: "defaults", name: "Defaults", settings: {} };
  return {
    run: {
      format: "rebuffer-run",
      version: 1,
      id,
      startedAt: savedAt - 20_000,
      savedAt,
      setup: {
        streamUrl: "https://media.example/master.m3u8",
        streamName: "Test stream",
        network: { ...network, curve },
        player,
      },
      player: { name: "hls.js", version: "1.7.3" },
      environment: { browser: "Chrome on macOS", playerSize: undefined },
      reason: stopAt === undefined ? "complete" : "stopped",
      events,
    },
    summary: {
      id,
      savedAt,
      streamName: "Test stream",
      networkName: network.name,
      playerName: player.name,
      score: 0,
      stalls: { count: 0, totalS: 0 },
      averageBitrate: undefined,
      firstFrameS: undefined,
      lengthS: stopAt ?? 20,
    },
  };
}

/** Saves A (hls.js defaults, a 2 s stall) and B (Fast start, no stall) in this browser; `a` and `b` change them. */
async function seed(
  page: Page,
  b: RunOptions = {},
  a: RunOptions = {},
  { count = 2 }: { count?: number } = {},
): Promise<void> {
  await openApp(page, "/runs");
  const now = Date.now();
  const records = [
    savedRun("aaaa1111", now - 60_000, a),
    savedRun("bbbb2222", now, { fast: true, ...b }),
  ].slice(0, count);
  await page.evaluate(async (entries) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("rebuffer");
      request.onupgradeneeded = () => {
        request.result.createObjectStore("runs");
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error("IndexedDB didn't open"));
      };
    });
    const transaction = db.transaction("runs", "readwrite");
    const store = transaction.objectStore("runs");
    for (const { run, summary } of entries) {
      store.put(run, `run/${run.id}`);
      store.put(summary, `summary/${run.id}`);
    }
    await new Promise((resolve) => {
      transaction.oncomplete = resolve;
    });
    db.close();
  }, records);
  await page.reload();
  // The app has read them (and finished loading: navigating while it starts aborts in Firefox and WebKit).
  await expect(page.getByRole("table")).toBeVisible();
}

const searchOf = (href: string | null) =>
  Object.fromEntries(new URL(href ?? "", "http://localhost").searchParams);

test("choose A, then B, then read B against A: by keyboard", async ({ page, browserName }) => {
  await seed(page);

  // Nothing is chosen for you: A first.
  await tabTo(page, browserName, page.getByRole("link", { name: "Compare two runs" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose two runs");
  await expect(page.getByRole("list", { name: "Steps" })).toContainText("1 · Choose A");
  await expect(page.getByRole("heading", { level: 2, name: "Test stream · Lift" })).toBeVisible();
  await expect(page.getByText("1 run differs from it in one thing")).toHaveCount(2);
  await tabTo(page, browserName, page.getByRole("button", { name: /^Use as A\b.*Defaults,/ }));
  await page.keyboard.press("Enter");

  // Then B, by how it differs from A.
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111$/);
  await expect(page.getByRole("heading", { level: 3, name: "One thing different" })).toBeVisible();
  await tabTo(
    page,
    browserName,
    page.getByRole("button", { name: /^Compare\b.*Player setup: Fast start,/ }),
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111&b=bbbb2222$/);

  // What changed, the verdict, and where the points went.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Defaults → Fast start");
  const runs = page.getByRole("region", { name: "The two runs" });
  await expect(runs).toContainText(/Player setup\s*Defaults\s*→\s*changed to\s*Fast start/);
  await expect(runs).toContainText("The same in both: Test stream, Lift, Chrome on macOS.");
  const verdict = page.getByRole("region", { name: /^B did / });
  await expect(verdict.getByRole("heading", { level: 2 })).toHaveText(/^B did (better|worse)$/);
  await expect(verdict).toContainText("A stalled once, for 2 s at 0:12; B didn’t stall.");
  const walk = page.getByRole("list", { name: "From A’s score to B’s, part by part" });
  await expect(walk.getByRole("listitem")).toHaveCount(6);
  await expect(walk.getByRole("listitem").nth(3)).toContainText("Stalls");
  await expect(walk.getByRole("listitem").nth(3)).toContainText("A 1 stall, 2.0 s");

  // Where they part ways, numbered as on the timeline.
  const differ = page.getByRole("region", { name: "Where they differ" });
  await expect(differ).toContainText("A stalled for 2 s");

  // The timeline as a table, in its place.
  await tabTo(
    page,
    browserName,
    page.getByRole("group", { name: "Timeline: show as" }).getByRole("button", { name: "Table" }),
  );
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Both runs as a table" });
  await settle(table);
  await expect(table.getByRole("row", { name: /^0:12 / })).toContainText("Stalled");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Swap: A becomes B. (Afresh from the top: Firefox only Tabs forward.)
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Defaults → Fast start");
  await tabTo(page, browserName, page.getByRole("button", { name: "Swap A and B" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=bbbb2222&b=aaaa1111$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fast start → Defaults");
});

test("every Compare screen passes axe in both themes", async ({ page }) => {
  await seed(page);
  for (const path of [
    "/runs/compare",
    "/runs/compare?a=aaaa1111",
    "/runs/compare?a=aaaa1111&b=bbbb2222",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const theme of ["dark", "light"] as const) {
      await switchTheme(page, theme);
      expect((await new AxeBuilder({ page }).analyze()).violations, `${path}, ${theme}`).toEqual(
        [],
      );
    }
  }
});

test("a run stopped partway compares over the stretch both covered, as a lead", async ({
  page,
}) => {
  await seed(page, { stopAt: 15 });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  await expect(page.getByRole("note")).toContainText(
    "Note: B was stopped at 0:15 of 0:20. Everything below covers the first 0:15 of both runs, so like is compared with like.",
  );
  await expect(page.getByRole("heading", { level: 2, name: /over the first 0:15$/ })).toBeVisible();
  await expect(page.getByText(/over the first 0:15 nobody has measured it/)).toBeVisible();
  expect(
    searchOf(await page.getByRole("link", { name: "Run B again" }).getAttribute("href")),
  ).toMatchObject({ player: "fast-start", network: "lift", start: "now", vs: "aaaa1111" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a stretch too short to score gets no verdict", async ({ page }) => {
  await seed(page, { stopAt: 4 });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  await expect(page.getByRole("heading", { level: 2, name: "Too short to compare" })).toBeVisible();
  await expect(page.getByText("Played 0:04 of the 0:10 needed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "What 0:04 can tell" })).toBeVisible();
  await expect(page.getByText(/points? (higher|lower)/)).toHaveCount(0);
  expect(
    searchOf(
      await page.getByRole("link", { name: "Run B again, to the end" }).getAttribute("href"),
    ),
  ).toMatchObject({ player: "fast-start", start: "now", vs: "aaaa1111" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("both stopped: run both again, A first", async ({ page }) => {
  await seed(page, { stopAt: 15 }, { stopAt: 12 });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  const again = page.getByRole("link", { name: "Run both again" });
  expect(searchOf(await again.getAttribute("href"))).toEqual({
    stream: "https://media.example/master.m3u8",
    network: "lift",
    start: "now",
    then: "bbbb2222",
  });
});

test("a run the real network held back isn't compared", async ({ page }) => {
  await seed(page, { heldBack: true });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  await expect(page.getByRole("heading", { level: 2, name: "Can’t compare these" })).toBeVisible();
  await expect(page.getByText("Held back by your network", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("region", { name: /^[AB]’s simulation check$/ })).toHaveCount(2);
  await expect(page.getByText(/^Not listed: part of B’s run/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("two changes are flagged, with the run that changes one", async ({ page }) => {
  await seed(page, { network: { id: "cafe-wifi", name: "Busy café Wi-Fi" } });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  const warning = page.getByRole("note");
  await expect(warning.getByRole("heading")).toHaveText("A and B differ in 2 things");
  const run = warning.getByRole("link", { name: "Run Fast start on Lift" });
  expect(searchOf(await run.getAttribute("href"))).toEqual({
    stream: "https://media.example/master.m3u8",
    network: "lift",
    player: "fast-start",
    start: "now",
    vs: "aaaa1111",
  });
});

test("on a phone nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await seed(page, { stopAt: 15 });
  for (const path of ["/runs/compare", "/runs/compare?a=aaaa1111&b=bbbb2222"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      path,
    ).toBeLessThanOrEqual(360);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a report's Compare with… sets A and asks for B", async ({ page, browserName }) => {
  await seed(page);
  await page.goto("/runs/aaaa1111");
  await tabTo(page, browserName, page.getByRole("link", { name: "Compare with…" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111$/);
  await expect(page.getByRole("region", { name: "A" })).toContainText("Defaults · Lift");
  await expect(page.getByRole("heading", { level: 2, name: "Choose B" })).toBeVisible();
});

test("with one run, two ways to a second", async ({ page }) => {
  await seed(page, {}, {}, { count: 1 });
  await page.goto("/runs/compare");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare needs two runs");
  const again = page.getByRole("link", { name: "Run again" });
  expect(searchOf(await again.getAttribute("href"))).toMatchObject({
    start: "now",
    vs: "aaaa1111",
  });
  await expect(page.getByRole("link", { name: "Change one thing" })).toHaveAttribute(
    "href",
    /\/runs\/aaaa1111#change-one$/,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("with no runs, a way to the first", async ({ page }) => {
  await openApp(page, "/runs/compare");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No runs to compare yet");
  await expect(page.getByRole("link", { name: "Try the tunnel" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
