import { describe, expect, it } from "vitest";
import { parsePlaylist, type MediaPlaylist } from "@/core/hls";
import fmp4Vod from "@/core/hls/fixtures/fmp4-vod.m3u8?raw";
import problemsMedia from "@/core/hls/fixtures/problems-media.m3u8?raw";
import problemsMaster from "@/core/hls/fixtures/problems-multivariant.m3u8?raw";
import { loadInspection, measureMedia, type Inspection, type Measured } from "./load";
import {
  countFindings,
  declaredRunSearch,
  describePlayback,
  describeSummary,
  describeTracks,
  inspectionFindings,
  ladderRows,
  playbackQuery,
  relativeName,
  segmentStats,
} from "./model";
import { describeReadError, ReadError, type Reader } from "./read";

const BASE = "https://media.example/tos/problems/";

/** A reader over a few files; anything else answers 404. */
function reader(files: Record<string, string>, sizes: Record<string, number> = {}): Reader {
  return {
    text: (url) =>
      files[url] === undefined
        ? Promise.reject(new ReadError(url, "status", 404))
        : Promise.resolve(files[url]),
    size: (url) => Promise.resolve(sizes[url]),
  };
}

/** The problems sample: every rung shares the media playlist with a 6.6 s segment; 960 can't be read. */
async function problems(): Promise<Inspection> {
  const files: Record<string, string> = { [`${BASE}master.m3u8`]: problemsMaster };
  for (const rung of ["426", "640", "1280", "1920"])
    files[`${BASE}${rung}/index.m3u8`] = problemsMedia;
  const result = await loadInspection(
    { url: `${BASE}master.m3u8`, text: problemsMaster },
    reader(files),
  );
  if (!result.ok) throw new Error("not ok");
  return result.inspection;
}

/** Measured peaks by media playlist address, Mbps. */
const peaks = (entries: Record<string, number>): Map<string, Measured> =>
  new Map(Object.entries(entries).map(([url, mbps]) => [url, { peakBps: mbps * 1e6, count: 3 }]));

describe("loadInspection", () => {
  it("reads the media playlist of every variant, and says why one couldn't be read", async () => {
    const inspection = await problems();
    expect(inspection.file).toBe("master.m3u8");
    expect(inspection.media.map((media) => [media.label, media.playlist !== undefined])).toEqual([
      ["240p", true],
      ["360p", true],
      ["540p", false],
      ["720p", true],
      ["1080p", true],
    ]);
    expect(inspection.media[2]?.problem).toBe(
      `media.example answered 404 for ${BASE}960/index.m3u8.`,
    );
  });

  it("can't follow a pasted playlist's relative links, and reports a broken one", async () => {
    const pasted = await loadInspection({ text: problemsMaster }, reader({}));
    expect(pasted.ok && pasted.inspection.file).toBe("the pasted playlist");
    expect(pasted.ok && pasted.inspection.media[0]?.problem).toMatch(
      /^Not read: a pasted playlist/,
    );
    expect(await loadInspection({ text: "hello" }, reader({}))).toMatchObject({ ok: false });
  });
});

describe("measureMedia", () => {
  it("takes the peak of the first segments, from byte ranges without asking the server", async () => {
    const asked: string[] = [];
    const measured = await measureMedia(
      parseMedia(fmp4Vod, "https://media.example/vod/index.m3u8"),
      {
        text: () => Promise.reject(new Error("no")),
        size: (url) => {
          asked.push(url);
          return Promise.resolve(undefined);
        },
      },
    );
    expect(asked).toEqual([]);
    expect(measured).toEqual({ peakBps: (1_532_810 * 8) / 4, count: 3 });
  });

  it("asks the server for sizes, and measures what it can", async () => {
    const media = parseMedia(problemsMedia, `${BASE}1280/index.m3u8`);
    const measured = await measureMedia(
      media,
      reader(
        {},
        { [`${BASE}1280/segment_000.ts`]: 2_400_000, [`${BASE}1280/segment_002.ts`]: 2_550_000 },
      ),
    );
    expect(measured).toEqual({ peakBps: 3_400_000, count: 2 });
  });
});

