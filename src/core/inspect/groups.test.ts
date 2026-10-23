import { describe, expect, it } from "vitest";
import { parsePlaylist, type MediaPlaylist } from "@/core/hls";
import { matchesFind, playlistChoices, videoGroups } from "./groups";
import type { Inspection } from "./load";

const url = "https://media.example/stream/main.m3u8";
const top = parsePlaylist(
  [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",DEFAULT=YES,URI="audio/aac/index.m3u8"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="ec3",NAME="English",URI="audio/ec3/index.m3u8"',
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Italiano",URI="subs/it/index.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=6000000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="aac",SUBTITLES="subs",VIDEO-RANGE=SDR',
    "bundle_hls290/prog_index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=6600000,CODECS="avc1.640028,ec-3",RESOLUTION=1920x1080,AUDIO="ec3",SUBTITLES="subs",VIDEO-RANGE=SDR',
    "bundle_hls290/prog_index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.64001f,mp4a.40.2",RESOLUTION=1280x720,AUDIO="aac",SUBTITLES="subs"',
    "bundle_hls250/prog_index.m3u8",
    '#EXT-X-STREAM-INF:BANDWIDTH=9000000,CODECS="hvc1.2.4.L123.B0,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="aac",SUBTITLES="subs",VIDEO-RANGE=PQ',
    "bundle_hdr785/prog_index.m3u8",
    "",
  ].join("\n"),
  { baseUrl: url },
);
if (top.kind !== "multivariant") throw new Error("The fixture should be a multivariant playlist");

const media = parsePlaylist(
  "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\na.mp4\n#EXT-X-ENDLIST\n",
) as MediaPlaylist;
const at = (path: string) => new URL(path, url).href;
const inspection: Inspection = {
  url,
  file: "main.m3u8",
  top,
  media: [
    {
      url: at("bundle_hls290/prog_index.m3u8"),
      label: "1080p",
      name: "1080p",
      kind: "variant",
      playlist: media,
    },
    {
      url: at("bundle_hls250/prog_index.m3u8"),
      label: "720p",
      name: "720p",
      kind: "variant",
      playlist: media,
    },
    { url: at("bundle_hdr785/prog_index.m3u8"), label: "1080p", name: "1080p", kind: "variant" },
    {
      url: at("audio/aac/index.m3u8"),
      label: "audio “English”",
      name: "English",
      kind: "audio",
      playlist: media,
    },
    {
      url: at("subs/it/index.m3u8"),
      label: "subtitles “Italiano”",
      name: "Italiano",
      kind: "subtitles",
      playlist: media,
    },
  ],
};

describe("videoGroups", () => {
  const groups = videoGroups(inspection, new Map());

  it("groups video playlists by codec and range, H.264 first, highest first", () => {
    expect(groups.map((group) => [group.codec, group.range, group.variants])).toEqual([
      ["H.264", "SDR", 3],
      ["HEVC", "HDR (PQ)", 1],
    ]);
    expect(groups[0]?.rows.map((row) => row.name)).toEqual(["hls290", "hls250"]);
    expect(groups[1]?.rows.map((row) => row.name)).toEqual(["hdr785"]);
  });

  it("lists a video playlist once, with the audio each variant pairs it with", () => {
    expect(groups[0]?.rows[0]).toMatchObject({
      url: at("bundle_hls290/prog_index.m3u8"),
      path: "bundle_hls290/prog_index.m3u8",
      audio: ["Dolby Digital Plus (E-AC-3)", "AAC-LC"],
      declared: { low: 6_000_000, high: 6_600_000 },
      lines: [9, 7],
      shade: 4,
    });
    expect(groups[0]?.rows[1]?.shade).toBe(0);
  });

  it("finds a rendition by any word of it", () => {
    const [h264, hevc] = groups;
    if (!h264 || !hevc) throw new Error("Two groups expected");
    const [hls290, hls250] = h264.rows;
    if (!hls290 || !hls250) throw new Error("Two rows expected");
    expect(matchesFind(h264, hls290, "")).toBe(true);
    expect(matchesFind(h264, hls290, "1080p e-ac-3")).toBe(true);
    expect(matchesFind(h264, hls250, "1080p")).toBe(false);
    expect(matchesFind(h264, hls250, "HLS250")).toBe(true);
    expect(matchesFind(h264, hls290, "6.6 mbps")).toBe(true);
    expect(matchesFind(hevc, hevc.rows[0] ?? hls290, "hdr pq")).toBe(true);
  });
});

describe("playlistChoices", () => {
  it("offers the playlists that were read, in the ladder's groups, then audio and subtitles", () => {
    const choices = playlistChoices(inspection, videoGroups(inspection, new Map()));
    expect(
      choices.map((group) => [group.label, group.choices.map((choice) => choice.label)]),
    ).toEqual([
      ["H.264 · SDR", ["1080p · 6.6 Mbps · hls290 · 2 audio", "720p · 2 Mbps · hls250"]],
      ["Audio", ["English · AAC-LC"]],
      ["Subtitles", ["Italiano"]],
    ]);
    expect(choices[0]?.choices[0]).toMatchObject({
      kind: "video",
      declaredBps: 6_600_000,
      shade: 4,
    });
  });

  it("offers a media playlist given on its own", () => {
    const choices = playlistChoices(
      { url: undefined, file: "index.m3u8", top: media, media: [] },
      [],
    );
    expect(choices).toEqual([
      {
        label: "Playlist",
        choices: [{ key: "top", label: "index.m3u8", playlist: media, kind: "video" }],
      },
    ]);
  });
});
