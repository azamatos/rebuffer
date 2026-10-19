import { describe, expect, it } from "vitest";
import type { RunMetrics } from "./metrics";
import { computeScore } from "./score";

const ladder = [
  { index: 0, bitrate: 400_000 },
  { index: 1, bitrate: 800_000 },
  { index: 2, bitrate: 1_600_000 },
  { index: 3, bitrate: 2_800_000 },
  { index: 4, bitrate: 5_000_000 },
];

function metrics(overrides: Partial<RunMetrics>): RunMetrics {
  return {
    firstFrameS: 0,
    stalls: { count: 0, totalS: 0, intervals: [] },
    playS: 80,
    rebufferRatio: 0,
    averageBitrate: 5_000_000,
    switches: { up: 0, down: 0, total: 0 },
    topQualityShare: 1,
    wastedBytes: 0,
    downloadedBytes: 0,
    endS: 80,
    levels: ladder,
    shown: [{ t: 0, level: 4 }],
    segmentS: 4,
    honesty: {
      requests: 0,
      latency: { host: undefined, realMs: undefined, late: 0, typicalLateMs: 0, worstLateMs: 0 },
      bandwidth: { late: 0, typicalLateMs: 0, worstLateMs: 0, realBps: undefined },
      hiddenS: 0,
    },
    ...overrides,
  };
}

describe("computeScore", () => {
  it("gives a perfect run 100", () => {
    expect(computeScore(metrics({})).score).toBe(100);
  });

  it("scores quality as the share of the top bitrate", () => {
    const score = computeScore(metrics({ averageBitrate: 2_500_000, shown: [{ t: 0, level: 3 }] }));
    expect(score.quality).toBeCloseTo(50, 10);
    expect(score.score).toBeCloseTo(50, 10);
  });

  it("charges each switch the size of the jump in Mbps", () => {
    // 80 s of 4 s segments at 5 Mbps: a perfect run earns 20 × 5 = 100 Mbps-segments.
    const score = computeScore(
      metrics({
        shown: [
          { t: 0, level: 4 },
          { t: 20, level: 2 },
          { t: 40, level: 4 },
        ],
      }),
    );
    expect(score.switching).toBeCloseTo(((3.4 + 3.4) / 100) * 100, 10);
  });

  it("charges a second of stall or startup as much as a segment at the top quality", () => {
    const score = computeScore(
      metrics({ firstFrameS: 2, stalls: { count: 1, totalS: 3, intervals: [] } }),
    );
    expect(score.stalls).toBeCloseTo(15, 10);
    expect(score.startup).toBeCloseTo(10, 10);
    expect(score.score).toBeCloseTo(75, 10);
  });

  it("matches the tunnel run worked out by hand", () => {
    const playS = 90 - 1.42 - 3.4;
    const score = computeScore(
      metrics({
        firstFrameS: 1.42,
        stalls: { count: 1, totalS: 3.4, intervals: [] },
        playS,
        averageBitrate: (251.968 / playS) * 1e6,
        shown: [2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4].map((level, i) => ({ t: i, level })),
      }),
    );
    const ideal = (playS / 4) * 5;
    expect(score.quality).toBeCloseTo((100 * 251.968) / playS / 5, 6);
    expect(score.switching).toBeCloseTo((100 * 12.6) / ideal, 6);
    expect(score.stalls).toBeCloseTo((100 * 5 * 3.4) / ideal, 6);
    expect(score.startup).toBeCloseTo((100 * 5 * 1.42) / ideal, 6);
    expect(score.score).toBeCloseTo(24.69, 2);
  });

  it("never goes below zero", () => {
    const score = computeScore(
      metrics({ averageBitrate: 400_000, stalls: { count: 3, totalS: 40, intervals: [] } }),
    );
    expect(score.score).toBe(0);
  });

  it("returns zero when nothing played", () => {
    expect(computeScore(metrics({ playS: 0 }))).toEqual({
      score: 0,
      quality: 0,
      switching: 0,
      stalls: 0,
      startup: 0,
    });
  });

  it("assumes 6 s segments when none were downloaded", () => {
    const withDefault = computeScore(
      metrics({ segmentS: undefined, stalls: { count: 1, totalS: 6, intervals: [] } }),
    );
    // 80 s / 6 s = 13.33 segments × 5 Mbps; a 6 s stall costs 30 → 22.5 points.
    expect(withDefault.stalls).toBeCloseTo((30 / ((80 / 6) * 5)) * 100, 10);
  });
});
