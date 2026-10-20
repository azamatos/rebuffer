import { describe, expect, it } from "vitest";
import { isPlainGet, isPlaylist, markUsed, mayKeep, planSaving, playlistIsFinal } from "./saved";

const MB = 1024 * 1024;

describe("markUsed", () => {
  const index = [
    { url: "master", bytes: 1 },
    { url: "media", bytes: 1 },
    { url: "seg0", bytes: 4 * MB },
    { url: "seg1", bytes: 4 * MB },
  ];

  it("moves what a run used to the end, in the order it was used", () => {
    expect(markUsed(index, ["media", "master", "seg0"]).map((entry) => entry.url)).toEqual([
      "seg1",
      "media",
      "master",
      "seg0",
    ]);
  });

  it("ignores repeats and URLs it doesn't have", () => {
    expect(markUsed(index, ["seg0", "other", "seg0"]).map((entry) => entry.url)).toEqual([
      "master",
      "media",
      "seg1",
      "seg0",
    ]);
  });

  it("keeps what a run used when the next save needs room", () => {
    const used = markUsed(index, ["master", "media"]);
    expect(planSaving(used, { url: "seg2", bytes: 4 * MB }, 8 * MB).drop).toEqual(["seg0", "seg1"]);
  });
});

describe("planSaving", () => {
  it("adds a download and keeps everything while it fits", () => {
    expect(planSaving([{ url: "a", bytes: 2 * MB }], { url: "b", bytes: 3 * MB }, 10 * MB)).toEqual(
      {
        index: [
          { url: "a", bytes: 2 * MB },
          { url: "b", bytes: 3 * MB },
        ],
        drop: [],
      },
    );
  });

  it("drops the oldest downloads until the total fits", () => {
    const index = [
      { url: "a", bytes: 4 * MB },
      { url: "b", bytes: 4 * MB },
      { url: "c", bytes: 1 * MB },
    ];
    // 15 MB with d: dropping a leaves 11 MB, still too much; dropping b too leaves 7 MB.
    expect(planSaving(index, { url: "d", bytes: 6 * MB }, 10 * MB)).toEqual({
      index: [
        { url: "c", bytes: 1 * MB },
        { url: "d", bytes: 6 * MB },
      ],
      drop: ["a", "b"],
    });
  });

  it("moves a download saved again to the end instead of counting it twice", () => {
    const index = [
      { url: "a", bytes: 4 * MB },
      { url: "b", bytes: 4 * MB },
    ];
    expect(planSaving(index, { url: "a", bytes: 4 * MB }, 10 * MB).index.map((e) => e.url)).toEqual(
      ["b", "a"],
    );
  });

  it("doesn't keep a single download bigger than the whole budget", () => {
    expect(planSaving([], { url: "huge", bytes: 11 * MB }, 10 * MB)).toEqual({
      index: [],
      drop: ["huge"],
    });
  });
});

describe("isPlainGet", () => {
  it("accepts a GET of a whole file only", () => {
    expect(isPlainGet(new Request("https://media.example/a.m4s"))).toBe(true);
    expect(isPlainGet(new Request("https://media.example/a.m4s", { method: "HEAD" }))).toBe(false);
    expect(
      isPlainGet(new Request("https://media.example/a.m4s", { headers: { Range: "bytes=0-99" } })),
    ).toBe(false);
  });
});

describe("mayKeep", () => {
  const response = (status: number, cacheControl?: string) =>
    new Response(status === 204 ? null : "x", {
      status,
      headers: cacheControl ? { "Cache-Control": cacheControl } : {},
    });

  it("keeps complete responses unless the server says no-store", () => {
    expect(mayKeep(response(200))).toBe(true);
    expect(mayKeep(response(200, "public, max-age=31536000, immutable"))).toBe(true);
    expect(mayKeep(response(200, "no-cache"))).toBe(true);
    expect(mayKeep(response(200, "no-store"))).toBe(false);
    expect(mayKeep(response(200, "private, No-Store"))).toBe(false);
    expect(mayKeep(response(206))).toBe(false);
    expect(mayKeep(response(404))).toBe(false);
  });
});

describe("isPlaylist", () => {
  it("knows a playlist by its type or its name", () => {
    expect(isPlaylist("https://m.example/a/master.m3u8", null)).toBe(true);
    expect(isPlaylist("https://m.example/play?id=1", "application/vnd.apple.mpegurl")).toBe(true);
    expect(isPlaylist("https://m.example/play?id=1", "audio/mpegurl")).toBe(true);
    expect(isPlaylist("https://m.example/a/seg_001.m4s", "video/iso.segment")).toBe(false);
  });
});

describe("playlistIsFinal", () => {
  it("keeps multivariant and on-demand playlists, never a live one", () => {
    expect(playlistIsFinal("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n")).toBe(true);
    expect(playlistIsFinal("#EXTM3U\n#EXTINF:4,\na.m4s\n#EXT-X-ENDLIST\n")).toBe(true);
    expect(playlistIsFinal("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:9\n#EXTINF:4,\na.m4s\n")).toBe(false);
  });
});
