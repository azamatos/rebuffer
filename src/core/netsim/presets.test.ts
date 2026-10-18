import { describe, expect, it } from "vitest";
import { bandwidthAt, bitsBetween, timeToDeliver, validateCurve } from "./curve";
import { presetById, presets } from "./presets";

const mbpsOf = (id: string) => {
  const preset = presetById(id);
  if (!preset) throw new Error(`No preset ${id}`);
  return preset.curve.points.map(({ mbps }) => mbps);
};

describe("presets", () => {
  it("are the seven networks of the product spec, each a valid curve", () => {
    expect(presets.map(({ name }) => name)).toEqual([
      "Home fibre",
      "Busy café Wi-Fi",
      "4G commute",
      "Train through a tunnel",
      "Rural 3G",
      "Lift",
      "Evening congestion",
    ]);
    expect(new Set(presets.map(({ id }) => id)).size).toBe(presets.length);
    for (const preset of presets) {
      expect(validateCurve(preset.curve), preset.id).toEqual({ ok: true, curve: preset.curve });
      expect(preset.description.length, preset.id).toBeGreaterThan(0);
    }
  });

  it("keep the jittery and moving ones inside their ranges", () => {
    const cafe = mbpsOf("cafe-wifi");
    expect(Math.min(...cafe)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...cafe)).toBeLessThanOrEqual(8);
    expect(new Set(cafe).size).toBeGreaterThan(20);

    const commute = mbpsOf("4g-commute");
    expect(Math.min(...commute)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...commute)).toBeLessThanOrEqual(15);
    expect(Math.max(...commute) - Math.min(...commute)).toBeGreaterThan(5);

    const rural = mbpsOf("rural-3g");
    expect(Math.min(...rural)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...rural)).toBeLessThanOrEqual(1.5);
  });

  it("drop the lift to 0.2 Mbps and bring it back", () => {
    const lift = presetById("lift")?.curve;
    if (!lift) throw new Error("No lift preset");
    expect(bandwidthAt(lift, 10)).toBe(8_000_000);
    expect(bandwidthAt(lift, 30)).toBe(200_000);
    expect(bandwidthAt(lift, 50)).toBe(8_000_000);
  });

  it("slide the evening congestion from 12 to 1.5 Mbps", () => {
    const evening = presetById("evening-congestion")?.curve;
    if (!evening) throw new Error("No evening preset");
    expect(bandwidthAt(evening, 0)).toBe(12_000_000);
    expect(bandwidthAt(evening, 60)).toBe(6_750_000);
    expect(bandwidthAt(evening, evening.lengthS)).toBe(1_500_000);
  });
});

describe("Train through a tunnel", () => {
  const tunnel = presetById("tunnel")?.curve;
  if (!tunnel) throw new Error("No tunnel preset");

  it("has the agreed shape", () => {
    expect(tunnel.lengthS).toBe(90);
    expect(tunnel.rttMs).toBe(80);
    const at = (t: number) => bandwidthAt(tunnel, t) / 1_000_000;
    expect([at(0), at(19.9), at(20), at(29.9), at(30), at(41.9), at(42), at(53.9)]).toEqual([
      6, 6, 2.5, 2.5, 1.2, 1.2, 0, 0,
    ]);
    expect([at(54), at(57), at(60), at(61.5), at(63), at(90)]).toEqual([0, 1.5, 3, 4.5, 6, 6]);
  });

  it("carries the expected data", () => {
    expect(bitsBetween(tunnel, 0, 20)).toBe(120_000_000);
    expect(bitsBetween(tunnel, 42, 54)).toBe(0);
    expect(bitsBetween(tunnel, 54, 60)).toBe(9_000_000);
    expect(bitsBetween(tunnel, 60, 63)).toBe(13_500_000);
    expect(bitsBetween(tunnel, 0, 90)).toBeCloseTo(343_900_000, 3);
  });

  it("holds a download through the outage until the climb", () => {
    expect(timeToDeliver(tunnel, 42, 1_000_000)).toBeCloseTo(56, 12);
    expect(timeToDeliver(tunnel, 50, 9_000_000)).toBeCloseTo(60, 12);
  });
});
