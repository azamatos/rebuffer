import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { editorDomain, editorLayout, nearestPoint, pointRadius } from "./editor";

const curve: NetworkCurve = {
  shape: "steps",
  rttMs: 50,
  lengthS: 90,
  points: [
    { t: 0, mbps: 6 },
    { t: 45, mbps: 0.5 },
    { t: 60, mbps: 0 },
  ],
};
const ladder = [
  { name: "240p", bitrate: 469_484 },
  { name: "1080p", bitrate: 5_991_394 },
];

describe("editorDomain", () => {
  it("runs from 50 kbps to a margin over the curve, the ladder and 10 Mbps, and never shrinks while editing", () => {
    expect(editorDomain(curve, ladder)).toEqual([50_000, 13e6]);
    expect(editorDomain({ ...curve, points: [{ t: 0, mbps: 50 }] }, ladder)).toEqual([
      50_000, 65e6,
    ]);
    expect(editorDomain(curve, ladder, [50_000, 65e6])).toEqual([50_000, 65e6]);
  });
});

describe("editorLayout", () => {
  const layout = editorLayout(984, 250, 90, [50_000, 13e6]);

  it("turns pixels back into time and bandwidth", () => {
    expect(layout.plotRight).toBe(900);
    expect(layout.time(450)).toBe(45);
    expect(layout.time(-20)).toBe(0);
    expect(layout.time(2000)).toBe(90);
    expect(layout.rate(layout.y(2e6))).toBeCloseTo(2, 6);
    expect(layout.rate(layout.bottom)).toBe(0);
  });

  it("finds the point under the pointer, if one is near", () => {
    expect(nearestPoint(layout, curve, layout.x(45) + 3, layout.y(0.5e6) - 4)).toBe(1);
    expect(nearestPoint(layout, curve, layout.x(60), layout.bottom)).toBe(2);
    expect(nearestPoint(layout, curve, layout.x(30), layout.y(3e6))).toBeUndefined();
  });

  it("draws points smaller when they crowd", () => {
    expect(pointRadius(layout, 3)).toBe(5);
    expect(pointRadius(layout, 91)).toBeCloseTo(3.3, 1);
    expect(pointRadius(layout, 1000)).toBe(2.5);
  });
});
