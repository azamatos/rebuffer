import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { tabTo } from "./helpers";

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

function savedRun(id: string, savedAt: number, fast: boolean) {
  const events = fast
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
        network: { id: "lift", name: "Lift", curve },
        player,
      },
      player: { name: "hls.js", version: "1.7.3" },
      environment: { browser: "Chrome on macOS", playerSize: undefined },
      reason: "complete",
      events,
    },
    summary: {
      id,
      savedAt,
      streamName: "Test stream",
      networkName: "Lift",
      playerName: player.name,
      playerTitle: fast ? "fast start" : "defaults",
      score: 0,
      stalls: fast ? { count: 0, totalS: 0 } : { count: 1, totalS: 2 },
      averageBitrate: fast ? 400_000 : 1_670_000,
      firstFrameS: fast ? 0.6 : 1,
      lengthS: 20,
    },
  };
}

async function seed(page: Page): Promise<void> {
  await page.goto("/runs");
  const now = Date.now();
  const records = [savedRun("aaaa1111", now - 60_000, false), savedRun("bbbb2222", now, true)];
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
}

test("two runs compare side by side, by keyboard", async ({ page, browserName }) => {
  await seed(page);

  // The Runs page offers the comparison; it starts with the newest run as B and the one before as A.
  const compare = page.getByRole("link", { name: "Compare two runs" });
  await tabTo(page, browserName, compare);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111&b=bbbb2222$/);
  await expect(page.getByRole("heading", { level: 1, name: "Compare two runs" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Run A" })).toContainText("Lift · hls.js defaults");
  await expect(page.getByRole("region", { name: "Run B" })).toContainText(
    "Lift · hls.js fast start",
  );

  // What changed: the player and its one setting, nothing else.
  const changed = page.getByRole("region", { name: "What changed" });
  await expect(changed.getByRole("row")).toHaveCount(3);
  await expect(changed.getByRole("row", { name: /startLevel/ })).toContainText("auto");

  // The numbers, B against A, in words.
  const numbers = page.getByRole("region", { name: "The numbers" });
  await expect(numbers.getByRole("row", { name: /First frame/ })).toContainText(
    "0.40 s sooner better",
  );
  await expect(numbers.getByRole("row", { name: /Stall time/ })).toContainText("2 s less better");
  await expect(numbers.getByRole("row", { name: /Average bitrate/ })).toContainText("worse");

  // The overlaid charts sum themselves up, and have a table.
  await expect(
    page.getByRole("img", { name: /^Both ran on the same network, between 500 kbps and 4 Mbps\./ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "A stalled once, 2 s in all, first at 0:12; B never stalled." }),
  ).toBeVisible();
  const summary = page.locator("summary", { hasText: "Both runs as a table" });
  await tabTo(page, browserName, summary);
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Both runs as a table" });
  await expect(table.getByRole("row", { name: /^0:12 / })).toContainText("Stalled");

  // Swap: A becomes B.
  await tabTo(page, browserName, page.getByRole("button", { name: "Swap A and B" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=bbbb2222&b=aaaa1111$/);
  await expect(numbers.getByRole("row", { name: /First frame/ })).toContainText(
    "0.40 s later worse",
  );

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a report compares its run with the newest other one", async ({ page, browserName }) => {
  await seed(page);
  await page.goto("/runs/aaaa1111");
  const compare = page.getByRole("link", { name: "Compare with…" });
  await tabTo(page, browserName, compare);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/compare\?a=aaaa1111&b=bbbb2222$/);
  await expect(page.getByLabel("Run B")).toHaveValue("bbbb2222");
});

test("comparing needs two runs", async ({ page }) => {
  await page.goto("/runs/compare");
  await expect(
    page.getByText("Comparing needs two saved runs; this browser has none."),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
