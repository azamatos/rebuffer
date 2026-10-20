import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve";
import {
  chartRows,
  describeBufferChart,
  describeDownloadsChart,
  describeNetworkChart,
  downloadRows,
  formatRate,
  rowStep,
  sampleAt,
  shownAt,
} from "./chart-text";
import type { Level, RunEvent } from "./events";
import { buildTimeline } from "./timeline";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];

// 12 s: 4 Mbps, 0.4 Mbps from 0:04 to 0:08, then 4 Mbps; 50 ms RTT.
const curve: NetworkCurve = {
  shape: "steps",
  rttMs: 50,
  lengthS: 12,
  points: [
    { t: 0, mbps: 4 },
    { t: 4, mbps: 0.4 },
    { t: 8, mbps: 4 },
  ],
};

const sample = (t: number, bufferS: number, estimateBps?: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps,
  droppedFrames: 0,
  position: 0,
});

const run: RunEvent[] = [
  { type: "levels", t: 0.1, levels },
  sample(0.5, 0),
  { type: "level-shown", t: 0.9, level: 1 },
  { type: "first-frame", t: 1 },
  { type: "segment-loading", t: 0.3, level: 1, sn: 0 },
  {
    type: "segment",
    t: 0.95,
    level: 1,
    sn: 0,
    bytes: 1_400_000,
    mediaDuration: 4,
    requestedAt: 0.3,
    firstByteAt: 0.4,
    loadedAt: 0.95,
  },
  sample(2, 3.5, 3_000_000),
  { type: "segment-loading", t: 4.2, level: 1, sn: 1 },
  { type: "segment-abandoned", t: 6, level: 1, sn: 1, bytesLoaded: 300_000 },
  { type: "level-shown", t: 6, level: 0 },
  { type: "stall-start", t: 6.5 },
  sample(7, 0, 380_000),
];

describe("formatRate", () => {
  it("reads zero as 0 Mbps", () => {
    expect(formatRate(0)).toBe("0 Mbps");
    expect(formatRate(400_000)).toBe("400 kbps");
  });
});

describe("sampleAt and shownAt", () => {
  it("read the latest value at or before a time", () => {
    const timeline = buildTimeline(run);
    expect(sampleAt(timeline, timeline.samples.bufferS, 0.2)).toBeUndefined();
    expect(sampleAt(timeline, timeline.samples.bufferS, 3)).toBe(3.5);
    expect(sampleAt(timeline, timeline.samples.estimateBps, 1)).toBeUndefined();
    expect(shownAt(timeline, 0.5)).toBeUndefined();
    expect(shownAt(timeline, 5)).toBe(1);
    expect(shownAt(timeline, 6)).toBe(0);
  });
});

describe("describeNetworkChart", () => {
  it("previews the network before the run", () => {
    expect(describeNetworkChart(buildTimeline([]), curve, 0)).toBe(
      "The simulated network over 0:12: between 400 kbps and 4 Mbps, with 50 ms latency.",
    );
  });

  it("speaks of now while the run lasts", () => {
    expect(describeNetworkChart(buildTimeline(run), curve, 7)).toBe(
      "At 0:07 the network gives 400 kbps (between 400 kbps and 4 Mbps so far). " +
        "The player's estimate is 380 kbps. On screen now: 240p (400 kbps), after 1 quality switch.",
    );
    expect(describeNetworkChart(buildTimeline(run.slice(0, 2)), curve, 0.4)).toBe(
      "At 0:00 the network gives 4 Mbps (4 Mbps throughout so far). " +
        "The player hasn't estimated the bandwidth yet. Nothing on screen yet.",
    );
  });

  it("sums up a finished run", () => {
    const timeline = buildTimeline([
      ...run.slice(0, 4),
      sample(2, 3.5, 3_000_000),
      { type: "end", t: 3, reason: "stopped" },
    ]);
    expect(describeNetworkChart(timeline, curve, 3)).toBe(
      "Over 0:03, the network gave 4 Mbps throughout. The player's estimate ended at 3 Mbps. " +
        "On screen at the end: 720p (2.8 Mbps).",
    );
  });
});

describe("describeBufferChart", () => {
  it("waits for the run", () => {
    expect(describeBufferChart(buildTimeline([]), 0)).toBe(
      "The buffer chart fills in once the run starts.",
    );
  });

  it("gives the buffer now, its peak and the stalls so far", () => {
    expect(describeBufferChart(buildTimeline(run), 8)).toBe(
      "At 0:08 the buffer holds 0 s of video (at most 3.5 s so far). 1 stall of 1.5 s, at 0:07.",
    );
    expect(describeBufferChart(buildTimeline(run), 3)).toBe(
      "At 0:03 the buffer holds 3.5 s of video (at most 3.5 s so far). No stalls so far.",
    );
  });

  it("sums up several stalls at the end", () => {
    const timeline = buildTimeline([
      { type: "first-frame", t: 1 },
      sample(2, 6),
      { type: "stall-start", t: 3 },
      { type: "stall-end", t: 4 },
      sample(5, 2),
      { type: "stall-start", t: 6 },
      { type: "end", t: 8, reason: "complete" },
    ]);
    expect(describeBufferChart(timeline, 8)).toBe(
      "The buffer held up to 6 s of video and ended at 2 s. 2 stalls, 3 s in all; the first at 0:03.",
    );
  });
});

describe("describeDownloadsChart", () => {
  it("counts downloads, the usual quality, abandons and the longest", () => {
    expect(describeDownloadsChart(buildTimeline([]), 0)).toBe(
      "Downloads appear here once the run starts.",
    );
    expect(describeDownloadsChart(buildTimeline(run), 7)).toBe(
      "1 video segment downloaded, most at 720p (2.8 Mbps); 1 abandoned. The longest took 650 ms, from 0:00.3.",
    );
    const loading = buildTimeline([...run, { type: "segment-loading", t: 7.5, level: 0, sn: 1 }]);
    expect(describeDownloadsChart(loading, 8)).toContain("; 1 abandoned; one downloading now.");
  });
});

describe("rowStep", () => {
  it("keeps tables to about 60 rows at a round step", () => {
    expect(rowStep(12)).toBe(1);
    expect(rowStep(90)).toBe(2);
    expect(rowStep(600)).toBe(10);
    expect(rowStep(3600)).toBe(60);
  });
});

describe("chartRows", () => {
  it("samples the network, the player and the buffer at each step up to now", () => {
    const rows = chartRows(buildTimeline(run), curve, 7);
    expect(rows.map((row) => row.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(rows[0]).toEqual({
      t: 0,
      networkBps: 4e6,
      estimateBps: undefined,
      shown: undefined,
      bufferS: undefined,
      stalled: false,
    });
    expect(rows[2]).toEqual({
      t: 2,
      networkBps: 4e6,
      estimateBps: 3e6,
      shown: "720p (2.8 Mbps)",
      bufferS: 3.5,
      stalled: false,
    });
    expect(rows[7]).toMatchObject({ networkBps: 4e5, shown: "240p (400 kbps)", stalled: true });
  });
});

describe("downloadRows", () => {
  it("lists each download with its quality, time and size", () => {
    const rows = downloadRows(buildTimeline(run)).map((row) => ({
      ...row,
      tookS: row.tookS === undefined ? undefined : Number(row.tookS.toFixed(2)),
    }));
    expect(rows).toEqual([
      { start: 0.3, tookS: 0.65, quality: "720p (2.8 Mbps)", bytes: 1_400_000, state: "done" },
      { start: 4.2, tookS: 1.8, quality: "720p (2.8 Mbps)", bytes: 300_000, state: "abandoned" },
    ]);
  });
});
