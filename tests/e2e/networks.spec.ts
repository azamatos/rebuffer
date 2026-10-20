import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { tabTo } from "./helpers";

test("a network is picked, edited, saved, exported and run with the keyboard alone", async ({
  page,
  browserName,
}) => {
  await page.goto("/networks");
  await expect(
    page.getByRole("heading", { level: 2, name: "Train through a tunnel" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A recorded trace, with its credit.
  await tabTo(page, browserName, page.getByRole("link", { name: /^Car, 4G/ }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/networks\?network=irish-4g-car$/);
  await expect(page.getByRole("heading", { level: 2, name: "Car, 4G" })).toBeVisible();
  await expect(page.getByText(/^Recorded by Darijo Raca/)).toBeVisible();

  // Back to the tunnel (the list comes before the editor, so Tab would go round the page), edited on the curve.
  await page.goto("/networks");
  await tabTo(page, browserName, page.getByRole("application", { name: "Network curve" }));
  const said = page.getByRole("status");
  for (let i = 0; i < 6; i++) await page.keyboard.press("]");
  await expect(said).toHaveText("Point 7 of 10: 0:42, 0 Mbps");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(said).toHaveText("Point 7 of 10: 0:44, 0 Mbps");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(said).toHaveText("Point 7 of 10: 0:44, 0.47 Mbps");
  await expect(page.getByLabel("Time")).toHaveValue("0:44");
  await expect(page.getByLabel("Bandwidth, Mbps")).toHaveValue("0.47");
  await expect(page.getByRole("heading", { level: 2, name: /edited copy$/ })).toBeVisible();

  // Add a point after it and delete it; undo brings each step back.
  await page.keyboard.press("n");
  await expect(said).toHaveText(/^Added\. Point 8 of 11: 0:49, 0\.2\d Mbps$/);
  await page.keyboard.press("Delete");
  await expect(said).toHaveText("Deleted. Point 8 of 10: 0:54, 0 Mbps");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("heading", { name: "Point 8 of 11" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("heading", { name: "Point 8 of 10" })).toBeVisible();

  // A time between the point's neighbours applies; one outside them is explained.
  const time = page.getByLabel("Time");
  await tabTo(page, browserName, time);
  await time.fill("1:10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Time must be from 0:44.0 to 1:00.0, between this point's neighbours.",
  );
  await time.fill("0:56");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // The whole network: a name and a longer latency.
  const name = page.getByLabel("Name");
  await tabTo(page, browserName, name);
  await name.fill("My tunnel");
  const latency = page.getByLabel("Latency (RTT), ms");
  await tabTo(page, browserName, latency);
  await latency.fill("120");
  await page.keyboard.press("Enter");

  // Export JSON.
  const download = page.waitForEvent("download");
  await tabTo(page, browserName, page.getByRole("button", { name: "Export JSON" }));
  await page.keyboard.press("Enter");
  const file = await download;
  expect(file.suggestedFilename()).toBe("rebuffer-network-my-tunnel.json");
  const exported = JSON.parse(await readFile(await file.path(), "utf8")) as {
    format: string;
    rttMs: number;
    points: { t: number; mbps: number }[];
  };
  expect(exported.format).toBe("rebuffer-network");
  expect(exported.rttMs).toBe(120);
  expect(exported.points.slice(6, 8)).toEqual([
    { t: 44, mbps: 0.47 },
    { t: 56, mbps: 0 },
  ]);

  // Saved in this browser; the address names it, and focus stays put.
  await tabTo(page, browserName, page.getByRole("button", { name: "Save to my networks" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Saved in this browser, under “Yours”.")).toBeVisible();
  await expect(page).toHaveURL(/\/networks\?saved=n[0-9a-f]{7}$/);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeFocused();
  const list = page.getByRole("navigation", { name: "Networks" });
  await expect(list.getByRole("link", { name: /^My tunnel/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Use in a run: the Run screen gets the curve and the name.
  const use = page.getByRole("link", { name: "Use in a run" });
  const href = new URL((await use.getAttribute("href")) ?? "", "http://localhost");
  expect(href.pathname).toBe("/run");
  expect(href.searchParams.get("name")).toBe("My tunnel");
  expect(href.searchParams.get("curve")).toMatch(/^slopes,120,90,0:6\|/);
  await tabTo(page, browserName, use);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/run\?/);
  await expect(page.getByText(/· My tunnel ·/)).toBeVisible();
});

test("a CSV is imported from the keyboard, and a file the lab can't read is explained", async ({
  page,
  browserName,
}) => {
  await page.goto("/networks?new=blank");
  await expect(page.getByRole("heading", { level: 2, name: "My network" })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await tabTo(page, browserName, page.getByRole("button", { name: "Import JSON or CSV" }));
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "lift.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("time,kbps\n0:00,8000\n0:25,200\n0:40,8000\n"),
  });
  await expect(
    page.getByText("Imported 3 points from lift.csv. Undo brings the last network back."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^lift/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Point 1 of 3" })).toBeVisible();
  await expect(page.getByLabel("Length")).toHaveValue("0:55");

  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{nope"),
  });
  await expect(
    page.getByText("broken.json isn't a network the lab can read. This isn't valid JSON."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Point 1 of 3" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
