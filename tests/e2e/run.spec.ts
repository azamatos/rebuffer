import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The synthetic stream from tests/e2e/fixtures/make-stream.mjs, served cross-origin by tests/e2e/servers/files.mjs.
const STREAM = "http://localhost:4013/hls/ladder/master.m3u8";
// 12 s: 4 Mbps, a drop to 0.4 Mbps from 0:04 to 0:08, then 4 Mbps again; RTT 50 ms.
const CURVE = "steps,50,12,0:4|4:0.4|8:4";

async function canPlayH264(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001f,mp4a.40.2"'),
  );
}

test("a run plays the stream through the simulated network and reports it", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/run?stream=${encodeURIComponent(STREAM)}&curve=${encodeURIComponent(CURVE)}`);
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Custom network");
  await page.getByRole("button", { name: "Start run" }).click();

  await expect(page.getByRole("status")).toHaveText("Running.", { timeout: 15_000 });
  await expect(page.getByText("First frame on screen.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 30_000 });
  await expect(page.getByText("Run finished.")).toBeVisible();

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("QoE score");
  await expect(result).toContainText("Your connection kept up");
  await expect(result).toContainText("hls.js 1.7.3");

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
  await expect(result).toContainText("Your connection kept up with the bandwidth.");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("a broken network link explains itself", async ({ page }) => {
  await page.goto(`/run?curve=${encodeURIComponent("steps,50")}`);
  await expect(page.getByRole("alert")).toContainText("The network in this link is broken");
});
