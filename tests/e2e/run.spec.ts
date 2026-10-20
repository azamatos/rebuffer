import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { canPlayH264, STREAM, tabTo } from "./helpers";

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
  // Keyboard only, from here to the data table.
  await tabTo(page, browserName, page.getByRole("button", { name: "Start run" }));
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toHaveText("Running.", { timeout: 15_000 });
  await expect(page.getByText("First frame on screen.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 30_000 });
  await expect(page.getByText("Run finished.")).toBeVisible();

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("QoE score");
  await expect(result).toContainText("Your connection kept up");
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

  const summary = page.locator("summary", { hasText: "Segment downloads as a table" });
  await tabTo(page, browserName, summary);
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Segment downloads as a table" });
  await expect(table.getByRole("row").nth(1)).toContainText("Done");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 30_000 });

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText(/\d+ of \d+ downloads started late/);
  await expect(result).toContainText("Measured before the run, localhost:4013 answered in about");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
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
  await expect(status).toHaveText("Finished.", { timeout: 30_000 });
  await expect(result).not.toContainText("came from the copy saved");
  // Each download is saved just after it ends.
  await expect.poll(savedCount).toBeGreaterThan(3);

  await page.getByRole("button", { name: "Run again" }).click();
  await expect(status).toHaveText("Running.", { timeout: 15_000 });
  await expect(status).toHaveText("Finished.", { timeout: 30_000 });
  await expect(result).toContainText(
    /(All \d+|\d+ of \d+) downloads came from the copy saved in this browser by an earlier run/,
  );

  await page.getByRole("button", { name: "Forget saved downloads" }).click();
  await expect(result).toContainText("Forgotten: the next run downloads everything");
  expect(await page.evaluate(() => caches.has("rebuffer-saved-v1"))).toBe(false);
});

test("a broken network link explains itself", async ({ page }) => {
  await page.goto(`/run?curve=${encodeURIComponent("steps,50")}`);
  await expect(page.getByRole("alert")).toContainText("The network in this link is broken");
});
