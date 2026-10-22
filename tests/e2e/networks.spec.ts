import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { settle, switchTheme, tabTo } from "./helpers";

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

  // Back to the tunnel (the list comes before the editor, so Tab would go round the page), renamed in the title and
  // edited on the curve.
  await page.goto("/networks");
  const name = page.getByRole("textbox", { name: "Network name" });
  await tabTo(page, browserName, name);
  await name.fill("My tunnel");
  await expect(page.getByRole("heading", { level: 2, name: "My tunnel" })).toBeVisible();
  await tabTo(page, browserName, page.getByRole("application", { name: "Network curve" }));
  const said = page.getByRole("status");
  for (let i = 0; i < 6; i++) await page.keyboard.press("]");
  await expect(said).toHaveText("Point 7 of 10: 0:42, 0 Mbps");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(said).toHaveText("Point 7 of 10: 0:44, 0 Mbps");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(said).toHaveText("Point 7 of 10: 0:44, 0.6 Mbps");
  await expect(page.getByLabel("Time")).toHaveValue("0:44");
  await expect(page.getByLabel("Bandwidth, Mbps")).toHaveValue("0.6");
  await expect(
    page.getByRole("heading", { level: 2, name: "My tunnel edited copy" }),
  ).toBeVisible();

  // Add a point after it and delete it; undo brings each step back.
  await page.keyboard.press("n");
  await expect(said).toHaveText("Added. Point 8 of 11: 0:49, 0.3 Mbps");
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

  // The whole network: a longer latency.
  const latency = page.getByLabel("Latency (RTT), ms");
  await tabTo(page, browserName, latency);
  await latency.fill("120");
  await page.keyboard.press("Enter");

  // Export CSV, from the Import / Export menu: the settings in its first line, then a row per point.
  await tabTo(page, browserName, page.getByRole("button", { name: "Import / Export" }));
  await page.keyboard.press("Enter");
  const download = page.waitForEvent("download");
  await tabTo(page, browserName, page.getByRole("button", { name: "Export CSV" }));
  await page.keyboard.press("Enter");
  const file = await download;
  expect(file.suggestedFilename()).toBe("rebuffer-network-my-tunnel.csv");
  const lines = (await readFile(await file.path(), "utf8")).split("\n");
  expect(lines[0]).toMatch(/^# rebuffer-network shape=\w+ rtt_ms=120 /);
  expect(lines[1]).toBe("time_s,mbps");
  expect(lines.slice(8, 10)).toEqual(["44,0.6", "56,0"]);

  // Saved in this browser (Save is at the top, which Tab reached on the way to the curve); the address names it, a
  // toast says so, and focus stays put.
  const save = page.getByRole("button", { name: "Save", exact: true });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator("#toasts").getByText("Saved in this browser, under “Yours”."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/networks\?saved=n[0-9a-f]{7}$/);
  await expect(save).toBeFocused();
  const list = page.getByRole("navigation", { name: "Networks" });
  await expect(list.getByRole("link", { name: /^My tunnel/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete network" })).toBeVisible();
  await settle(page.locator("#toasts"));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Run with this network: the Run screen gets the curve and the name.
  const use = page.getByRole("link", { name: "Run with this network" });
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
  // A new network's name is selected, so typing names it.
  await expect(page.getByRole("textbox", { name: "Network name" })).toBeFocused();
  await page.keyboard.type("Hotel wifi");
  await expect(page.getByRole("heading", { level: 2, name: "Hotel wifi" })).toBeVisible();

  await tabTo(page, browserName, page.getByRole("button", { name: "Import / Export" }));
  await page.keyboard.press("Enter");
  const chooser = page.waitForEvent("filechooser");
  await tabTo(page, browserName, page.getByRole("button", { name: "Import JSON, CSV or HAR" }));
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

  // A HAR file from a browser's developer tools becomes a curve, with a note on what it can't tell.
  const download = (at: number, bytes: number) => ({
    startedDateTime: new Date(Date.UTC(2026, 9, 21, 10, 0, at)).toISOString(),
    time: 1030,
    response: { status: 200, bodySize: bytes, content: { size: bytes } },
    timings: { blocked: 0, dns: -1, connect: -1, send: 0, wait: 30, receive: 1000 },
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "trip.har",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        log: { entries: [download(0, 500_000), download(1, 250_000), download(2, 1_000_000)] },
      }),
    ),
  });
  await expect(page.getByRole("heading", { level: 2, name: /^trip/ })).toBeVisible();
  await expect(
    page.getByText(/^From 3 of 3 downloads over 0:04: the throughput the page got/),
  ).toBeVisible();
  // The downloads straddle seconds: 4, 2.06, 7.82 and 8 Mbps.
  await expect(page.getByRole("heading", { name: "Point 1 of 4" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{nope"),
  });
  await expect(
    page.getByText("broken.json isn't a network the lab can read. This isn't valid JSON."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Point 1 of 4" })).toBeVisible();
  // The import's toast fades out 3.2 s after it came; on a slow runner axe would read it mid-fade.
  await expect(page.locator("#toasts p")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("the points show as a table, and ? lists the keys without leaving the curve", async ({
  page,
  browserName,
}) => {
  await page.goto("/networks");
  const curve = page.getByRole("application", { name: "Network curve" });
  await expect(curve).toBeVisible();

  // Chart | Table: the points take the curve's place, the selected one marked.
  const showAs = page.getByRole("group", { name: "Points: show as" });
  await tabTo(page, browserName, showAs.getByRole("button", { name: "Table" }));
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Points as a table" });
  await expect(table.getByRole("row").nth(1)).toHaveText(/^1\s*0:00\s*6 Mbps$/);
  await expect(table.getByRole("row").nth(1)).toHaveAttribute("aria-current", "true");
  await expect(curve).toBeHidden();
  await settle(table);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await showAs.getByRole("button", { name: "Chart" }).focus();
  await page.keyboard.press("Enter");
  await expect(curve).toBeVisible();

  // ? opens the shortcuts while focus stays on the curve; Escape closes them; the button opens them too.
  await tabTo(page, browserName, curve);
  const shortcuts = page.getByRole("button", { name: "Keyboard shortcuts" });
  await page.keyboard.press("?");
  await expect(shortcuts).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("the point before or after")).toBeVisible();
  await expect(curve).toBeFocused();
  for (const colorScheme of ["light", "dark"] as const) {
    await switchTheme(page, colorScheme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.keyboard.press("Escape");
  await expect(shortcuts).toHaveAttribute("aria-expanded", "false");
  await expect(curve).toBeFocused();
  await shortcuts.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("the point before or after")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("the point before or after")).toBeHidden();
  await expect(shortcuts).toBeFocused();

  // In a field, ? is just a character.
  const name = page.getByRole("textbox", { name: "Network name" });
  await name.fill("Tunnel");
  await name.press("?");
  await expect(name).toHaveValue("Tunnel?");
  await expect(shortcuts).toHaveAttribute("aria-expanded", "false");
});
