import { describe, expect, it } from "vitest";
import {
  bandwidthAt,
  bitsBetween,
  curveFromJson,
  curveToJson,
  timeToDeliver,
  upTimeBetween,
  validateCurve,
  type NetworkCurve,
} from "./curve";

const steps = (points: [number, number][], lengthS = 100): NetworkCurve => ({
  shape: "steps",
  rttMs: 0,
  lengthS,
  points: points.map(([t, mbps]) => ({ t, mbps })),
});

const slopes = (points: [number, number][], lengthS = 100): NetworkCurve => ({
  ...steps(points, lengthS),
  shape: "slopes",
});

describe("bandwidthAt", () => {
  it("holds each step until the next point", () => {
    const curve = steps([
      [0, 4],
      [10, 2],
      [20, 0],
    ]);
    expect(bandwidthAt(curve, 0)).toBe(4_000_000);
    expect(bandwidthAt(curve, 9.99)).toBe(4_000_000);
    expect(bandwidthAt(curve, 10)).toBe(2_000_000);
    expect(bandwidthAt(curve, 25)).toBe(0);
  });

  it("uses the first value before the first point and the last after the last", () => {
    const curve = steps([
      [5, 3],
      [10, 1],
    ]);
    expect(bandwidthAt(curve, 0)).toBe(3_000_000);
    expect(bandwidthAt(curve, 1000)).toBe(1_000_000);
  });

  it("draws straight lines between points on a slopes curve", () => {
    const curve = slopes([
      [0, 0],
      [10, 10],
    ]);
    expect(bandwidthAt(curve, 2.5)).toBe(2_500_000);
    expect(bandwidthAt(curve, 5)).toBe(5_000_000);
    expect(bandwidthAt(curve, 15)).toBe(10_000_000);
  });

  it("jumps where two points share a time", () => {
    const curve = slopes([
      [0, 6],
      [20, 6],
      [20, 2.5],
      [30, 2.5],
    ]);
    expect(bandwidthAt(curve, 19.5)).toBe(6_000_000);
    expect(bandwidthAt(curve, 20)).toBe(2_500_000);
  });
});

describe("bitsBetween", () => {
  it("integrates steps exactly", () => {
    const curve = steps([
      [0, 4],
      [10, 2],
    ]);
    expect(bitsBetween(curve, 0, 1)).toBe(4_000_000);
    expect(bitsBetween(curve, 5, 15)).toBe(30_000_000);
  });

  it("integrates slopes exactly", () => {
    const curve = slopes([
      [0, 0],
      [10, 10],
    ]);
    expect(bitsBetween(curve, 0, 10)).toBe(50_000_000);
    expect(bitsBetween(curve, 2, 4)).toBe(6_000_000);
    expect(bitsBetween(curve, 5, 15)).toBe(87_500_000);
  });

  it("is zero for an empty or reversed interval", () => {
    const curve = steps([[0, 4]]);
    expect(bitsBetween(curve, 3, 3)).toBe(0);
    expect(bitsBetween(curve, 3, 1)).toBe(0);
  });
});

describe("timeToDeliver", () => {
  it("inverts a steady link", () => {
    expect(timeToDeliver(steps([[0, 4]]), 1, 8_000_000)).toBe(3);
  });

  it("crosses steps", () => {
    const curve = steps([
      [0, 4],
      [10, 2],
    ]);
    expect(timeToDeliver(curve, 5, 30_000_000)).toBe(15);
  });

  it("solves rising and falling slopes", () => {
    const rising = slopes([
      [0, 0],
      [10, 10],
    ]);
    expect(timeToDeliver(rising, 0, 12_500_000)).toBeCloseTo(5, 12);
    expect(timeToDeliver(rising, 0, 50_000_000)).toBeCloseTo(10, 12);

    const falling = slopes([
      [0, 10],
      [10, 0],
    ]);
    expect(timeToDeliver(falling, 0, 37_500_000)).toBeCloseTo(5, 12);
  });

  it("returns the start time for nothing to deliver", () => {
    expect(timeToDeliver(steps([[0, 0]]), 7, 0)).toBe(7);
  });

  it("returns Infinity when the curve ends in an outage", () => {
    const curve = steps([
      [0, 4],
      [10, 0],
    ]);
    expect(timeToDeliver(curve, 5, 20_000_000)).toBe(10);
    expect(timeToDeliver(curve, 5, 20_000_001)).toBe(Infinity);

    const fading = slopes([
      [0, 4],
      [10, 0],
    ]);
    expect(timeToDeliver(fading, 0, 20_000_000)).toBeCloseTo(10, 9);
    expect(timeToDeliver(fading, 0, 21_000_000)).toBe(Infinity);
  });

  it("waits out an outage in the middle", () => {
    const curve = steps([
      [0, 8],
      [1, 0],
      [3, 8],
    ]);
    expect(timeToDeliver(curve, 0.5, 8_000_000)).toBe(3.5);
  });

  it("is the inverse of bitsBetween", () => {
    const curve = slopes([
      [0, 3],
      [7, 9],
      [7, 1],
      [12, 0],
      [15, 0],
      [20, 5],
    ]);
    for (const [from, bits] of [
      [0, 1_000],
      [2, 20_000_000],
      [6.5, 9_000_000],
      [11, 3_000_000],
      [14, 10_000_000],
    ] as const) {
      const at = timeToDeliver(curve, from, bits);
      expect(bitsBetween(curve, from, at)).toBeCloseTo(bits, 3);
    }
  });
});

