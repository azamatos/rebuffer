import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import {
  compared,
  compareMetrics,
  compareRows,
  describeCompareBuffer,
  describeCompareQuality,
  describeCompareStalls,
  setupDifferences,
} from "./compare";
import type { Level, RunEvent } from "./events";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];

const tunnel: NetworkCurve = {
  shape: "steps",
  rttMs: 80,
  lengthS: 20,
  points: [
    { t: 0, mbps: 4 },
    { t: 10, mbps: 0.5 },
  ],
};

const sample = (t: number, bufferS: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps: 3_000_000,
  droppedFrames: 0,
  position: 0,
});

const run = (
  id: string,
  events: RunEvent[],
  changes: Partial<SavedRun["setup"]> = {},
): SavedRun => ({
  format: RUN_FORMAT,
  version: RUN_VERSION,
  id,
  startedAt: 0,
  savedAt: 0,
  setup: {
    streamUrl: "https://media.example/master.m3u8",
    streamName: "Tears of Steel",
    network: { id: "tunnel", name: "Train through a tunnel", curve: tunnel },
    player: { presetId: "defaults", name: "Defaults", settings: {} },
    ...changes,
  },
  player: { name: "hls.js", version: "1.7.3" },
  environment: { browser: "Chrome on macOS", playerSize: undefined },
  reason: "complete",
  events,
});

// A: the first frame at 1 s on 720p, down to 240p at 10 s, a 2 s stall from 12 s.
const a = compared(
  run("a", [
    { type: "levels", t: 0.1, levels },
    { type: "level-shown", t: 0.9, level: 1 },
    { type: "first-frame", t: 1 },
    sample(5, 8),
    { type: "level-shown", t: 10, level: 0 },
    sample(11, 0.5),
    { type: "stall-start", t: 12 },
    { type: "stall-end", t: 14 },
    sample(15, 4),
    { type: "end", t: 20, reason: "complete" },
  ]),
);

// B: started on 240p sooner and stayed there, no stalls.
const b = compared(
  run(
    "b",
    [
      { type: "levels", t: 0.1, levels },
      { type: "level-shown", t: 0.5, level: 0 },
      { type: "first-frame", t: 0.6 },
      sample(5, 12),
      sample(15, 20),
      { type: "end", t: 20, reason: "complete" },
    ],
    {
      player: { presetId: "fast-start", name: "Fast start", settings: { startLevel: 0 } },
    },
  ),
);

describe("compareMetrics", () => {
  const rows = Object.fromEntries(compareMetrics(a, b).map((row) => [row.label, row]));

  it("says how B did against A, in words and as a verdict", () => {
    expect(rows["First frame"]).toEqual({
      label: "First frame",
      a: "1.00 s",
      b: "0.60 s",
      difference: "0.40 s sooner",
      verdict: "better",
    });
    expect(rows["Stall time"]).toMatchObject({
      a: "2 s",
      b: "none",
      difference: "2 s less",
      verdict: "better",
    });
    expect(rows.Stalls).toMatchObject({ a: "1", b: "0", difference: "1 fewer" });
    expect(rows["Quality switches"]).toMatchObject({ a: "1", b: "0", verdict: "better" });
    expect(rows["Average bitrate"]?.verdict).toBe("worse");
    expect(rows["Average bitrate"]?.difference).toMatch(/^−\d/);
    expect(rows["At top quality"]?.verdict).toBe("worse");
  });

  it("calls numbers that read the same the same", () => {
    const same = compareMetrics(a, a);
    expect(same.every((row) => row.verdict === "same" && row.difference === "—")).toBe(true);
    expect(rows["Wasted data"]).toMatchObject({ a: "0.0 MB", b: "0.0 MB", verdict: "same" });
  });

  it("says when a run never showed a picture", () => {
    const blank = compared(run("c", [{ type: "end", t: 20, reason: "error" }]));
    const first = compareMetrics(a, blank).find((row) => row.label === "First frame");
    expect(first).toMatchObject({ b: "never", difference: "—", verdict: "unknown" });
  });
});

describe("setupDifferences", () => {
  it("lists the player and each setting that changed, and nothing that didn't", () => {
    expect(setupDifferences(a.run, b.run)).toEqual([
      { label: "Player setup", a: "Defaults", b: "Fast start" },
      { label: "startLevel", a: "auto", b: "0" },
    ]);
    expect(setupDifferences(a.run, a.run)).toEqual([]);
  });

  it("tells a changed copy of a network from the network itself", () => {
    const drawn = run("d", [], {
      network: {
        id: undefined,
        name: "Train through a tunnel",
        curve: { ...tunnel, rttMs: 200 },
      },
    });
    expect(setupDifferences(a.run, drawn)).toEqual([
      {
        label: "Network",
        a: "Train through a tunnel",
        b: "Train through a tunnel (drawn)",
      },
    ]);
  });
});

describe("the charts' text", () => {
  it("sums each chart up for both runs", () => {
    expect(describeCompareQuality(a, b)).toBe(
      "Both ran on the same network, between 500 kbps and 4 Mbps. A averaged 1.7 Mbps on screen with 1 quality switch; B averaged 400 kbps on screen with no quality switches.",
    );
    expect(describeCompareBuffer(a, b)).toBe("A's buffer held up to 8 s of video; B's up to 20 s.");
    expect(describeCompareStalls(a, b)).toBe(
      "A stalled once, 2 s in all, first at 0:12; B never stalled.",
    );
  });

  it("gives both runs a row at each round step", () => {
    const rows = compareRows(a, b);
    expect(rows.map((row) => row.t)).toEqual(Array.from({ length: 21 }, (_, i) => i));
    expect(rows[12]).toEqual({
      t: 12,
      a: { shown: "240p (400 kbps)", bufferS: 0.5, stalled: true },
      b: { shown: "240p (400 kbps)", bufferS: 12, stalled: false },
    });
    expect(rows[0]?.a).toEqual({ shown: undefined, bufferS: undefined, stalled: false });
  });
});
