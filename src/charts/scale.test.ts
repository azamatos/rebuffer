import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve";
import type { Level } from "@/core/run/events";
import {
  axisMbps,
  bandwidthDomain,
  bufferTop,
  linearScale,
  logScale,
  ladderAxis,
  qualityShade,
  spreadLabels,
  timeTicks,
} from "./scale";

const curve = (mbps: number[]): NetworkCurve => ({
  shape: "steps",
  rttMs: 0,
  lengthS: 90,
  points: mbps.map((value, i) => ({ t: i * 10, mbps: value })),
});

const ladder = (...bitrates: number[]): Level[] =>
  bitrates.map((bitrate, index) => ({ index, bitrate }));

describe("linearScale", () => {
  it("maps the domain onto the range, either way round", () => {
    const x = linearScale([0, 90], [0, 900]);
    expect(x(45)).toBe(450);
    const y = linearScale([0, 30], [100, 0]);
    expect(y(0)).toBe(100);
    expect(y(15)).toBe(50);
  });
});

describe("logScale", () => {
  it("spaces decades evenly and pins values outside the domain to its edges", () => {
    const y = logScale([1e5, 1e7], [200, 0]);
    expect(y(1e6)).toBeCloseTo(100);
    expect(y(0)).toBe(200);
    expect(y(1e9)).toBe(0);
  });
});

describe("bandwidthDomain", () => {
  it("leaves room above the peak and below the lowest rate that matters", () => {
    expect(bandwidthDomain(curve([6, 0, 3]), ladder(470_000, 6_000_000))).toEqual([
      235_000, 7_800_000,
    ]);
  });

  it("keeps at least a decade and a floor", () => {
    expect(bandwidthDomain(curve([4]), [])).toEqual([520_000, 5_200_000]);
    expect(bandwidthDomain(curve([0]), [])).toEqual([10_000, 10_000_000]);
    expect(bandwidthDomain(curve([0.001, 1]), [])[0]).toBe(10_000);
  });
});

describe("timeTicks", () => {
  it("picks a round step that leaves room between labels", () => {
    expect(timeTicks(0, 90, 900)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(timeTicks(0, 90, 300)).toEqual([0, 30, 60, 90]);
    expect(timeTicks(0, 600, 900)).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600]);
    expect(timeTicks(0, 0, 900)).toEqual([0]);
  });

  it("starts a zoomed axis at the first round time in view", () => {
    expect(timeTicks(42, 54, 900)).toEqual([42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54]);
    expect(timeTicks(37.4, 58.6, 600)).toEqual([40, 45, 50, 55]);
    expect(timeTicks(30, 30, 600)).toEqual([30]);
  });
});

describe("bufferTop", () => {
  it("rounds up to a readable top with some room", () => {
    expect(bufferTop(0)).toBe(10);
    expect(bufferTop(9)).toBe(10);
    expect(bufferTop(10)).toBe(20);
    expect(bufferTop(73)).toBe(90);
    expect(bufferTop(700)).toBe(900);
  });
});

describe("qualityShade", () => {
  it("spreads the ladder over the shades by bitrate, lowest darkest", () => {
    const five = ladder(400e3, 800e3, 1.6e6, 2.8e6, 5e6);
    expect(five.map((level) => qualityShade(five, level.index))).toEqual([0, 1, 2, 3, 4]);
    const three = ladder(5e6, 400e3, 1.6e6);
    expect(three.map((level) => qualityShade(three, level.index))).toEqual([4, 0, 2]);
    expect(qualityShade(ladder(1e6), 0)).toBe(4);
    expect(qualityShade(five, 9)).toBe(0);
  });
});

describe("spreadLabels", () => {
  it("drops a label that would crowd one kept before it", () => {
    const kept = spreadLabels(
      [
        { y: 10, text: "1080p 6.0" },
        { y: 20, text: "10 Mbps" },
        { y: 40, text: "720p 3.3" },
      ],
      14,
    );
    expect(kept.map((label) => label.text)).toEqual(["1080p 6.0", "720p 3.3"]);
  });
});

describe("axisMbps", () => {
  it("keeps two significant digits below 10 Mbps", () => {
    expect(axisMbps(6_000_000)).toBe("6.0");
    expect(axisMbps(470_000)).toBe("0.47");
    expect(axisMbps(50_000_000)).toBe("50");
  });
});

describe("ladderAxis", () => {
  // Apple's advanced example: 100 variants from 0.4 to 40 Mbps, many a few kbps apart.
  const big = Array.from({ length: 100 }, (_, index) => ({
    index,
    bitrate: 400_000 * 100 ** (index / 99),
    name: `${String(270 + index * 19)}p`,
  }));
  const y = logScale([100_000, 50_000_000], [200, 0]);

  it("draws a line only for the qualities that kept their label", () => {
    const { labels, lines } = ladderAxis(big, y, [100_000, 50_000_000], 14);
    expect(lines.length).toBeLessThan(16);
    expect(lines.length).toBeGreaterThan(5);
    for (const at of lines) expect(labels.some((label) => label.y === at)).toBe(true);
    const sorted = [...lines].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++)
      expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeGreaterThanOrEqual(14);
  });

  it("keeps every quality of a small ladder, with its name when it fits", () => {
    const small = [
      { index: 0, bitrate: 600_000, name: "240p" },
      { index: 1, bitrate: 6_000_000, name: "1080p" },
    ];
    const { labels, lines } = ladderAxis(
      small,
      y,
      [100_000, 50_000_000],
      14,
      (text) => !text.startsWith("1080p"),
    );
    expect(lines).toHaveLength(2);
    expect(labels.map((label) => label.text)).toContain("240p 0.60");
    expect(labels.map((label) => label.text)).toContain("6.0");
  });
});