describe("upTimeBetween", () => {
  it("counts only the time with bandwidth", () => {
    const curve = slopes([
      [0, 2],
      [10, 2],
      [10, 0],
      [20, 0],
      [25, 5],
    ]);
    expect(upTimeBetween(curve, 5, 30)).toBe(15);
    expect(upTimeBetween(curve, 12, 18)).toBe(0);
  });
});

describe("validateCurve", () => {
  it("accepts a valid curve", () => {
    const curve = steps([
      [0, 4],
      [10, 2],
    ]);
    expect(validateCurve(curve)).toEqual({ ok: true, curve });
  });

  it("explains field errors per point", () => {
    expect(
      validateCurve({
        shape: "steps",
        rttMs: 50,
        lengthS: 60,
        points: [{ t: 0, mbps: 4 }, { t: -1, mbps: 2 }, { t: 5, mbps: 2000 }, { t: 6 }],
      }),
    ).toEqual({
      ok: false,
      errors: [
        "Point 2: time can't be negative.",
        "Point 3: bandwidth can't be above 1000 Mbps.",
        "Point 4: needs a bandwidth in Mbps.",
      ],
    });
  });

  it("explains missing and wrong fields", () => {
    expect(validateCurve({ shape: "zigzag", points: [] })).toEqual({
      ok: false,
      errors: [
        "A network needs at least one point.",
        'The shape must be "steps" or "slopes".',
        "A network needs a latency (rttMs).",
        "A network needs a length in seconds (lengthS).",
      ],
    });
    expect(validateCurve("fast")).toEqual({
      ok: false,
      errors: ["A network must be an object with points, shape, rttMs and lengthS."],
    });
  });

  it("checks time order, jumps and the length", () => {
    expect(
      validateCurve(
        steps(
          [
            [0, 1],
            [10, 2],
            [5, 3],
            [5, 4],
            [70, 1],
          ],
          60,
        ),
      ),
    ).toEqual({
      ok: false,
      errors: [
        "Point 3 (5 s) comes before point 2 (10 s); points must be in time order.",
        "Points 3 and 4 are both at 5 s; in a steps network each point needs its own time.",
        "Point 5 is at 70 s, after the end of the network (60 s).",
      ],
    });
    expect(
      validateCurve(
        slopes([
          [0, 1],
          [5, 2],
          [5, 3],
          [5, 4],
        ]),
      ),
    ).toEqual({
      ok: false,
      errors: ["Points 2, 3 and 4 are all at 5 s; only two points can share a time (a jump)."],
    });
  });
});

describe("curve JSON", () => {
  const curve: NetworkCurve = {
    shape: "slopes",
    rttMs: 80,
    lengthS: 30,
    points: [
      { t: 0, mbps: 6 },
      { t: 20, mbps: 0.5 },
    ],
  };

  it("round-trips", () => {
    const json = curveToJson(curve);
    expect(JSON.parse(json)).toMatchObject({ format: "rebuffer-network", version: 1 });
    expect(curveFromJson(json)).toEqual({ ok: true, curve });
  });

  it("accepts a bare curve without the file header", () => {
    expect(curveFromJson(JSON.stringify(curve))).toEqual({ ok: true, curve });
  });

  it("explains broken files", () => {
    expect(curveFromJson("{")).toEqual({ ok: false, errors: ["This isn't valid JSON."] });
    expect(curveFromJson(JSON.stringify({ ...curve, format: "har" }))).toEqual({
      ok: false,
      errors: ['This file isn\'t a Rebuffer network (its format is "har").'],
    });
    expect(curveFromJson(JSON.stringify({ ...curve, version: 2 }))).toEqual({
      ok: false,
      errors: ["This network file is version 2; Rebuffer reads version 1."],
    });
  });
});
