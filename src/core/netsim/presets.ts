import type { CurvePoint, NetworkCurve } from "./curve";

/** A ready-made network for the Networks screen. */
export interface NetworkPreset {
  id: string;
  name: string;
  description: string;
  curve: NetworkCurve;
}

/** Mulberry32: a tiny seeded generator, so the "random" presets are the same on every visit. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const tenth = (value: number) => Math.round(value * 10) / 10;

/** A point every `every` seconds from 0 to `lengthS`, with values from `valueAt`. */
function sampled(lengthS: number, every: number, valueAt: (index: number) => number): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let index = 0; index * every <= lengthS; index++) {
    points.push({ t: index * every, mbps: valueAt(index) });
  }
  return points;
}

function cafeWifi(): CurvePoint[] {
  const random = seededRandom(0xcafe);
  return sampled(90, 1, () => tenth(2 + 6 * random()));
}

/** A bounded random walk with slopes between samples: signal strength changing as the bus moves. */
function commute(): CurvePoint[] {
  const random = seededRandom(0x4c0de);
  let mbps = 8;
  return sampled(120, 3, () => {
    mbps = Math.min(15, Math.max(1, mbps + (random() - 0.5) * 8));
    return tenth(mbps);
  });
}

function rural(): CurvePoint[] {
  const random = seededRandom(0x3a);
  return sampled(90, 2, () => tenth(0.5 + random()));
}

export const presets: readonly NetworkPreset[] = [
  {
    id: "home-fibre",
    name: "Home fibre",
    description: "50 Mbps, steady. Every quality fits; a baseline.",
    curve: { shape: "steps", rttMs: 15, lengthS: 60, points: [{ t: 0, mbps: 50 }] },
  },
  {
    id: "cafe-wifi",
    name: "Busy café Wi-Fi",
    description: "2–8 Mbps, changing every second as other people share the access point.",
    curve: { shape: "steps", rttMs: 40, lengthS: 90, points: cafeWifi() },
  },
  {
    id: "4g-commute",
    name: "4G commute",
    description: "1–15 Mbps, drifting up and down as the bus moves between cells.",
    curve: { shape: "slopes", rttMs: 60, lengthS: 120, points: commute() },
  },
  {
    id: "tunnel",
    name: "Train through a tunnel",
    description:
      "6 Mbps, then weaker in the tunnel, 12 s with no signal at all, and a climb back to 6 Mbps.",
    curve: {
      shape: "slopes",
      rttMs: 80,
      lengthS: 90,
      // Pairs of points at one time are jumps; the rest are straight lines.
      points: [
        { t: 0, mbps: 6 },
        { t: 20, mbps: 6 },
        { t: 20, mbps: 2.5 },
        { t: 30, mbps: 2.5 },
        { t: 30, mbps: 1.2 },
        { t: 42, mbps: 1.2 },
        { t: 42, mbps: 0 },
        { t: 54, mbps: 0 },
        { t: 60, mbps: 3 },
        { t: 63, mbps: 6 },
      ],
    },
  },
  {
    id: "rural-3g",
    name: "Rural 3G",
    description: "0.5–1.5 Mbps with long latency. Only the lowest qualities fit.",
    curve: { shape: "steps", rttMs: 200, lengthS: 90, points: rural() },
  },
  {
    id: "lift",
    name: "Lift",
    description: "8 Mbps, then a sudden drop to 0.2 Mbps for 15 s, then back.",
    curve: {
      shape: "steps",
      rttMs: 40,
      lengthS: 60,
      points: [
        { t: 0, mbps: 8 },
        { t: 25, mbps: 0.2 },
        { t: 40, mbps: 8 },
      ],
    },
  },
  {
    id: "evening-congestion",
    name: "Evening congestion",
    description: "A slow slide from 12 to 1.5 Mbps as the neighbourhood starts streaming.",
    curve: {
      shape: "slopes",
      rttMs: 50,
      lengthS: 120,
      points: [
        { t: 0, mbps: 12 },
        { t: 120, mbps: 1.5 },
      ],
    },
  },
];

export function presetById(id: string): NetworkPreset | undefined {
  return presets.find((preset) => preset.id === id);
}
