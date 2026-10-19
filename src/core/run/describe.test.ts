import { describe, expect, it } from "vitest";
import type { Level, RunEvent } from "./events";
import type { Honesty } from "@/core/metrics";
import {
  describeEvents,
  describeHonesty,
  describeNetworkCheck,
  formatMbps,
  levelLabel,
} from "./describe";

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

describe("describeNetworkCheck", () => {
  const check = (latencyMs: number | undefined): Extract<RunEvent, { type: "network-check" }> => ({
    type: "network-check",
    t: 0,
    host: "media.azamatos.com",
    latencyMs,
    samplesMs: [],
  });

  it("warns when the real latency is above the simulated one", () => {
    expect(describeNetworkCheck(check(85), 40)).toBe(
      "Your real latency to media.azamatos.com is about 85 ms, above the simulated 40 ms, so downloads can't start as soon as this network would start them. The result will say how much that mattered.",
    );
  });

  it("stays quiet within the shaper's own margin, and when there was no answer", () => {
    expect(describeNetworkCheck(check(95), 80)).toBeUndefined();
    expect(describeNetworkCheck(check(undefined), 80)).toBeUndefined();
    expect(describeNetworkCheck(undefined, 80)).toBeUndefined();
  });
});

describe("describeHonesty", () => {
  const honesty = (overrides: {
    latency?: Partial<Honesty["latency"]>;
    bandwidth?: Partial<Honesty["bandwidth"]>;
    hiddenS?: number;
  }): Honesty => ({
    requests: 41,
    latency: {
      host: "media.azamatos.com",
      realMs: 85,
      late: 0,
      worstLateMs: 12,
      ...overrides.latency,
    },
    bandwidth: { late: 0, worstLateMs: 0, realBps: 18_000_000, ...overrides.bandwidth },
    hiddenS: overrides.hiddenS ?? 0,
  });

  it("says the connection kept up when nothing was late", () => {
    expect(describeHonesty(honesty({}), 80)).toEqual([
      "Your connection kept up: all 41 downloads arrived before the simulation needed them.",
    ]);
  });

  it("puts a late start down to the real latency", () => {
    expect(describeHonesty(honesty({ latency: { late: 38, worstLateMs: 52 } }), 40)).toEqual([
      "38 of 41 downloads started late, by up to 52 ms: your real latency to media.azamatos.com is about 85 ms, above the simulated 40 ms.",
      "Your connection kept up with the bandwidth.",
    ]);
  });

  it("doesn't quote a measured latency that was below the simulated one", () => {
    expect(
      describeHonesty(honesty({ latency: { realMs: 30, late: 2, worstLateMs: 310 } }), 80)[0],
    ).toBe(
      "2 of 41 downloads started late, by up to 310 ms: the real network was slower to answer than the simulated 80 ms.",
    );
  });

  it("puts late bytes down to the bandwidth, with the speed the real network managed", () => {
    expect(describeHonesty(honesty({ bandwidth: { late: 7, worstLateMs: 1240 } }), 15)).toEqual([
      "7 of 41 downloads arrived late, by up to 1.2 s: the real network couldn't keep up with the simulated bandwidth (it delivered about 18 Mbps while downloading).",
      "This run is slower than the simulated network alone.",
    ]);
  });

  it("names both, and a background tab", () => {
    expect(
      describeHonesty(
        honesty({
          latency: { late: 3, worstLateMs: 120 },
          bandwidth: { late: 1, worstLateMs: 268, realBps: undefined },
          hiddenS: 12,
        }),
        40,
      ),
    ).toEqual([
      "3 of 41 downloads started late, by up to 120 ms: your real latency to media.azamatos.com is about 85 ms, above the simulated 40 ms.",
      "1 of 41 downloads arrived late, by up to 268 ms: the real network couldn't keep up with the simulated bandwidth.",
      "This run is slower than the simulated network alone.",
      "The tab was in the background for 12 s, where browsers slow down timers, so the player may have behaved differently than in a visible tab.",
    ]);
  });

  it("says nothing about downloads when there were none", () => {
    expect(describeHonesty({ ...honesty({}), requests: 0 }, 80)).toEqual([]);
  });
});
