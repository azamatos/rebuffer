import { describe, expect, it } from "vitest";
import type { RunMetrics } from "./metrics";
import type { NetworkCurve } from "@/core/netsim/curve";
import { computeScore, partsTotal, scoreTarget } from "./score";

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
      saved: 0,
      latency: { host: undefined, realMs: undefined, late: 0, typicalLateMs: 0, worstLateMs: 0 },
      bandwidth: { late: 0, typicalLateMs: 0, worstLateMs: 0, realBps: undefined },
      hiddenS: 0,
      lateRequests: 0,
    },
    ...overrides,
  };
}

const flat = (mbps: number, lengthS = 80): NetworkCurve => ({
  shape: "steps",
  rttMs: 0,
  lengthS,
  points: [{ t: 0, mbps }],
});

describe("scoreTarget", () => {
  it("is the ladder's top without a network", () => {
    expect(scoreTarget(metrics({})).level?.bitrate).toBe(5_000_000);
  });

  it("is the best rendition at or under the network's mean bandwidth", () => {
    // 6 Mbps for 40 s, then 0 for 40 s: a mean of 3 Mbps, so 2.8 Mbps is the best it could carry.
    const tunnel: NetworkCurve = {
      shape: "steps",
      rttMs: 0,
      lengthS: 80,
      points: [
        { t: 0, mbps: 6 },
        { t: 40, mbps: 0 },
      ],
    };
    expect(scoreTarget(metrics({}), tunnel)).toEqual({
      level: { index: 3, bitrate: 2_800_000 },
      networkBps: 3_000_000,
    });
  });

  it("is the lowest rendition when the network can't carry any", () => {
    expect(scoreTarget(metrics({}), flat(0.2)).level?.bitrate).toBe(400_000);
  });

  it("averages over the part of the network the run lasted", () => {
    const later: NetworkCurve = {
      shape: "steps",
      rttMs: 0,
      lengthS: 160,
      points: [
        { t: 0, mbps: 2 },
        { t: 80, mbps: 50 },
      ],
    };
    expect(scoreTarget(metrics({ endS: 80 }), later).level?.bitrate).toBe(1_600_000);
  });
});

describe("computeScore", () => {
  it("measures a run against what its network could carry", () => {
    // On a 3 Mbps network, playing 2.8 Mbps throughout with no stall is as good as it gets.
    const score = computeScore(
      metrics({ averageBitrate: 2_800_000, shown: [{ t: 0, level: 3 }] }),
      flat(3),
    );
    expect(score.score).toBe(100);
    expect(score.against?.bitrate).toBe(2_800_000);
    expect(score.networkBps).toBe(3_000_000);
    // Against the ladder's top it would be 56.
    expect(
      computeScore(metrics({ averageBitrate: 2_800_000, shown: [{ t: 0, level: 3 }] })).score,
    ).toBeCloseTo(56, 10);
  });

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
      against: { index: 4, bitrate: 5_000_000 },
      networkBps: undefined,
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

describe("partsTotal", () => {
  it("adds up the parts before the score is held between 0 and 100", () => {
    // A long wait for the first frame on the lowest quality: the losses outweigh the picture.
    const score = computeScore(
      metrics({ firstFrameS: 60, averageBitrate: 400_000, shown: [{ t: 60, level: 0 }] }),
      flat(0.5),
    );
    expect(score.score).toBe(0);
    expect(partsTotal(score)).toBeLessThan(0);
    expect(partsTotal(score)).toBeCloseTo(
      score.quality - score.switching - score.stalls - score.startup,
    );
  });
});
