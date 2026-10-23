import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import {
  bufferTakeaway,
  compared,
  compareMetrics,
  compareRows,
  compareVerdict,
  describeCompareQuality,
  endedEarly,
  qualityTakeaway,
  setupChanges,
  sharedSpanS,
  stallsTakeaway,
  tally,
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
  reason: SavedRun["reason"] = "complete",
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
  reason,
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

  it("says how B did against A, in words and as a verdict, in groups", () => {
    expect(rows["First frame"]).toEqual({
      label: "First frame",
      group: "Starting",
      a: "1.00 s",
      b: "0.60 s",
      difference: "0.40 s sooner",
      verdict: "better",
    });
    expect(rows["Stall time"]).toMatchObject({
      group: "Stalling",
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
    expect(compareMetrics(a, b).map((row) => row.group)).toEqual([
      "Overall",
      "Starting",
      "Stalling",
      "Stalling",
      "Stalling",
      "Picture",
      "Picture",
      "Picture",
      "Data",
    ]);
  });

  it("calls numbers that read the same the same", () => {
    const same = compareMetrics(a, a);
    expect(same.every((row) => row.verdict === "same" && row.difference === "")).toBe(true);
    expect(rows["Wasted data"]).toMatchObject({ a: "0.0 MB", b: "0.0 MB", verdict: "same" });
  });

  it("counts a run that never showed a picture as the worse one", () => {
    const blank = compared(run("c", [{ type: "end", t: 20, reason: "error" }]));
    const first = (x: typeof a, y: typeof a) =>
      compareMetrics(x, y).find((row) => row.label === "First frame");
    expect(first(a, blank)).toMatchObject({ b: "never", difference: "", verdict: "worse" });
    expect(first(blank, a)).toMatchObject({ a: "never", verdict: "better" });
    expect(first(blank, blank)).toMatchObject({ verdict: "same" });
  });

  const withScore = (score: number, firstFrameS: number) => ({
    ...a,
    score: { ...a.score, score },
    metrics: { ...a.metrics, firstFrameS },
  });
  const rowsOf = (x: number, y: number, fx: number, fy: number) =>
    Object.fromEntries(
      compareMetrics(withScore(x, fx), withScore(y, fy)).map((row) => [row.label, row]),
    );

  it("works out differences from the numbers as shown", () => {
    // 50.6 and 52.4 read 51 and 52: one point apart, not two.
    expect(rowsOf(50.6, 52.4, 1, 1)["QoE score"]?.difference).toBe("+1 point");
    // 0.304 and 0.306 s read 0.30 and 0.31 s: 0.01 s later, not "0.00 s later".
    expect(rowsOf(50, 50, 0.304, 0.306)["First frame"]?.difference).toBe("0.01 s later");
    expect(rowsOf(50.4, 50.6, 0.3, 0.3)["QoE score"]?.difference).toBe("+1 point");
    expect(rowsOf(50.2, 50.4, 0.3, 0.3)["QoE score"]?.verdict).toBe("same");
  });

  it("calls a difference within the spread between repeat runs no difference", () => {
    expect(rowsOf(50, 52, 1, 1.3)["QoE score"]).toMatchObject({
      difference: "+2 points",
      verdict: "spread",
    });
    expect(rowsOf(50, 52, 1, 1.3)["First frame"]).toMatchObject({
      difference: "0.30 s later",
      verdict: "spread",
    });
    expect(rowsOf(50, 53, 1, 1.31)["QoE score"]?.verdict).toBe("better");
    expect(rowsOf(50, 53, 1, 1.31)["First frame"]?.verdict).toBe("worse");
  });

  it("compares only the first frame over whole runs when one ended early", () => {
    const only = compareMetrics(a, b, { firstFrameOnly: true });
    expect(only.filter((row) => row.verdict !== "not-comparable").map((row) => row.label)).toEqual([
      "First frame",
    ]);
    expect(tally(only)).toBe("Over whole runs, only the first frame compares fairly.");
  });

  it("tallies the verdicts", () => {
    expect(tally(compareMetrics(a, b))).toBe("5 better · 3 worse · 1 the same");
    expect(tally(compareMetrics(withScore(50, 1), withScore(51, 1)))).toBe(
      "1 within spread · 8 the same",
    );
  });
});

describe("setupChanges", () => {
  it("counts a player preset as one change, with the settings it changes under it", () => {
    expect(setupChanges(a.run, b.run)).toEqual([
      {
        label: "Player setup",
        a: "Defaults",
        b: "Fast start",
        detail: "The preset changes 1 setting: start level auto → 0.",
      },
    ]);
    const tv = run("tv", [], {
      player: {
        presetId: "low-memory-tv",
        name: "Low-memory TV",
        settings: {
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          backBufferLength: 10,
          capLevelToPlayerSize: true,
        },
      },
    });
    expect(setupChanges(a.run, tv)[0]?.detail).toBe(
      "The preset changes 4 settings: buffer target 30 s → 10 s, buffer ceiling 600 s → 20 s, back buffer unlimited → 10 s, cap to player size off → on.",
    );
    expect(setupChanges(a.run, a.run)).toEqual([]);
  });

  it("counts each setting changed by hand", () => {
    const byHand = run("h", [], {
      player: {
        presetId: "fast-start",
        name: "Fast start",
        settings: { startLevel: 0, abrEwmaDefaultEstimate: 1_000_000 },
      },
    });
    expect(setupChanges(b.run, byHand)).toEqual([
      { label: "First estimate", a: "500 kbps", b: "1 Mbps" },
    ]);
  });

  it("tells a changed copy of a network from the network itself", () => {
    const drawn = run("d", [], {
      network: {
        id: undefined,
        name: "Train through a tunnel",
        curve: { ...tunnel, rttMs: 200 },
      },
    });
    expect(setupChanges(a.run, drawn)).toEqual([
      {
        label: "Network",
        a: "Train through a tunnel",
        b: "Train through a tunnel (drawn)",
      },
    ]);
  });
});

describe("compareVerdict", () => {
  it("leads with the score and the number that moved most, the facts after", () => {
    expect(compareVerdict(a, b, setupChanges(a.run, b.run), compareMetrics(a, b))).toEqual({
      difference: { text: "19 points lower", verdict: "worse" },
      headline: "B did worse: 19 points lower, though it never stalled.",
      detail:
        "B never stalled. A stalled once, for 2 s from 0:12. B showed its first frame 0.40 s sooner. B's buffer held up to 20 s; A's up to 8 s.",
      spread: false,
    });
    expect(compareVerdict(b, a, setupChanges(b.run, a.run), compareMetrics(b, a)).headline).toBe(
      "B did better: 19 points higher, though it stalled once.",
    );
  });

  it("calls the same setup within the spread no real difference", () => {
    expect(compareVerdict(a, a, [], compareMetrics(a, a))).toMatchObject({
      difference: { text: "the same score", verdict: "same" },
      headline: "The same setup, and no real difference.",
      spread: true,
    });
  });

  it("says the real network held downloads back, when it did", () => {
    const late = {
      ...b,
      metrics: {
        ...b.metrics,
        honesty: {
          ...b.metrics.honesty,
          requests: 40,
          bandwidth: { ...b.metrics.honesty.bandwidth, late: 3 },
        },
      },
    };
    expect(compareVerdict(a, late, [], compareMetrics(a, late)).detail).toContain(
      "The real network held back 3 of 40 downloads in B, so part of the difference may be its doing, not the setup's.",
    );
  });

  it("compares the stretch both covered when one was stopped, or only the first frame over whole runs", () => {
    const stopped = run(
      "s",
      [
        ...b.run.events.filter((event) => event.t <= 9 && event.type !== "end"),
        { type: "end", t: 9, reason: "stopped" },
      ],
      { player: b.run.setup.player },
      "stopped",
    );
    const ended = endedEarly(a.run, stopped);
    expect(ended).toEqual([{ side: "B", atS: 9, lengthS: 20, reason: "stopped" }]);
    expect(sharedSpanS(a.run, stopped)).toBe(9);
    expect(sharedSpanS(a.run, b.run)).toBeUndefined();

    const shortA = compared(a.run, 9);
    const shortB = compared(stopped, 9);
    const shared = compareVerdict(shortA, shortB, [], compareMetrics(shortA, shortB), { ended });
    expect(shared.headline).toBe("Too early to tell: B was stopped at 0:09 of 0:20.");
    expect(shared.detail).toMatch(/^No stalls in either run\./);

    const whole = compareVerdict(
      a,
      compared(stopped),
      [],
      compareMetrics(a, compared(stopped), { firstFrameOnly: true }),
      { ended, whole: true },
    );
    expect(whole.difference).toEqual({
      text: "not comparable: B didn't finish",
      verdict: "not-comparable",
    });
    expect(whole.detail).toBe(
      "Over whole runs, only the first frame compares fairly: B showed its first frame 0.40 s sooner.",
    );
  });
});

describe("the charts' text", () => {
  it("gives each chart a takeaway", () => {
    expect(qualityTakeaway(a, b)).toBe(
      "A topped out at 720p, B at 240p. B never left 240p; A went down to 240p at 0:10.",
    );
    expect(qualityTakeaway(a, b, { mbps: true })).toBe(
      "A topped out at 2.8 Mbps, B at 400 kbps. B never left 400 kbps; A went down to 400 kbps at 0:10.",
    );
    // B started on 240p and climbed, so it never went down to its lowest.
    const climbed = compared(
      run("c", [
        { type: "levels", t: 0.1, levels },
        { type: "level-shown", t: 0.5, level: 0 },
        { type: "first-frame", t: 0.6 },
        { type: "level-shown", t: 4, level: 1 },
        { type: "end", t: 20, reason: "complete" },
      ]),
    );
    expect(qualityTakeaway(a, climbed)).toBe(
      "Both topped out at 720p. B never went below 240p; A went down to 240p at 0:10.",
    );
    expect(bufferTakeaway(a, b)).toBe(
      "B's buffer held up to 20 s and never ran dry. A's held up to 8 s and ran dry at 0:12.",
    );
    expect(stallsTakeaway(a, b)).toBe("B never stalled. A stalled once, for 2 s from 0:12.");
    expect(stallsTakeaway(b, b, 9)).toBe("No stalls in either run, up to 0:09.");
  });

  it("labels the quality chart with both networks and the quality on screen", () => {
    expect(describeCompareQuality(a, b)).toBe(
      "Both ran on the same network, between 500 kbps and 4 Mbps. A averaged 1.7 Mbps on screen with 1 quality switch; B averaged 400 kbps on screen with no quality switches.",
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

  it("cuts a run at a time as if stopped there", () => {
    const short = compared(a.run, 9);
    expect(short.metrics.endS).toBe(9);
    expect(short.metrics.stalls.count).toBe(0);
    expect(short.timeline.endS).toBe(9);
  });
});
