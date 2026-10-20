import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { canPlayH264, STREAM, tabTo } from "./helpers";

// 8 s: 4 Mbps, a drop to 0.4 Mbps from 0:03 to 0:05, then 4 Mbps; RTT 50 ms.
const CURVE = "steps,50,8,0:4|3:0.4|5:4";

test("a finished run is saved and opens as a report", async ({ page, browserName }) => {
  test.setTimeout(60_000);
  await page.goto(
    `/run?stream=${encodeURIComponent(STREAM)}&curve=${encodeURIComponent(CURVE)}&start=now`,
  );
  test.skip(!(await canPlayH264(page)), "This browser build can't decode H.264 through MSE");
  await expect(page.getByRole("status")).toHaveText("Finished.", { timeout: 30_000 });

  const seeReport = page.getByRole("link", { name: "See the report" });
  await tabTo(page, browserName, seeReport);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/runs\/[0-9a-f]{8}$/);
  const reportUrl = page.url();

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
  await page.goto("/");
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
