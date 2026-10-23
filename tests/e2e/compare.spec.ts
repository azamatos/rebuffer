import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openApp, settle, tabTo } from "./helpers";

// Two saved runs written straight into the app's IndexedDB (src/core/persist/runs.ts), so this needs no video
// decoding: A on hls.js defaults stalls for 2 s; B, with Fast start, starts sooner on 240p and never stalls.
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

interface RunOptions {
  fast?: boolean;
  network?: { id: string; name: string };
  /** Stopped at this time, seconds. */
  stopAt?: number;
}

function savedRun(
  id: string,
  savedAt: number,
  { fast = false, network = { id: "lift", name: "Lift" }, stopAt }: RunOptions,
) {
  const all = fast
    ? [
        { type: "levels", t: 0.1, levels },
        { type: "level-shown", t: 0.5, level: 0 },
        { type: "first-frame", t: 0.6 },
        sample(5, 12),
        sample(15, 20),
        { type: "end", t: 20, reason: "complete" },
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
        { type: "end", t: 20, reason: "complete" },
      ];
  const events =
    stopAt === undefined
      ? all
      : [
          ...all.filter((event) => event.t <= stopAt && event.type !== "end"),
          { type: "end", t: stopAt, reason: "stopped" },
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
      playerTitle: fast ? "fast start" : "defaults",
      score: 0,
      stalls: fast ? { count: 0, totalS: 0 } : { count: 1, totalS: 2 },
      averageBitrate: fast ? 400_000 : 1_670_000,
      firstFrameS: fast ? 0.6 : 1,
      lengthS: stopAt ?? 20,
    },
  };
}

/** Saves A (hls.js defaults, a 2 s stall) and B (Fast start, no stall) in this browser; `b` changes B. */
async function seed(page: Page, b: RunOptions = {}): Promise<void> {
  await openApp(page, "/runs");
  const now = Date.now();
  const records = [
    savedRun("aaaa1111", now - 60_000, {}),
    savedRun("bbbb2222", now, { fast: true, ...b }),
  ];
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
  await expect(page.getByRole("link", { name: "Compare two runs" })).toBeVisible();
}

