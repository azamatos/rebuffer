import { describe, expect, it } from "vitest";
import type { Level, RunEvent } from "@/core/run/events";
import { computeMetrics } from "./metrics";

const ladder: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 800_000, name: "360p" },
  { index: 2, bitrate: 1_600_000, name: "540p" },
  { index: 3, bitrate: 2_800_000, name: "720p" },
  { index: 4, bitrate: 5_000_000, name: "1080p" },
];

const shown = (t: number, level: number): RunEvent => ({ type: "level-shown", t, level });

/** The "train through a tunnel" run from the design proposal. */
const tunnelRun: RunEvent[] = [
  { type: "levels", t: 0.2, levels: ladder },
  shown(1.2, 2),
  { type: "first-frame", t: 1.42 },
  shown(4, 3),
  shown(8, 4),
  { type: "segment-abandoned", t: 26, level: 4, sn: 7, bytesLoaded: 1_400_000 },
  shown(26, 3),
  shown(34, 2),
  shown(40, 1),
  shown(44, 0),
  { type: "stall-start", t: 51.8 },
  { type: "stall-end", t: 55.2 },
  shown(60, 1),
  shown(64, 2),
  shown(68, 3),
  shown(74, 4),
  {
    type: "segment",
    t: 30,
    level: 3,
    sn: 8,
    bytes: 1_000_000,
    mediaDuration: 4,
    requestedAt: 26,
    firstByteAt: 26.1,
    loadedAt: 30,
  },
  { type: "end", t: 90, reason: "complete" },
];

describe("computeMetrics on the tunnel run", () => {
  const metrics = computeMetrics(tunnelRun);
  const playS = 90 - 1.42 - 3.4;

  it("measures startup and stalls", () => {
    expect(metrics.firstFrameS).toBe(1.42);
    expect(metrics.stalls.count).toBe(1);
    expect(metrics.stalls.totalS).toBeCloseTo(3.4, 10);
    expect(metrics.playS).toBeCloseTo(playS, 10);
    expect(metrics.rebufferRatio).toBeCloseTo(3.4 / (playS + 3.4), 10);
  });

  it("weights the bitrate on screen by time, leaving out the stall", () => {
    // Mbps·s per piece: 540p from the first frame, then each switch; the stall at 0:51.8–0:55.2 is excluded.
    const mbpsSeconds =
      2.58 * 1.6 +
      4 * 2.8 +
      18 * 5 +
      8 * 2.8 +
      6 * 1.6 +
      4 * 0.8 +
      7.8 * 0.4 +
      4.8 * 0.4 +
      4 * 0.8 +
      4 * 1.6 +
      6 * 2.8 +
      16 * 5;
    expect(metrics.averageBitrate).toBeCloseTo((mbpsSeconds / playS) * 1e6, 3);
  });

  it("counts switches up and down", () => {
    expect(metrics.switches).toEqual({ up: 6, down: 4, total: 10 });
  });

  it("measures time at the top quality and wasted data", () => {
    expect(metrics.topQualityShare).toBeCloseTo((18 + 16) / playS, 10);
    expect(metrics.wastedBytes).toBe(1_400_000);
    expect(metrics.downloadedBytes).toBe(2_400_000);
  });

  it("keeps the ladder, the shown timeline and the segment length", () => {
    expect(metrics.levels).toBe(ladder);
    expect(metrics.shown[0]).toEqual({ t: 1.42, level: 2 });
    expect(metrics.shown).toHaveLength(11);
    expect(metrics.segmentS).toBe(4);
    expect(metrics.endS).toBe(90);
  });
});

describe("honesty", () => {
  const request = (id: string, t: number, lateMs: number): RunEvent => ({
    type: "request",
    t,
    id,
    url: `https://media.example/${id}.m4s`,
    phase: "end",
    bytes: 1000,
    lateMs,
  });

  it("counts each request once, by its final lateness", () => {
    const metrics = computeMetrics([
      { ...request("a", 1, 0), phase: "start" } as RunEvent,
      request("a", 2, 10),
      { ...request("b", 2, 0), phase: "first-byte" } as RunEvent,
      request("b", 3, 400),
      request("c", 4, 51),
      { type: "end", t: 5, reason: "complete" },
    ]);
    expect(metrics.honesty).toEqual({ requests: 3, late: 2, worstLateMs: 400 });
  });

  it("is clean when nothing was shaped", () => {
    expect(computeMetrics([{ type: "end", t: 1, reason: "stopped" }]).honesty).toEqual({
      requests: 0,
      late: 0,
      worstLateMs: 0,
    });
  });
});

describe("computeMetrics edge cases", () => {
  it("handles a run that never showed a frame", () => {
    const metrics = computeMetrics([
      { type: "levels", t: 0.1, levels: ladder },
      { type: "stall-start", t: 0.5 },
      { type: "end", t: 20, reason: "stopped" },
    ]);
    expect(metrics.firstFrameS).toBeUndefined();
    expect(metrics.playS).toBe(0);
    expect(metrics.stalls.count).toBe(0);
    expect(metrics.averageBitrate).toBeUndefined();
    expect(metrics.rebufferRatio).toBe(0);
    expect(metrics.shown).toEqual([]);
  });

  it("ignores waiting before the first frame and closes a stall still open at the end", () => {
    const metrics = computeMetrics([
      { type: "levels", t: 0, levels: ladder },
      { type: "stall-start", t: 0.3 },
      { type: "first-frame", t: 2 },
      shown(2, 1),
      { type: "stall-start", t: 8 },
      { type: "end", t: 10, reason: "stopped" },
    ]);
    expect(metrics.stalls.intervals).toEqual([{ start: 8, end: 10 }]);
    expect(metrics.playS).toBe(6);
  });

  it("takes the first level reported after the first frame when none came before", () => {
    const metrics = computeMetrics([
      { type: "levels", t: 0, levels: ladder },
      { type: "first-frame", t: 1 },
      shown(1.1, 3),
      { type: "end", t: 11, reason: "complete" },
    ]);
    expect(metrics.shown).toEqual([{ t: 1, level: 3 }]);
    expect(metrics.averageBitrate).toBe(2_800_000);
    expect(metrics.switches.total).toBe(0);
  });

  it("does not count a repeated report of the same level as a switch", () => {
    const metrics = computeMetrics([
      { type: "levels", t: 0, levels: ladder },
      shown(0.5, 2),
      { type: "first-frame", t: 1 },
      shown(3, 2),
      shown(5, 3),
      { type: "end", t: 9, reason: "complete" },
    ]);
    expect(metrics.switches).toEqual({ up: 1, down: 0, total: 1 });
  });

  it("uses the last event as the end when the run has no end event", () => {
    const metrics = computeMetrics([
      { type: "first-frame", t: 1 },
      { type: "sample", t: 7, bufferS: 4, estimateBps: 3e6, droppedFrames: 0, position: 6 },
    ]);
    expect(metrics.endS).toBe(7);
    expect(metrics.playS).toBe(6);
  });
});
