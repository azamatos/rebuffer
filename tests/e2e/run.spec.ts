import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { canPlayH264, settle, STREAM, switchTheme, tabTo } from "./helpers";

// 12 s: 4 Mbps, a drop to 0.4 Mbps from 0:04 to 0:08, then 4 Mbps again; RTT 50 ms.
const CURVE = "steps,50,12,0:4|4:0.4|8:4";

test("a run plays the stream through the simulated network and reports it", async ({
  page,
  browserName,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/run?stream=${encodeURIComponent(STREAM)}&curve=${encodeURIComponent(CURVE)}`);
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Custom network");
  // Before the run, the network chart previews the curve.
  await expect(
    page.getByRole("img", {
      name: "The simulated network over 0:12: between 400 kbps and 4 Mbps, with 50 ms latency.",
    }),
  ).toBeVisible();
  await expect(page.getByText("The video plays here.")).toBeVisible();
  // Keyboard only, from here to the data table.
  await tabTo(page, browserName, page.getByRole("button", { name: "Start run" }));
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toHaveText("Running", { timeout: 15_000 });
  await expect(page.getByText("First frame on screen.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Waiting for the first frame…")).toBeHidden();
  // The progress bar follows the run's clock every frame, rather than stepping four times a second.
  const fill = page.getByRole("progressbar", { name: "Run progress" }).locator("div");
  const frames = await fill.evaluate(async (element) => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      seen.add((element as HTMLElement).style.scale);
    }
    return seen.size;
  });
  expect(frames).toBeGreaterThan(3);
  // On a wide screen the left column (video, tiles, event log) ends where the charts do, however long the log gets:
  // it scrolls on its own.
  const log = page.getByRole("region", { name: /^Event log/ });
  const columnsEndTogether = async () => {
    const logBox = await log.boundingBox();
    const chartsBox = await page
      .getByRole("figure")
      .filter({ hasText: "Segment downloads" })
      .boundingBox();
    if (!logBox || !chartsBox) throw new Error("The event log or the charts have no box");
    expect(Math.abs(logBox.y + logBox.height - (chartsBox.y + chartsBox.height))).toBeLessThan(2);
  };
  await columnsEndTogether();
  await expect
    .poll(() => log.getByRole("listitem").count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(5);
  // (Unless the run has finished meanwhile on a slow machine: the result then joins the left column.)
  if ((await page.getByRole("status").textContent()) === "Running") await columnsEndTogether();
  // Switches and stalls are read out by screen readers as they happen.
  await expect(page.getByRole("log", { name: "Switches and stalls" })).toContainText(/Playing /);
  await expect(page.getByRole("status")).toHaveText("Finished", { timeout: 30_000 });
  await expect(page.getByText("Run finished.")).toBeVisible();
  // The player is gone, and the video keeps its last frame.
  await expect
    .poll(() => page.locator("video").evaluate((video) => (video as HTMLVideoElement).poster))
    .toMatch(/^data:image\/jpeg;base64,/);

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("QoE score");
  // With the result in the column, the log still shows a few lines.
  expect((await log.boundingBox())?.height).toBeGreaterThanOrEqual(239);
  // On a slow machine a few local downloads can start late; the result then says so, which is right too.
  await expect(result).toContainText(/[Yy]our connection kept up|started late|arrived late/);
  await expect(result).toContainText("hls.js 1.7.3");

  // The charts sum themselves up in words, and the canvases have been drawn on.
  await expect(
    page.getByRole("img", { name: /^Over 0:12, the network gave between 400 kbps and 4 Mbps\./ }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /^The buffer held up to / })).toBeVisible();
  const lane = page.getByRole("img", { name: /^\d+ video segments? downloaded, most at / });
  await expect(lane).toBeVisible();
  const painted = await lane.evaluate((canvas) => {
    const { width, height } = canvas as HTMLCanvasElement;
    const pixels = (canvas as HTMLCanvasElement)
      .getContext("2d")
      ?.getImageData(0, 0, width, height);
    return pixels?.data.filter((_, i) => i % 4 === 3 && pixels.data[i] !== 0).length ?? 0;
  });
  expect(painted).toBeGreaterThan(0);

  // Chart | Table: the table takes the chart's place, and the chart comes back.
  const showAs = page.getByRole("group", { name: "Segment downloads: show as" });
  await tabTo(page, browserName, showAs.getByRole("button", { name: "Table" }));
  await page.keyboard.press("Enter");
  await expect(showAs.getByRole("button", { name: "Table" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const table = page.getByRole("region", { name: "Segment downloads as a table" });
  await expect(table.getByRole("row").nth(1)).toContainText("Done");
  await expect(lane).toBeHidden();
  await settle(table);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await showAs.getByRole("button", { name: "Chart" }).focus();
  await page.keyboard.press("Space");
  await expect(lane).toBeVisible();
  await expect(table).toHaveCount(0);
});

test("a run says when the real latency is above the simulated one", async ({ page }) => {
  test.setTimeout(60_000);
  // The same stream from a server that answers 150 ms late, on an 8 s network with a 50 ms RTT.
  const slowStream = STREAM.replace("/hls/", "/slow/150/hls/");
  await page.goto(
    `/run?stream=${encodeURIComponent(slowStream)}&curve=${encodeURIComponent("steps,50,8,0:4")}`,
  );
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");

  await page.getByRole("button", { name: "Start run" }).click();
  await expect(
    page.getByText(
      /^Your real latency to localhost:4013 is about \d+ ms, above the simulated 50 ms/,
    ),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("status")).toHaveText("Finished", { timeout: 30_000 });

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText(/\d+ of \d+ downloads started late/);
  await expect(result).toContainText("Measured before the run, localhost:4013 answered in about");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  // Its report leads with the check: one line, and the details on demand.
  await page.getByRole("link", { name: "See the report" }).click();
  const check = page.getByRole("region", { name: "Simulation check" });
  await expect(check).toContainText(
    /^Simulation check: Your real network took longer to answer than the simulated latency at times: \d+ of \d+ downloads started late/,
  );
  const details = check.getByText("Details");
  await expect(check.getByText("Measured before the run")).toBeHidden();
  await details.click();
  await expect(check.getByText(/^Measured before the run, localhost:4013 answered/)).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await switchTheme(page, colorScheme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test("a repeat run takes its downloads from the copy the first run saved", async ({ page }) => {
  test.setTimeout(90_000);
  // The same stream, served as cacheable, on a 6 s network.
  const keptStream = STREAM.replace("/hls/", "/keep/hls/");
  await page.goto(
    `/run?stream=${encodeURIComponent(keptStream)}&curve=${encodeURIComponent("steps,50,6,0:4")}`,
  );
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");
  const status = page.getByRole("status");
  const result = page.getByRole("region", { name: "Result" });
  const savedCount = () =>
    page.evaluate(async () => (await (await caches.open("rebuffer-saved-v1")).keys()).length);

  await page.getByRole("button", { name: "Start run" }).click();
  await expect(status).toHaveText("Finished", { timeout: 30_000 });
  await expect(result).not.toContainText("came from the copy saved");
  // Each download is saved just after it ends.
  await expect.poll(savedCount).toBeGreaterThan(3);

  await page.getByRole("button", { name: "Run again" }).click();
  await expect(status).toHaveText("Running", { timeout: 15_000 });
  await expect(status).toHaveText("Finished", { timeout: 30_000 });
  await expect(result).toContainText(
    /(All \d+|\d+ of \d+) downloads came from the copy saved in this browser by an earlier run/,
  );

  await page.getByRole("button", { name: "Forget saved downloads" }).click();
  await expect(result).toContainText("Forgotten: the next run downloads everything");
  expect(await page.evaluate(() => caches.has("rebuffer-saved-v1"))).toBe(false);
});

test("a run counts the stall when the network goes silent", async ({ page }) => {
  test.setTimeout(60_000);
  // 20 s: 4 Mbps for 8 s (time for a slow start), then nothing for 8 s. The buffer is capped at 4 s, so it runs dry
  // whatever quality the player picks: at a low one, the 20 s test stream would otherwise fit in it whole.
  const silent = "steps,50,20,0:4|8:0|16:4";
  const smallBuffer = "maxBufferLength:4,maxMaxBufferLength:4";
  await page.goto(
    `/run?stream=${encodeURIComponent(STREAM)}&curve=${encodeURIComponent(silent)}&set=${smallBuffer}&start=now`,
  );
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");
  await expect(page.getByRole("status")).toHaveText("Finished", { timeout: 30_000 });
  // One stall at least; the player may stall again when its small buffer runs dry twice.
  await expect(page.getByText("Stall: the buffer ran out.").first()).toBeVisible();
  await expect(page.getByText(/^Playing again after \d+\.\d s\.$/).first()).toBeVisible();
  await expect(page.getByRole("log", { name: "Switches and stalls" })).toContainText(
    /\d:\d\d\.\d: Stall: the buffer ran out\..*Playing again after/,
  );
});

test("a broken network link explains itself", async ({ page }) => {
  await page.goto(`/run?curve=${encodeURIComponent("steps,50")}`);
  await expect(page.getByRole("alert")).toContainText("The network in this link is broken");
});

test("the first-run hint explains the charts until it's dismissed by keyboard", async ({
  page,
  browserName,
}) => {
  await page.goto("/run");
  const hint = page.getByRole("note", { name: "What to watch" });
  await expect(hint).toContainText("the blue area is the network");
  await tabTo(page, browserName, hint.getByRole("button", { name: "Got it" }));
  await page.keyboard.press("Enter");
  await expect(hint).toHaveCount(0);
  // Focus doesn't drop to the page with the button: it goes to the top of the screen.
  await expect(page.locator("main")).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(hint).toHaveCount(0);
});