test("two runs compare: what changed, a verdict, the numbers and the charts, by keyboard", async ({
  page,
  browserName,
}) => {
  await seed(page);

  // The Runs page offers the comparison; it starts with the newest run as B and the one before as A.
  const compare = page.getByRole("link", { name: "Compare two runs" });
  await tabTo(page, browserName, compare);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111&b=bbbb2222$/);
  await expect(page.getByRole("heading", { level: 1, name: "Compare two runs" })).toBeVisible();

  // What changed comes first: the preset, one change, with the setting it changes. Then the verdict.
  const verdict = page.getByRole("region", { name: /^B did worse/ });
  await expect(verdict).toContainText("What changed · 1 thing");
  await expect(verdict).toContainText("The preset changes 1 setting: start level auto → 0.");
  await expect(verdict.getByRole("heading", { level: 2, name: /^B did/ })).toHaveText(
    "B did worse: 19 points lower, though it never stalled.",
  );
  await expect(verdict).toContainText("▼ 19 points lower");
  await expect(verdict).toContainText("B never stalled. A stalled once, for 2 s from 0:12.");
  await expect(page.getByRole("note")).toHaveCount(0);

  // The numbers in groups, B against A in words.
  const numbers = page.getByRole("region", { name: "The numbers" });
  await expect(numbers).toContainText("5 better · 3 worse · 1 the same");
  await expect(numbers.getByRole("rowheader", { name: "Stalling" })).toBeVisible();
  await expect(numbers.getByRole("row", { name: /First frame/ })).toContainText(
    /0\.40 s sooner▲ better/,
  );
  await expect(numbers.getByRole("row", { name: /Stall time/ })).toContainText(/2 s less▲ better/);
  await expect(numbers.getByRole("row", { name: /Average bitrate/ })).toContainText("worse");

  // Each chart says what to look for and what it shows.
  await expect(
    page.getByRole("img", { name: /^Both ran on the same network, between 500 kbps and 4 Mbps\./ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "B never stalled. A stalled once, for 2 s from 0:12." }),
  ).toBeVisible();
  await expect(page.getByText("Look for how low each line gets.", { exact: false })).toBeVisible();
  await expect(
    page.getByText(
      "B's buffer held up to 20 s and never ran dry. A's held up to 8 s and ran dry at 0:12.",
    ),
  ).toBeVisible();

  // Swap: A becomes B. (Keyboard steps go top to bottom: Firefox only Tabs forward.)
  await tabTo(page, browserName, page.getByRole("button", { name: "Swap A and B" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=bbbb2222&b=aaaa1111$/);
  await expect(numbers.getByRole("row", { name: /First frame/ })).toContainText(
    /0\.40 s later▼ worse/,
  );

  // The charts as one table, in their place.
  await tabTo(
    page,
    browserName,
    page.getByRole("group", { name: "Both runs: show as" }).getByRole("button", { name: "Table" }),
  );
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Both runs as a table" });
  await settle(table);
  await expect(table.getByRole("row", { name: /^0:12 / })).toContainText("Stalled");

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a run stopped early compares over the stretch both covered, or whole by choice", async ({
  page,
  browserName,
}) => {
  await seed(page, { stopAt: 9 });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  const note = page.getByRole("note");
  await expect(note).toContainText(
    "Note: B was stopped at 0:09 of 0:20. Numbers and charts cover the first 0:09 of both runs.",
  );
  const over = note.getByRole("group", { name: "Compare over" });
  await expect(over.getByRole("button", { name: "First 0:09 of both" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { level: 2, name: /^Too early/ })).toHaveText(
    "Too early to tell: B was stopped at 0:09 of 0:20.",
  );
  await expect(page.getByText("No stalls in either run, up to 0:09.")).toBeVisible();
  const again = await page.getByRole("link", { name: "Run B again" }).getAttribute("href");
  expect(Object.fromEntries(new URL(again ?? "", "http://localhost").searchParams)).toMatchObject({
    player: "fast-start",
    network: "lift",
    start: "now",
    vs: "aaaa1111",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Whole runs: only the first frame compares.
  await tabTo(page, browserName, over.getByRole("button", { name: "Whole runs" }));
  await page.keyboard.press("Enter");
  const numbers = page.getByRole("region", { name: "The numbers" });
  await expect(numbers).toContainText("Over whole runs, only the first frame compares fairly.");
  await expect(numbers.getByRole("row", { name: /Stall time/ })).toContainText("not comparable");
  await expect(page.getByText("not comparable: B didn't finish")).toBeVisible();
});

test("two changes are flagged, with the run that tells them apart", async ({ page }) => {
  await seed(page, { network: { id: "cafe-wifi", name: "Busy café Wi-Fi" } });
  await page.goto("/runs/compare?a=aaaa1111&b=bbbb2222");
  const warning = page.getByRole("note");
  await expect(warning.getByRole("heading")).toHaveText("Warning: A and B differ in 2 things");
  await expect(warning).toContainText(
    "The network and player setup both changed, so these numbers can't say which change made the difference.",
  );
  const run = await warning
    .getByRole("link", { name: "Run A again on Busy café Wi-Fi" })
    .getAttribute("href");
  expect(Object.fromEntries(new URL(run ?? "", "http://localhost").searchParams)).toEqual({
    stream: "https://media.example/master.m3u8",
    network: "cafe-wifi",
    start: "now",
    vs: "aaaa1111",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the same setup reads as no real difference, on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openApp(page, "/runs");
  // Two runs of B's setup.
  await seed(page);
  await page.goto("/runs/compare?a=bbbb2222&b=bbbb2222");
  await expect(page.getByRole("heading", { level: 2, name: /^The same setup/ })).toHaveText(
    "The same setup, and no real difference.",
  );
  await expect(
    page.getByText("Nothing. Both ran Test stream on Lift with fast start."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "How repeatable runs are" })).toBeVisible();
  // On a phone the numbers are a list.
  const numbers = page.getByRole("region", { name: "The numbers" });
  await expect(numbers.getByRole("table")).toBeHidden();
  await expect(numbers.getByText("A 0.60 s · B 0.60 s")).toBeVisible();
  await expect(page.getByText("No stalls in either run.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a report compares its run with the newest other one", async ({ page, browserName }) => {
  await seed(page);
  await page.goto("/runs/aaaa1111");
  const compare = page.getByRole("link", { name: "Compare with…" });
  await tabTo(page, browserName, compare);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111&b=bbbb2222$/);
  await expect(page.getByRole("combobox", { name: "Run B" })).toHaveValue("bbbb2222");
});

test("comparing needs two runs", async ({ page }) => {
  await page.goto("/runs/compare");
  await expect(
    page.getByText("Comparing needs two saved runs; this browser has none."),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