describe("the screen's model", () => {
  it("sums up the stream", async () => {
    const inspection = await problems();
    expect(describeSummary(inspection)).toBe(
      "Multivariant playlist · HLS v3 · VOD, 1:28 · 5 qualities · MPEG-TS segments · not encrypted",
    );
    if (inspection.top.kind !== "multivariant") throw new Error("not multivariant");
    expect(describeTracks(inspection.top)).toEqual(["no I-frame playlists"]);
  });

  it("lists the ladder highest first, with measured peaks and how far over they are", async () => {
    const inspection = await problems();
    const rows = ladderRows(
      inspection,
      peaks({ [`${BASE}1280/index.m3u8`]: 3.4, [`${BASE}1920/index.m3u8`]: 4.8 }),
    );
    expect(rows.map((row) => [row.name, row.shade, row.video?.label, row.measuredBps])).toEqual([
      ["1080p", 4, "H.264 High 4.0", 4.8e6],
      ["720p", 3, undefined, 3.4e6],
      ["540p", 2, undefined, undefined],
      ["360p", 1, "H.264 Main 3.0", undefined],
      ["240p", 0, "H.264 Constrained Baseline 3.0", undefined],
    ]);
    expect(rows[1]?.over).toBeCloseTo(0.214, 3);
    expect(rows[0]?.over).toBeUndefined();
  });

  it("groups a finding found in several playlists, and adds the measured bandwidth", async () => {
    const inspection = await problems();
    const findings = inspectionFindings(inspection, peaks({ [`${BASE}1280/index.m3u8`]: 3.4 }));
    expect(countFindings(findings)).toEqual({ error: 1, warning: 3, note: 2 });
    const [overTarget, ...rest] = findings;
    expect(overTarget?.message).toBe("Segment 12 lasts 6.6 s; the target duration is 6 s.");
    expect(overTarget?.sources.map((source) => source.file)).toEqual([
      "426/index.m3u8",
      "640/index.m3u8",
      "1280/index.m3u8",
      "1920/index.m3u8",
    ]);
    const bandwidth = rest.find((finding) => finding.id === "bandwidth-under-declared");
    expect(bandwidth).toMatchObject({
      message: "720p declares 2.8 Mbps; its segments peak at 3.4 Mbps.",
      sources: [{ file: "master.m3u8", line: 11 }],
      declaredBps: 2_800_000,
    });
  });

  it("describes a rendition's segments in words", () => {
    const stats = segmentStats(parseMedia(problemsMedia, `${BASE}1280/index.m3u8`));
    expect(stats).toMatchObject({
      count: 15,
      targetDuration: 6,
      container: "MPEG-TS",
      discontinuities: 0,
      overTarget: [11],
    });
    expect(stats.description).toBe(
      "15 segments, 13 of them 6 s. Segment 12 lasts 6.6 s, over the 6 s target; the last lasts 3.4 s.",
    );
  });

  it("names media playlists by their folder, and builds the links the screen offers", () => {
    expect(relativeName(`${BASE}720p/index.m3u8`, `${BASE}master.m3u8`)).toBe("720p/index.m3u8");
    expect(relativeName("https://cdn.example/a/b/c.m3u8", `${BASE}master.m3u8`)).toBe("b/c.m3u8");
    expect(declaredRunSearch(`${BASE}master.m3u8`, 2_800_000)).toEqual({
      stream: `${BASE}master.m3u8`,
      curve: "steps,50,60,0:3.1",
      name: "Steady 3.1 Mbps",
    });
  });

  it("asks the browser about a variant only when its codecs are declared", async () => {
    const rows = ladderRows(await problems(), new Map());
    expect(playbackQuery(rows[0] ?? ({} as never))).toEqual({
      video: {
        contentType: 'video/mp4; codecs="avc1.640028"',
        width: 1920,
        height: 800,
        bitrate: 5_000_000,
        framerate: 24,
      },
      audio: { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
      type: 'video/mp4; codecs="avc1.640028,mp4a.40.2"',
    });
    expect(playbackQuery(rows[1] ?? ({} as never))).toBeUndefined();
    expect(describePlayback(undefined)).toBe("Unknown until downloaded");
    expect(describePlayback({ supported: true, smooth: true })).toBe("Plays, smooth");
    expect(describePlayback({ supported: false, smooth: false })).toBe("Can't play here");
  });

  it("explains a read that failed", () => {
    expect(describeReadError(new ReadError("https://cdn.example/x.m3u8", "unreadable"))).toBe(
      "This browser couldn't read cdn.example: the server doesn't let browsers read it (CORS), or it couldn't be reached. Paste the playlist's text instead.",
    );
  });
});

function parseMedia(text: string, url: string): MediaPlaylist {
  const result = parsePlaylist(text, { baseUrl: url });
  if (result.kind !== "media") throw new Error("not media");
  return result;
}
