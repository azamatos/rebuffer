import type { NetworkCurve } from "@/core/netsim/curve";
import type { Level } from "@/core/run/events";

/**
 * Pure helpers behind the run charts: scales, ticks and label placement. No DOM here, so they're unit-tested.
 */

/** Maps a value to a position in pixels. */
export type Scale = (value: number) => number;

export function linearScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): Scale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (value) => r0 + (value - d0) * k;
}

/** A log scale that pins values below the domain to its bottom and above it to its top (zero included). */
export function logScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): Scale {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  const k = l1 === l0 ? 0 : (r1 - r0) / (l1 - l0);
  return (value) => r0 + (Math.log10(Math.min(Math.max(value, d0), d1)) - l0) * k;
}

const MIN_BOTTOM_BPS = 10_000;

/**
 * The bandwidth chart's range in bits per second: from half the lowest rate that matters (a positive network rate
 * or the lowest quality) to a margin above the highest (the network's peak or the top quality). An outage sits on
 * the bottom edge.
 */
export function bandwidthDomain(curve: NetworkCurve, levels: readonly Level[]): [number, number] {
  const rates = [
    ...curve.points.map((point) => point.mbps * 1e6),
    ...levels.map((level) => level.bitrate),
  ].filter((bps) => bps > 0);
  if (rates.length === 0) return [MIN_BOTTOM_BPS, 10e6];
  const top = Math.max(...rates) * 1.3;
  const bottom = Math.max(MIN_BOTTOM_BPS, Math.min(...rates) / 2);
  return [Math.min(bottom, top / 10), top];
}

/** Round time steps for axis labels, seconds. */
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];

/** Times for axis labels from 0 to `lengthS`, at a round step that leaves `minGapPx` between labels. */
export function timeTicks(lengthS: number, widthPx: number, minGapPx = 72): number[] {
  if (!(lengthS > 0) || !(widthPx > 0)) return [0];
  const perSecond = widthPx / lengthS;
  const step = TIME_STEPS.find((candidate) => candidate * perSecond >= minGapPx) ?? 3600;
  const ticks: number[] = [];
  for (let t = 0; t <= lengthS + 1e-9; t += step) ticks.push(t);
  return ticks;
}

const BUFFER_TOPS = [10, 20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600];

/** The buffer chart's top in seconds: a round value with some room above `mostS`. */
export function bufferTop(mostS: number): number {
  const wanted = mostS * 1.05;
  return BUFFER_TOPS.find((top) => top >= wanted) ?? Math.ceil(wanted / 300) * 300;
}

/**
 * Which of `shades` colours (lowest quality first) a level gets: its rank by bitrate spread over the shades, so the
 * lowest level is always the darkest and the top one the lightest, however many levels there are.
 */
export function qualityShade(levels: readonly Level[], index: number, shades = 5): number {
  const ranked = [...levels].sort((a, b) => a.bitrate - b.bitrate);
  const rank = ranked.findIndex((level) => level.index === index);
  if (rank < 0) return 0;
  if (ranked.length === 1) return shades - 1;
  return Math.round((rank * (shades - 1)) / (ranked.length - 1));
}

export interface AxisLabel {
  y: number;
  text: string;
}

/**
 * Keeps the labels that fit: earlier labels in `labels` win, and a later one is dropped when it would sit within
 * `minGapPx` of one already kept. Returns them in the order kept.
 */
export function spreadLabels(labels: readonly AxisLabel[], minGapPx: number): AxisLabel[] {
  const kept: AxisLabel[] = [];
  for (const label of labels) {
    if (kept.every((other) => Math.abs(other.y - label.y) >= minGapPx)) kept.push(label);
  }
  return kept;
}

/** A bitrate for the axis: "6.0", "0.47" (Mbps, two significant digits below 10). */
export function axisMbps(bps: number): string {
  const mbps = bps / 1e6;
  if (mbps >= 10) return mbps.toFixed(0);
  if (mbps >= 1) return mbps.toFixed(1);
  return mbps.toFixed(2);
}
