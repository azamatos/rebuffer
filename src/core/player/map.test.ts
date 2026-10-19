import { describe, expect, it } from "vitest";
import { bufferAhead, levelsFromHls, type TimeRangesLike } from "./map";

function ranges(...pairs: [number, number][]): TimeRangesLike {
  return {
    length: pairs.length,
    start: (i) => pairs[i]?.[0] ?? Number.NaN,
    end: (i) => pairs[i]?.[1] ?? Number.NaN,
  };
}

describe("levelsFromHls", () => {
  it("names sized levels by their 16:9 width class, like the inspector", () => {
    expect(
      levelsFromHls([
        { bitrate: 400_000, width: 426, height: 178, name: "" },
        { bitrate: 2_800_000, width: 1280, height: 534, name: "534p" },
        { bitrate: 5_000_000, width: 1920, height: 800 },
      ]).map((level) => level.name),
    ).toEqual(["240p", "720p", "1080p"]);
  });

  it("keeps index, bitrate and size", () => {
    expect(levelsFromHls([{ bitrate: 400_000, width: 426, height: 178 }])).toEqual([
      { index: 0, bitrate: 400_000, width: 426, height: 178, name: "240p" },
    ]);
  });

  it("keeps the NAME of a level without a size, or numbers it", () => {
    expect(
      levelsFromHls([
        { bitrate: 128_000, width: 0, height: 0, name: "Audio" },
        { bitrate: 64_000, width: 0, height: 0 },
      ]).map((level) => level.name),
    ).toEqual(["Audio", "Level 2"]);
  });
});

describe("bufferAhead", () => {
  it("is zero with nothing buffered", () => {
    expect(bufferAhead(ranges(), 3)).toBe(0);
  });

  it("measures the range that contains the position", () => {
    expect(bufferAhead(ranges([0, 12]), 4)).toBe(8);
  });

  it("bridges small holes but not big ones", () => {
    expect(bufferAhead(ranges([0, 8], [8.3, 20]), 4)).toBe(16);
    expect(bufferAhead(ranges([0, 8], [10, 20]), 4)).toBe(4);
  });

  it("counts a range that starts just ahead of the position", () => {
    expect(bufferAhead(ranges([10.2, 16]), 10)).toBeCloseTo(6, 10);
  });

  it("is zero when the position is past every range", () => {
    expect(bufferAhead(ranges([0, 8]), 9)).toBe(0);
  });
});
