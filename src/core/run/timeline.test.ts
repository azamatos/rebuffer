import { describe, expect, it } from "vitest";
import type { Level, RunEvent } from "./events";
import { addEvent, buildTimeline, createTimeline } from "./timeline";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];

const sample = (t: number, bufferS: number, estimateBps?: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps,
  droppedFrames: 0,
  position: 0,
});

const loaded = (t: number, level: number, sn: number, requestedAt: number): RunEvent => ({
  type: "segment",
  t,
  level,
  sn,
  bytes: 1000,
  mediaDuration: 4,
  requestedAt,
  firstByteAt: requestedAt + 0.1,
  loadedAt: t,
});

describe("timeline", () => {
  it("keeps samples in parallel arrays, with NaN where the player had no estimate", () => {
    const timeline = buildTimeline([sample(0.25, 0), sample(0.5, 1.5, 3e6)]);
    expect(timeline.samples).toEqual({
      t: [0.25, 0.5],
      bufferS: [0, 1.5],
      estimateBps: [Number.NaN, 3e6],
    });
  });

  it("starts the quality on screen at the first frame, like the metrics", () => {
    const timeline = buildTimeline([
      { type: "levels", t: 0.1, levels },
      { type: "level-shown", t: 0.8, level: 1 },
      { type: "first-frame", t: 1.2 },
      { type: "level-shown", t: 5, level: 1 },
      { type: "level-shown", t: 9, level: 0 },
    ]);
    expect(timeline.levels).toBe(levels);
    expect(timeline.firstFrameS).toBe(1.2);
    expect(timeline.shown).toEqual([
      { t: 1.2, level: 1 },
      { t: 9, level: 0 },
    ]);
  });

  it("puts a level reported just after the first frame at the first frame", () => {
    const timeline = buildTimeline([
      { type: "first-frame", t: 1 },
      { type: "level-shown", t: 1.05, level: 0 },
    ]);
    expect(timeline.shown).toEqual([{ t: 1, level: 0 }]);
  });

  it("records stalls after the first frame only, and closes an open one at the end", () => {
    const timeline = buildTimeline([
      { type: "stall-start", t: 0.5 },
      { type: "stall-end", t: 0.9 },
      { type: "first-frame", t: 1 },
      { type: "stall-start", t: 4 },
      { type: "stall-start", t: 4.5 },
      { type: "stall-end", t: 6 },
      { type: "stall-start", t: 8 },
      { type: "end", t: 10, reason: "complete" },
    ]);
    expect(timeline.stalls).toEqual([
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]);
  });

  it("follows each download from its start to its end, with the player's own timings", () => {
    const timeline = buildTimeline([
      { type: "segment-loading", t: 1, level: 1, sn: 0 },
      loaded(2.5, 1, 0, 1.02),
    ]);
    expect(timeline.downloads).toEqual([
      { level: 1, sn: 0, start: 1.02, end: 2.5, state: "done", bytes: 1000 },
    ]);
  });

  it("marks a download abandoned when the player gives up on it", () => {
    const timeline = buildTimeline([
      { type: "segment-loading", t: 1, level: 1, sn: 3 },
      { type: "segment-abandoned", t: 3, level: 1, sn: 3, bytesLoaded: 400 },
      { type: "segment-loading", t: 3.01, level: 0, sn: 3 },
      loaded(3.5, 0, 3, 3.01),
    ]);
    expect(
      timeline.downloads.map(({ state, start, end, bytes }) => ({ state, start, end, bytes })),
    ).toEqual([
      { state: "abandoned", start: 1, end: 3, bytes: 400 },
      { state: "done", start: 3.01, end: 3.5, bytes: 1000 },
    ]);
  });

  it("counts a download still loading when the next one starts as abandoned there", () => {
    const timeline = buildTimeline([
      { type: "segment-loading", t: 1, level: 1, sn: 3 },
      { type: "segment-loading", t: 2, level: 1, sn: 7 },
    ]);
    expect(timeline.downloads.map(({ state, end }) => ({ state, end }))).toEqual([
      { state: "abandoned", end: 2 },
      { state: "loading", end: undefined },
    ]);
  });

  it("keeps a finished download it never saw start", () => {
    const timeline = buildTimeline([loaded(2, 0, 5, 1.5)]);
    expect(timeline.downloads).toEqual([
      { level: 0, sn: 5, start: 1.5, end: 2, state: "done", bytes: 1000 },
    ]);
  });

  it("stops at the end: a download in progress ends there and later events are ignored", () => {
    const timeline = createTimeline();
    addEvent(timeline, { type: "segment-loading", t: 1, level: 0, sn: 0 });
    addEvent(timeline, { type: "end", t: 2, reason: "stopped" });
    addEvent(timeline, sample(2.25, 3));
    addEvent(timeline, { type: "end", t: 9, reason: "complete" });
    expect(timeline.endS).toBe(2);
    expect(timeline.downloads[0]).toMatchObject({ state: "loading", end: 2 });
    expect(timeline.samples.t).toEqual([]);
  });
});
