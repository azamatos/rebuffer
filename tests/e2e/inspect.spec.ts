import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { settle, STREAM, switchTheme, tabTo } from "./helpers";

test("a stream is inspected from a link typed with the keyboard", async ({ page, browserName }) => {
  await page.goto("/inspect");
  await expect(page.getByRole("heading", { level: 1, name: "Inspect a stream" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const link = page.getByLabel("HLS link (.m3u8)");
  await tabTo(page, browserName, link);
  await page.keyboard.type(STREAM);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/inspect\?url=/);
  await expect(page.getByRole("status")).toHaveText(
    "Measured the first 3 segments of each playlist.",
    { timeout: 20_000 },
  );

  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText(
    "Multivariant playlist · HLS v7 · VOD, 0:20 · 3 qualities · 1 audio track · fMP4 segments · not encrypted",
  );
  const ladder = page.getByRole("region", { name: "Quality ladder table" });
  for (const name of ["720p", "480p", "240p"]) {
    await expect(ladder.getByRole("rowheader", { name })).toBeVisible();
  }
  await expect(ladder.getByRole("row", { name: /^720p/ })).toContainText("H.264 High 3.1");
  await expect(ladder.getByRole("row", { name: /^720p/ })).toContainText("with its audio");
  await expect(page.getByRole("region", { name: "Findings" })).toContainText(
    "The playlist has no I-frame playlists",
  );
  // The header marks the screen, whatever its link carries.
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Inspect" }),
  ).toHaveAttribute("aria-current", "page");

  // The segments of another playlist, chosen from the keyboard: the chips are radios.
  const playlists = page.getByRole("group", { name: "Playlist" });
  await tabTo(page, browserName, playlists.getByRole("radio", { name: "720p" }));
  await page.keyboard.press("ArrowRight");
  await expect(playlists.getByRole("radio", { name: "480p" })).toBeChecked();
  await expect(page.getByRole("img", { name: /^480p: 10 segments, each 2 s\.$/ })).toBeVisible();
  // Their table, in the chart's place.
  const showAs = page.getByRole("group", { name: "Segments: show as" });
  await tabTo(page, browserName, showAs.getByRole("button", { name: "Table" }));
  await page.keyboard.press("Enter");
  const table = page.getByRole("region", { name: "Segments as a table" });
  await expect(table.getByRole("row")).toHaveCount(11);
  await settle(table);

  const run = await page.getByRole("link", { name: "Run this stream" }).getAttribute("href");
  expect(new URL(run ?? "", "http://localhost").searchParams.get("stream")).toBe(STREAM);
  for (const colorScheme of ["light", "dark"] as const) {
    await switchTheme(page, colorScheme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test("pasted text and an opened file are inspected; a blocked server and a bad link are explained", async ({
  page,
  browserName,
}) => {
  await page.goto("/inspect");

  // The ways in are tabs: arrow keys move between them, and Enter goes into the panel.
  const link = page.getByRole("tab", { name: "Link" });
  await tabTo(page, browserName, link);
  await expect(link).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const file = page.getByRole("tab", { name: "File" });
  await expect(file).toBeFocused();
  await expect(file).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "File" })).toContainText(
    "Drop an .m3u8 file here",
  );
  await page.keyboard.press("Enter");
  const choose = page.getByRole("button", { name: "Choose an .m3u8 file" });
  await expect(choose).toBeFocused();
  await settle(page.getByRole("tabpanel"));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A media playlist from a file, with a segment over its target duration.
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "late.m3u8",
    mimeType: "application/vnd.apple.mpegurl",
    buffer: Buffer.from(
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\na.ts\n#EXTINF:6.6,\nb.ts\n#EXT-X-ENDLIST\n",
    ),
  });
  await expect(page.getByRole("region", { name: "Summary" })).toContainText(
    "Media playlist · HLS v3 · VOD, 0:13 · 2 segments · MPEG-TS segments · not encrypted",
  );
  await expect(page.getByRole("region", { name: "Findings" })).toContainText(
    "Error · Segment 2 lasts 6.6 s; the target duration is 6 s.",
  );
  await expect(page.getByText(/^late\.m3u8, line 6 ·/)).toBeVisible();

  // Pasted text: the ladder, but no media playlists, since relative links can't be followed. A click on the tab
  // puts the cursor in its field.
  await page.goto("/inspect");
  await page.getByRole("tab", { name: "Paste text" }).click();
  const text = page.getByLabel("Paste the text of an .m3u8 playlist");
  await expect(text).toBeFocused();
  const master = await readFile(
    new URL("../../media/e2e/ladder/master.m3u8", import.meta.url),
    "utf8",
  );
  await text.fill(master);
  await tabTo(page, browserName, page.getByRole("button", { name: "Inspect this text" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Summary" })).toContainText(
    "Multivariant playlist · HLS v7 · 3 qualities · 1 audio track",
  );
  await expect(page.getByRole("region", { name: "Playlists not read" })).toContainText(
    "4 media playlists couldn't be read",
  );
  await expect(page.getByRole("link", { name: "Run this stream" })).toHaveCount(0);

  // A server that doesn't let browsers read it.
  await page.goto(
    `/inspect?url=${encodeURIComponent("http://localhost:4013/nocors/hls/ladder/master.m3u8")}`,
  );
  await expect(
    page.getByText(
      /^This browser couldn't read localhost:4013: the server doesn't let browsers read it \(CORS\)/,
    ),
  ).toBeVisible();

  // A link that isn't one.
  const field = page.getByLabel("HLS link (.m3u8)");
  await field.fill("not a link");
  await field.press("Enter");
  await expect(page.getByRole("alert")).toHaveText(/^That isn't a web address\./);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
