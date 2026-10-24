import type { NetworkCurve } from "@/core/netsim/curve-math";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import { cutEvents } from "./compare";
import type { Level, RunEvent } from "./events";

/** Saved runs for the comparison's tests, planned by hand: a ladder, two networks, the player presets. */

/** Tears of Steel's ladder, as our encodes declare it. */
export const ladder: Level[] = [
  { index: 0, bitrate: 600_000, name: "240p" },
  { index: 1, bitrate: 1_070_000, name: "360p" },
  { index: 2, bitrate: 2_050_000, name: "540p" },
  { index: 3, bitrate: 3_430_000, name: "720p" },
  { index: 4, bitrate: 6_120_000, name: "1080p" },
];

/** The tunnel preset: 6 Mbps, weaker from 0:20, no signal from 0:42 to 0:60, back to 6 Mbps at 1:03. */
export const tunnel: NetworkCurve = {
  shape: "steps",
  rttMs: 60,
  lengthS: 90,
  points: [
    { t: 0, mbps: 6 },
    { t: 20, mbps: 2.5 },
    { t: 30, mbps: 1.2 },
    { t: 42, mbps: 0 },
    { t: 54, mbps: 3 },
    { t: 63, mbps: 6 },
  ],
};

export const rural: NetworkCurve = {
  shape: "steps",
  rttMs: 150,
  lengthS: 90,
  points: [
    { t: 0, mbps: 1.3 },
    { t: 22, mbps: 0.7 },
    { t: 46, mbps: 0.6 },
    { t: 60, mbps: 1.7 },
  ],
};

export interface Plan {
  /** [time, ladder index] from the first frame on; the first is what the first frame shows. */
  shown: [number, number][];
  firstFrame: number;
  stalls?: [number, number][];
  /** [time, seconds of buffer] samples. */
  buffer: [number, number][];
  end: number;
  reason?: SavedRun["reason"];
  player?: SavedRun["setup"]["player"];
  network?: SavedRun["setup"]["network"];
  stream?: { url: string; name: string };
  /** Downloads whose bytes the real network held back. */
  heldBack?: number;
  /** Seconds of media per segment. */
  segmentS?: number;
}

export const DEFAULTS = { presetId: "defaults", name: "Defaults", settings: {} };
export const LOW_MEMORY = {
  presetId: "low-memory-tv",
  name: "Low-memory TV",
  settings: {
    maxBufferLength: 10,
    maxMaxBufferLength: 20,
    backBufferLength: 10,
    capLevelToPlayerSize: true,
  },
};
export const FAST_START = {
  presetId: "fast-start",
  name: "Fast start",
  settings: { startLevel: 0 },
};
export const TUNNEL = { id: "tunnel", name: "Train through a tunnel", curve: tunnel };
export const RURAL = { id: "rural-3g", name: "Rural 3G", curve: rural };

const sample = (t: number, bufferS: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps: 3_000_000,
  droppedFrames: 0,
  position: 0,
});

const request = (i: number, late: boolean): RunEvent =>
  ({
    type: "request",
    t: 1 + i,
    id: `r${i}`,
    url: `https://media.example/seg${i}.m4s`,
    phase: "end",
    bytes: 1_000_000,
    firstByteLateMs: 0,
    bodyLateMs: late ? 600 : 0,
    realBps: undefined,
  }) as RunEvent;

export function planned(id: string, plan: Plan): SavedRun {
  const [first, ...rest] = plan.shown;
  const events: RunEvent[] = [{ type: "levels", t: 0.1, levels: ladder }];
  if (first) events.push({ type: "level-shown", t: plan.firstFrame - 0.05, level: first[1] });
  events.push({ type: "first-frame", t: plan.firstFrame });
  for (const [t, level] of rest) events.push({ type: "level-shown", t, level });
  for (const [t, bufferS] of plan.buffer) events.push(sample(t, bufferS));
  for (const [start, end] of plan.stalls ?? []) {
    events.push({ type: "stall-start", t: start }, { type: "stall-end", t: end });
  }
  const segmentS = plan.segmentS ?? 4;
  for (let sn = 0; sn * segmentS < plan.end; sn++) {
    events.push({
      type: "segment",
      t: sn * segmentS + 0.5,
      level: 0,
      sn,
      bytes: 500_000,
      mediaDuration: segmentS,
      requestedAt: sn * segmentS,
      firstByteAt: sn * segmentS + 0.1,
      loadedAt: sn * segmentS + 0.5,
    });
  }
  for (let i = 0; i < 20; i++) events.push(request(i, i < (plan.heldBack ?? 0)));
  events.sort((x, y) => x.t - y.t);
  events.push({ type: "end", t: plan.end, reason: plan.reason ?? "complete" });
  return {
    format: RUN_FORMAT,
    version: RUN_VERSION,
    id,
    startedAt: 0,
    savedAt: 0,
    setup: {
      streamUrl: plan.stream?.url ?? "https://media.example/tears/master.m3u8",
      streamName: plan.stream?.name ?? "Tears of Steel",
      network: plan.network ?? TUNNEL,
      player: plan.player ?? DEFAULTS,
    },
    player: { name: "hls.js", version: "1.7.3" },
    environment: { browser: "Chrome on macOS", playerSize: undefined },
    reason: plan.reason ?? "complete",
    events: plan.reason && plan.reason !== "complete" ? cutEvents(events, plan.end) : events,
  };
}

/** A: Defaults on the tunnel, a 30 s buffer, no stall. */
export const runA = planned("a", {
  firstFrame: 1.12,
  shown: [
    [1.12, 0],
    [5, 2],
    [9, 3],
    [38, 2],
    [52, 1],
    [68, 2],
    [78, 3],
  ],
  buffer: [
    [1, 2],
    [12, 18],
    [22, 30],
    [30, 30],
    [42, 24],
    [52, 13],
    [60, 9],
    [75, 28],
    [89, 30],
  ],
  end: 90,
});

/** B: Low-memory TV, its buffer held at 10 s, a 3.4 s stall at 0:52. */
export const tvPlan: Plan = {
  player: LOW_MEMORY,
  firstFrame: 1.08,
  shown: [
    [1.08, 0],
    [5, 2],
    [9, 3],
    [30, 1],
    [40, 0],
    [66, 2],
    [74, 3],
  ],
  stalls: [[52, 55.4]],
  buffer: [
    [1, 2],
    [10, 10],
    [42, 10],
    [51.9, 0.2],
    [55.4, 0],
    [58, 3],
    [64, 10],
    [89, 10],
  ],
  end: 90,
};
export const runTv = planned("tv", tvPlan);
