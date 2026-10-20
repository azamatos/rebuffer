import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { canPlayH264, openApp, STREAM, tabTo } from "./helpers";

// 8 s: 4 Mbps, a drop to 0.4 Mbps from 0:03 to 0:05, then 4 Mbps; RTT 50 ms.
const CURVE = "steps,50,8,0:4|3:0.4|5:4";

/** Runs the 8 s setup to the end and opens its report from the keyboard; returns the report's address. */
async function runAndOpenReport(page: Page, browserName: string): Promise<string> {
  await page.goto(
    `/run?stream=${encodeURIComponent(STREAM)}&curve=${encodeURIComponent(CURVE)}&start=now`,
  );
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 30_000 });

  const seeReport = page.getByRole("link", { name: "See the report" });
  await tabTo(page, browserName, seeReport);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/[0-9a-f]{8}$/);
  return page.url();
}

test("a finished run is saved and opens as a report", async ({ page, browserName }) => {
  test.setTimeout(60_000);
  const reportUrl = await runAndOpenReport(page, browserName);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Custom network · hls.js defaults",
  );
  await expect(
    page.getByText(/^localhost:4013 · Today, \d\d:\d\d · 0:08 run, played to the end$/),
  ).toBeVisible();
  const results = page.getByRole("region", { name: "Results" });
  await expect(results).toContainText("QoE score");
  for (const part of [
    "Quality",
    "Switches",
    "Stalls",
    "Startup",
    "Rebuffer ratio",
    "Wasted data",
  ]) {
    await expect(results).toContainText(part);
  }
  // The charts are drawn from the saved log, with their sentences.
  await expect(
    page.getByRole("img", { name: /^Over 0:08, the network gave between 400 kbps and 4 Mbps\./ }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /^\d+ video segments? downloaded/ })).toBeVisible();
  const notes = page.getByRole("region", { name: "What happened" });
  await expect(notes.getByRole("listitem").first()).toContainText(/The first frame appeared at /);
  // Each idea reruns the setup with one change and starts at once.
  const idea = page.getByRole("region", { name: "Try next" }).getByRole("link").first();
  const ideaUrl = new URL((await idea.getAttribute("href")) ?? "", "http://localhost");
  expect(ideaUrl.pathname).toBe("/run");
  expect(ideaUrl.searchParams.get("start")).toBe("now");
  const setup = page.getByRole("region", { name: "Setup" });
  await expect(setup).toContainText("hls.js 1.7.3 · Defaults");
  await expect(setup).toContainText("maxBufferLength 30");
  await expect(page.getByRole("region", { name: "Simulation check" })).toContainText("downloads");

  // Change network opens the run's network in the editor; a run from there keeps the stream and the player.
  await tabTo(page, browserName, page.getByRole("link", { name: "Change network" }));
  await page.keyboard.press("Enter");
  // The router quotes an id that reads as a number.
  await expect(page).toHaveURL(/\/networks\?run=(%22)?[0-9a-f]{8}(%22)?$/);
  await expect(page.getByRole("heading", { level: 2, name: "Custom network" })).toBeVisible();
  await expect(page.getByText(/^Changing the network of a run of localhost:4013\./)).toBeVisible();
  const use = await page.getByRole("link", { name: "Use in a run" }).getAttribute("href");
  expect(Object.fromEntries(new URL(use ?? "", "http://localhost").searchParams)).toEqual({
    stream: STREAM,
    curve: CURVE,
  });
  await page.goto(reportUrl);

  // Run again repeats the setup and starts; the link to copy carries the setup only.
  const again = await page.getByRole("link", { name: "Run again" }).getAttribute("href");
  const againUrl = new URL(again ?? "", "http://localhost");
  expect(Object.fromEntries(againUrl.searchParams)).toEqual({
    stream: STREAM,
    curve: CURVE,
    start: "now",
  });

  // The actions work from the keyboard (AGENTS.md rule 4).
  const download = page.waitForEvent("download");
  await tabTo(page, browserName, page.getByRole("button", { name: "Export JSON" }));
  await page.keyboard.press("Enter");
  const file = await (await download).path();
  const exported = JSON.parse(await readFile(file, "utf8")) as {
    format: string;
    events: unknown[];
  };
  expect(exported.format).toBe("rebuffer-run");
  expect(exported.events.length).toBeGreaterThan(10);

  await tabTo(page, browserName, page.getByRole("button", { name: "Copy link" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Copied a link to this setup|didn't let the lab copy/)).toBeVisible();

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The run is listed on Home and on the Runs page, which opens its report from the keyboard.
  await openApp(page, "/");
  await expect(page.getByRole("region", { name: "Recent runs" })).toContainText("Custom network");
  await page.goto("/runs");
  const row = page.getByRole("row", { name: /Custom network/ });
  await expect(row).toContainText("hls.js defaults");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await tabTo(page, browserName, row.getByRole("link", { name: /Report\b.*Custom network/ }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(reportUrl);

  // Delete forgets it.
  await tabTo(page, browserName, page.getByRole("button", { name: "Delete" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs$/);
  await expect(page.getByText("No runs yet.")).toBeVisible();
  await page.goto(reportUrl);
  await expect(page.getByText("This browser has no run at this address.")).toBeVisible();
});

test("the report's charts zoom by keyboard and by mouse", async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await runAndOpenReport(page, browserName);
  const zoom = page.getByRole("group", { name: "Zoom the charts" });
  const status = page.getByRole("status");
  await expect(status).toHaveText("Showing all 0:08");

  // Zoom in to the narrowest view, a segment of our film; past it the button keeps focus and does nothing.
  const zoomIn = zoom.getByRole("button", { name: "Zoom in" });
  await tabTo(page, browserName, zoomIn);
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Showing 0:02–0:06 of 0:08");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Showing 0:02–0:06 of 0:08");
  await expect(zoomIn).toBeFocused();
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  await tabTo(page, browserName, zoom.getByRole("button", { name: "Later" }));
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Showing 0:04–0:08 of 0:08");

  // The charts' sentences and tables follow the view.
  await expect(
    page.getByRole("img", {
      name: /^From 0:04 to 0:08, the network gave between 400 kbps and 4 Mbps\./,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /^From 0:04 to 0:08 the buffer went from/ }),
  ).toBeVisible();
  await tabTo(page, browserName, page.getByText("Buffer as a table"));
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Buffer as a table" });
  await expect(table.getByRole("row").nth(1)).toContainText("0:04");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A note's button zooms to it (all of a run this short) and takes focus to the charts.
  await tabTo(
    page,
    browserName,
    page.getByRole("button", { name: /^Show on the chart\b.*note 1,/ }),
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeFocused();
  await expect(status).toHaveText("Showing all 0:08");
  const chart = page.getByRole("img", { name: /^Over 0:08, the network gave/ });
  await expect(chart).toBeInViewport();

  // With a mouse: a drag across a chart picks a stretch, a double-click shows the whole run again.
  const box = await chart.boundingBox();
  if (!box) throw new Error("The bandwidth chart has no box");
  const plotWidth = box.width - 84;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + plotWidth * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + plotWidth * 0.4, y, { steps: 5 });
  await page.mouse.up();
  await expect(status).toHaveText("Showing 0:00–0:04 of 0:08");
  await page.getByRole("img", { name: /^From 0:00 to 0:04, the network gave/ }).dblclick();
  await expect(status).toHaveText("Showing all 0:08");
});
