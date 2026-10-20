import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/core/metrics";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import type { PlayerSettings } from "@/core/player/settings";
import { DEFAULT_STREAM } from "@/core/samples";
import type { Level, RunEvent } from "./events";
import { tryNext, type IdeaInput } from "./ideas";
import { ideaSearch } from "./report";
import { buildTimeline } from "./timeline";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
  { index: 2, bitrate: 5_000_000, name: "1080p" },
];

const steady = (mbps: number): NetworkCurve => ({
  shape: "steps",
  rttMs: 40,
  lengthS: 60,
  points: [{ t: 0, mbps }],
});

const sample = (t: number, bufferS: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps: undefined,
  droppedFrames: 0,
  position: 0,
});

function input(
  events: RunEvent[],
  overrides: Partial<Omit<IdeaInput, "metrics" | "timeline">> = {},
): IdeaInput {
  const all: RunEvent[] = [
    { type: "levels", t: 0.1, levels },
    { type: "level-shown", t: 0.9, level: 2 },
    { type: "first-frame", t: 1 },
    ...events,
    { type: "end", t: 60, reason: "complete" },
  ];
  return {
    metrics: computeMetrics(all),
    timeline: buildTimeline(all),
    curve: steady(6),
    settings: {},
    presetId: "defaults",
    networkId: "lift",
    ...overrides,
  };
}

const titles = (ideas: { title: string }[]) => ideas.map((idea) => idea.title);

describe("tryNext", () => {
  it("answers stalls with headroom, a longer buffer when it was full, and faster reactions", () => {
    const ideas = tryNext(
      input([sample(10, 28), { type: "stall-start", t: 30 }, { type: "stall-end", t: 32 }]),
    );
    expect(ideas).toEqual([
      {
        title: "Keep more headroom",
        change: "abrBandWidthFactor 0.95 → 0.8",
        apply: { kind: "settings", settings: { abrBandWidthFactor: 0.8 } },
      },
      {
        title: "Buffer further ahead",
        change: "maxBufferLength 30 → 60",
        apply: { kind: "settings", settings: { maxBufferLength: 60 } },
      },
      {
        title: "React faster to drops",
        change: "abrEwmaFastVoD 3 → 1.5",
        apply: { kind: "settings", settings: { abrEwmaFastVoD: 1.5 } },
      },
    ]);
  });

  it("doesn't suggest what the run already does", () => {
    const settings: PlayerSettings = { abrBandWidthFactor: 0.8, abrEwmaFastVoD: 1 };
    const ideas = tryNext(
      input([sample(10, 5), { type: "stall-start", t: 30 }, { type: "stall-end", t: 32 }], {
        settings,
      }),
    );
    expect(titles(ideas)).toEqual(["Same player, a harder network"]);
  });

  it("calms a player that switches a lot, and starts low after a slow start", () => {
    const switches: RunEvent[] = [1, 2, 1, 2, 1, 2].map((level, i) => ({
      type: "level-shown",
      t: 5 + i * 5,
      level,
    }));
    const slow: RunEvent[] = [
      { type: "levels", t: 0.1, levels },
      { type: "level-shown", t: 2.9, level: 2 },
      { type: "first-frame", t: 3 },
      ...switches,
      { type: "end", t: 60, reason: "complete" },
    ];
    const ideas = tryNext({
      ...input([]),
      metrics: computeMetrics(slow),
      timeline: buildTimeline(slow),
    });
    expect(titles(ideas)).toEqual([
      "Climb more carefully",
      "Start at the lowest quality",
      "See the cost of a small buffer",
    ]);
  });

  it("explores from a smooth run: a small buffer, then a harder network", () => {
    expect(titles(tryNext(input([], { curve: steady(50) })))).toEqual([
      "See the cost of a small buffer",
      "Same player, a harder network",
    ]);
  });

  it("suggests using more of the bandwidth when the run stayed low on a fast network", () => {
    const low: RunEvent[] = [{ type: "level-shown", t: 2, level: 0 }];
    expect(titles(tryNext(input(low, { curve: steady(50), networkId: "tunnel" })))).toEqual([
      "Use more of the bandwidth",
      "See the cost of a small buffer",
    ]);
  });
});

describe("ideaSearch", () => {
  const run: SavedRun = {
    format: RUN_FORMAT,
    version: RUN_VERSION,
    id: "a1b2c3d4",
    startedAt: 0,
    savedAt: 0,
    setup: {
      streamUrl: DEFAULT_STREAM.url,
      streamName: DEFAULT_STREAM.name,
      network: { id: "lift", name: "Lift", curve: steady(6) },
      player: { presetId: "defaults", name: "Defaults", settings: { abrEwmaFastVoD: 1.5 } },
    },
    player: { name: "hls.js", version: "1.7.3" },
    environment: { browser: "Chrome on macOS", playerSize: undefined },
    reason: "complete",
    events: [],
  };

  it("keeps the run's own changes and adds the idea's", () => {
    expect(
      ideaSearch(run, {
        title: "Keep more headroom",
        change: "",
        apply: { kind: "settings", settings: { abrBandWidthFactor: 0.8 } },
      }),
    ).toEqual({
      network: "lift",
      set: "abrEwmaFastVoD:1.5,abrBandWidthFactor:0.8",
      start: "now",
    });
  });

  it("swaps the player preset or the network", () => {
    expect(
      ideaSearch(run, {
        title: "",
        change: "",
        apply: { kind: "player", presetId: "low-memory-tv" },
      }),
    ).toEqual({ network: "lift", player: "low-memory-tv", start: "now" });
    expect(
      ideaSearch(run, { title: "", change: "", apply: { kind: "network", networkId: "tunnel" } }),
    ).toEqual({ set: "abrEwmaFastVoD:1.5", start: "now" });
  });
});
