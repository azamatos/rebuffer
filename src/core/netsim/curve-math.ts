/**
 * The network curve and its maths, with no dependencies, so any screen can draw a curve without loading the
 * validation in curve.ts.
 */

/** One point of a network curve: from `t` seconds on, the link carries `mbps` megabits per second. */
export interface CurvePoint {
  t: number;
  mbps: number;
}

/**
 * How bandwidth moves between points. "steps": each point holds until the next one.
 * "slopes": a straight line from point to point; two points at the same time make a jump.
 */
export type CurveShape = "steps" | "slopes";

/** A network: bandwidth over time plus latency. Times in seconds, bandwidth in Mbps. */
export interface NetworkCurve {
  points: readonly CurvePoint[];
  shape: CurveShape;
  rttMs: number;
  lengthS: number;
}

export const CURVE_LIMITS = {
  maxPoints: 10_000,
  maxMbps: 1_000,
  maxRttMs: 5_000,
  maxLengthS: 3_600,
} as const;

const BITS_PER_MEGABIT = 1_000_000;

/** A stretch of the curve where bandwidth is a straight line from `from` to `to` (bits/s). */
interface Segment {
  start: number;
  end: number;
  from: number;
  to: number;
}

/** Index of the last point at or before `t`, or -1 if `t` is before the first point. */
function lastPointAtOrBefore(points: readonly CurvePoint[], t: number): number {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((points[middle]?.t ?? Infinity) <= t) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function pointAt(points: readonly CurvePoint[], index: number): CurvePoint {
  const point = points[index];
  if (!point) throw new RangeError("A network needs at least one point.");
  return point;
}

/** The segment that contains `t`; segments are closed at the start and open at the end. */
function segmentAt(curve: NetworkCurve, t: number): Segment {
  const { points } = curve;
  const first = pointAt(points, 0);
  const index = lastPointAtOrBefore(points, t);
  if (index < 0) {
    const rate = first.mbps * BITS_PER_MEGABIT;
    return { start: -Infinity, end: first.t, from: rate, to: rate };
  }
  const point = pointAt(points, index);
  const next = points[index + 1];
  const from = point.mbps * BITS_PER_MEGABIT;
  if (!next) return { start: point.t, end: Infinity, from, to: from };
  const to = curve.shape === "slopes" ? next.mbps * BITS_PER_MEGABIT : from;
  return { start: point.t, end: next.t, from, to };
}

function rateIn(segment: Segment, t: number): number {
  if (segment.from === segment.to) return segment.from;
  const share = (t - segment.start) / (segment.end - segment.start);
  return segment.from + (segment.to - segment.from) * share;
}

/** Bandwidth at time `t`, in bits per second. Holds the first value before the first point and the last after the last. */
export function bandwidthAt(curve: NetworkCurve, t: number): number {
  return rateIn(segmentAt(curve, t), t);
}

/** A corner of the curve as it's drawn: bandwidth in bits per second at time `t`. */
export interface CurveCorner {
  t: number;
  bps: number;
}

/**
 * The curve between `from` and `to` as corners joined by straight lines, for drawing and for its range. A step or
 * a jump is two corners at the same time. Empty when `to` isn't after `from`.
 */
export function curveOutline(curve: NetworkCurve, from: number, to: number): CurveCorner[] {
  if (!(to > from)) return [];
  const outline: CurveCorner[] = [{ t: from, bps: bandwidthAt(curve, from) }];
  let current = outline[0]?.bps ?? 0;
  for (const point of curve.points) {
    if (point.t <= from || point.t >= to) continue;
    if (curve.shape === "steps") outline.push({ t: point.t, bps: current });
    current = point.mbps * BITS_PER_MEGABIT;
    outline.push({ t: point.t, bps: current });
  }
  // The value just before `to`: a jump exactly at `to` hasn't happened yet.
  const arriving = curve.points.find((point) => point.t === to);
  const end =
    curve.shape === "steps"
      ? current
      : arriving
        ? arriving.mbps * BITS_PER_MEGABIT
        : bandwidthAt(curve, to);
  outline.push({ t: to, bps: end });
  return outline;
}

/** Bits the link carries between `t0` and `t1` (the exact integral of the curve). */
export function bitsBetween(curve: NetworkCurve, t0: number, t1: number): number {
  let total = 0;
  let t = t0;
  while (t < t1) {
    const segment = segmentAt(curve, t);
    const end = Math.min(segment.end, t1);
    total += ((rateIn(segment, t) + rateIn(segment, end)) / 2) * (end - t);
    t = end;
  }
  return total;
}

/** Seconds between `t0` and `t1` during which the link carries anything (bandwidth above zero). */
export function upTimeBetween(curve: NetworkCurve, t0: number, t1: number): number {
  let total = 0;
  let t = t0;
  while (t < t1) {
    const segment = segmentAt(curve, t);
    const end = Math.min(segment.end, t1);
    if (segment.from > 0 || segment.to > 0) total += end - t;
    t = end;
  }
  return total;
}

/**
 * The time at which `bits` have gone through the link, starting at `from`: the inverse of
 * `bitsBetween`. Returns `Infinity` if the curve ends at zero before they all get through.
 */
export function timeToDeliver(curve: NetworkCurve, from: number, bits: number): number {
  if (bits <= 0) return from;
  let remaining = bits;
  let t = from;
  for (;;) {
    const segment = segmentAt(curve, t);
    const rate = rateIn(segment, t);
    if (segment.end === Infinity) return rate > 0 ? t + remaining / rate : Infinity;

    const duration = segment.end - t;
    const available = ((rate + segment.to) / 2) * duration;
    // Float sums can fall a hair short of an exact match; don't spill that hair into an outage.
    if (remaining - available <= 1e-9 * Math.max(1, remaining)) {
      const slope = (segment.to - segment.from) / (segment.end - segment.start);
      // Solves rate·d + slope·d²/2 = remaining in a form that stays stable when slope is 0 or negative.
      const root = Math.sqrt(Math.max(0, rate * rate + 2 * slope * remaining));
      const d = rate + root > 0 ? (2 * remaining) / (rate + root) : duration;
      return t + Math.min(d, duration);
    }
    remaining -= available;
    t = segment.end;
  }
}
