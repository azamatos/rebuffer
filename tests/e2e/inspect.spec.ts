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
  // One group, so no group headers and no search: the rows, with their audio.
  const ladder = page.getByRole("region", { name: /^Quality ladder · 3 qualities/ });
  for (const name of ["720p", "480p", "240p"]) {
    await expect(ladder.getByRole("rowheader", { name: new RegExp(`^${name}\\b`) })).toBeVisible();
  }
  await expect(ladder.getByRole("row", { name: /^720p/ })).toContainText("H.264 High 3.1");
  await expect(ladder.getByRole("row", { name: /^720p/ })).toContainText("AAC-LC");
  await expect(ladder.getByLabel("Find a rendition")).toHaveCount(0);
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
  // Each segment's bit rate, measured, against what its variant declares.
  await expect(page.getByText("10 segments · 2 s each · 0:20 · average")).toBeVisible();
  await expect(
    // The bitrate is the encode's own: CI encodes the test stream afresh.
    page.getByRole("img", {
      name: /^480p · [\d.]+ (Mbps|kbps): (Every segment fits|The busiest segment)/,
    }),
  ).toBeVisible();
  // A row's Segments button shows that playlist there.
  await ladder.getByRole("button", { name: "Segments of 240p" }).click();
  await expect(playlists.getByRole("radio", { name: "240p" })).toBeChecked();
  await expect(ladder.getByRole("button", { name: "Segments of 240p" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  // One sentence for the four playlists it couldn't follow, and the count says they weren't checked.
  await expect(page.getByRole("region", { name: "Playlists not read" })).toContainText(
    "Its 4 media playlists weren't read or checked: pasted text has no address",
  );
  await expect(page.getByRole("list", { name: "Findings" })).toContainText("4 not read");
  await expect(page.getByRole("link", { name: "Run this stream" })).toHaveCount(0);
  // With the address it came from, its links are followed.
  const from = page.getByLabel("Address it came from");
  await from.fill(STREAM);
  await tabTo(page, browserName, page.getByRole("button", { name: "Read the links" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Playlist" }).getByRole("radio")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Playlists not read" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Run this stream" })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

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

test("a big stream's ladder groups, folds and finds; its playlists come from a select", async ({
  page,
  browserName,
}) => {
  // A stream like Apple's advanced example, served here: H.264 and HEVC HDR, two audio formats sharing each video
  // playlist from 720p up, audio and subtitles. 11 video playlists, 16 variants, 14 playlists in all.
  const base = "https://big.example/stream/";
  const cors = { "access-control-allow-origin": "*" };
  const variant = (bps: number, codecs: string, height: number, audio: string, uri: string) => [
    `#EXT-X-STREAM-INF:BANDWIDTH=${String(bps)},CODECS="${codecs}",RESOLUTION=${String(Math.round((height * 16) / 9))}x${String(height)},AUDIO="${audio}",SUBTITLES="subs"${codecs.startsWith("hvc1") ? ",VIDEO-RANGE=PQ" : ""}`,
    uri,
  ];
  const ladder = (codec: string, prefix: string, heights: number[]) =>
    heights.flatMap((height) => {
      const bps = height * 6000;
      const uri = `${prefix}${String(height)}/index.m3u8`;
      return height >= 720
        ? [
            ...variant(bps + 640_000, `${codec},ec-3`, height, "ec3", uri),
            ...variant(bps + 128_000, `${codec},mp4a.40.2`, height, "aac", uri),
          ]
        : variant(bps + 128_000, `${codec},mp4a.40.2`, height, "aac", uri);
    });
  const master = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",DEFAULT=YES,URI="audio/aac.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="ec3",NAME="English",DEFAULT=YES,URI="audio/ec3.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,URI="subs/en.m3u8"',
    ...ladder("avc1.640028", "avc", [1080, 720, 540, 360, 240]),
    ...ladder("hvc1.2.4.L150.B0", "hevc", [2160, 1080, 720, 540, 360, 240]),
    "",
  ].join("\n");
  const media =
    '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6.0,\ns1.m4s\n#EXTINF:6.0,\ns2.m4s\n#EXTINF:4.0,\ns3.m4s\n#EXT-X-ENDLIST\n';
  await page.route(`${base}**`, (route) => {
    const url = route.request().url();
    if (url.endsWith(".m3u8")) {
      return route.fulfill({
        body: url.endsWith("main.m3u8") ? master : media,
        headers: { ...cors, "content-type": "application/vnd.apple.mpegurl" },
      });
    }
    return route.fulfill({ body: Buffer.alloc(30_000), headers: cors });
  });

  await page.goto(`/inspect?url=${encodeURIComponent(`${base}main.m3u8`)}`);
  const ladderRegion = page.getByRole("region", {
    name: /^Quality ladder · 16 variants on 11 video playlists/,
  });
  await expect(ladderRegion).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/^Measured the first/, { timeout: 20_000 });

  // Groups by codec and range, H.264 open; a row per video playlist with its audio pairings.
  const h264 = ladderRegion.getByRole("button", { name: /^H\.264 SDR/ });
  const hevc = ladderRegion.getByRole("button", { name: /^HEVC HDR \(PQ\)/ });
  await expect(h264).toHaveAttribute("aria-expanded", "true");
  await expect(hevc).toHaveAttribute("aria-expanded", "false");
  await expect(h264).toContainText("5 video playlists · 7 variants · 240p–1080p");
  await expect(ladderRegion.getByRole("row", { name: /^1080p/ })).toContainText(
    "Dolby Digital Plus (E-AC-3) or AAC-LC",
  );
  await tabTo(page, browserName, hevc);
  await page.keyboard.press("Enter");
  await expect(hevc).toHaveAttribute("aria-expanded", "true");
  await expect(ladderRegion.getByRole("rowheader", { name: /^2160p/ })).toBeVisible();

  // Find a rendition searches every group.
  const find = ladderRegion.getByLabel("Find a rendition");
  await find.fill("1080p hevc");
  await expect(ladderRegion.getByText("1 of 11 video playlists match “1080p hevc”.")).toBeVisible();
  await expect(ladderRegion.getByRole("row", { name: /^1080p/ })).toHaveCount(1);
  await find.fill("8K");
  await expect(ladderRegion.getByText(/^Nothing matches “8K”\./)).toBeVisible();
  await find.fill("");

  // More than 12 playlists: a select with groups, which a row's Segments button also sets.
  const chooser = page.getByLabel(/^Playlist · 14 in 4 groups/);
  await expect(chooser).toHaveValue(`${base}avc1080/index.m3u8`);
  await chooser.selectOption(`${base}hevc2160/index.m3u8`);
  await expect(page.getByRole("img", { name: /^2160p · .+: Every segment fits/ })).toBeVisible();
  await ladderRegion.getByRole("button", { name: "Segments of hevc540" }).click();
  await expect(chooser).toHaveValue(`${base}hevc540/index.m3u8`);
  await chooser.selectOption(`${base}subs/en.m3u8`);
  await expect(
    page.getByText("Subtitles have no bit rate to chart.", { exact: false }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // On a phone the rows stack, and nothing scrolls sideways.
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(ladderRegion.getByRole("list", { name: "H.264 · SDR" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await switchTheme(page, "dark");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
