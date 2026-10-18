import { describe, expect, it } from "vitest";
import type { Level, RunEvent } from "./events";
import { describeEvents, formatMbps, levelLabel } from "./describe";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];

describe("formatMbps", () => {
  it("picks a readable unit", () => {
    expect(formatMbps(400_000)).toBe("400 kbps");
    expect(formatMbps(2_800_000)).toBe("2.8 Mbps");
    expect(formatMbps(50_000_000)).toBe("50 Mbps");
  });
});

describe("levelLabel", () => {
  it("names a level with its bitrate", () => {
    expect(levelLabel(levels[1], 1)).toBe("720p (2.8 Mbps)");
    expect(levelLabel(undefined, 3)).toBe("level 4");
  });
});

describe("describeEvents", () => {
  it("tells the story of a run in plain words", () => {
    const events: RunEvent[] = [
      { type: "levels", t: 0.2, levels },
      { type: "level-shown", t: 1.1, level: 1 },
      { type: "first-frame", t: 1.42 },
      { type: "sample", t: 2, bufferS: 3, estimateBps: 3e6, droppedFrames: 0, position: 0.6 },
      { type: "segment-abandoned", t: 26, level: 1, sn: 7, bytesLoaded: 1_400_000 },
      { type: "level-shown", t: 26, level: 0 },
      { type: "stall-start", t: 51.8 },
      { type: "stall-end", t: 55.2 },
      { type: "level-shown", t: 60, level: 1 },
      { type: "end", t: 90, reason: "complete" },
    ];
    expect(describeEvents(events).map((line) => `${line.time} ${line.text}`)).toEqual([
      "0:00.2 Playlist loaded: 2 qualities.",
      "0:01.1 Playing 720p (2.8 Mbps).",
      "0:01.4 First frame on screen.",
      "0:26.0 Gave up on a 720p (2.8 Mbps) segment after 1.4 MB.",
      "0:26.0 Switched down to 240p (400 kbps).",
      "0:51.8 Stall: the buffer ran out.",
      "0:55.2 Playing again after 3.4 s.",
      "1:00.0 Switched up to 720p (2.8 Mbps).",
      "1:30.0 Run finished.",
    ]);
  });

  it("leaves out the player's non-fatal notices", () => {
    const lines = describeEvents([
      { type: "error", t: 1.2, fatal: false, message: "fragment loaded with buffer holes" },
    ]);
    expect(lines).toEqual([]);
  });

  it("reports fatal errors and stops", () => {
    const lines = describeEvents([
      { type: "error", t: 3, fatal: true, message: "The stream couldn't be loaded." },
      { type: "end", t: 3, reason: "error" },
    ]);
    expect(lines.map((line) => line.text)).toEqual([
      "Stopped: The stream couldn't be loaded.",
      "Run ended with an error.",
    ]);
  });
});
