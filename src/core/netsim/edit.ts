import { formatClock } from "@/core/format/time";
import { bandwidthAt, CURVE_LIMITS, type CurveShape, type NetworkCurve } from "./curve-math";

/**
 * The Networks screen's edits, as pure functions. Each takes a curve and returns one that is still valid (points in
 * time order, inside the length, within the limits), so the editor never holds a curve the simulator would refuse.
 */

/** The finest time step the editor uses, seconds. */
export const TIME_STEP_S = 0.1;
/** The shortest network the editor makes, seconds. */
const MIN_LENGTH_S = 1;
/** How far past the last point "Add point after" goes, seconds. */
const ADD_AFTER_S = 5;
/** Undo keeps this many steps. */
const MAX_UNDO = 200;

const roundTime = (t: number) => Math.round(t / TIME_STEP_S) / (1 / TIME_STEP_S);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Bandwidth as the editor keeps it, Mbps: hundredths below 10, tenths from 10, within the limits. */
export function roundRate(mbps: number): number {
  const value = clamp(mbps, 0, CURVE_LIMITS.maxMbps);
  return value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
}

/**
 * Whether the points are in an order the simulator accepts: each later than the one before, except that in a slopes
 * network two points may share a time (a jump), never three.
 */
export function inTimeOrder(curve: NetworkCurve): boolean {
  return curve.points.every((point, index) => {
    const previous = curve.points[index - 1];
    if (point.t < 0 || point.t > curve.lengthS) return false;
    if (!previous || point.t > previous.t) return true;
    return (
      curve.shape === "slopes" && point.t === previous.t && curve.points[index - 2]?.t !== point.t
    );
  });
}

/** The times point `index` can move between without breaking the order. */
export function timeBounds(curve: NetworkCurve, index: number): { min: number; max: number } {
  const { points, shape, lengthS } = curve;
  const point = points[index];
  if (!point) return { min: 0, max: 0 };
  const previous = points[index - 1];
  const next = points[index + 1];
  const mayShare = (neighbour: number, beyond: number) =>
    shape === "slopes" && points[beyond]?.t !== points[neighbour]?.t;
  const min = !previous
    ? 0
    : mayShare(index - 1, index - 2)
      ? previous.t
      : roundTime(previous.t + TIME_STEP_S);
  const max = !next
    ? lengthS
    : mayShare(index + 1, index + 2)
      ? next.t
      : roundTime(next.t - TIME_STEP_S);
  // Neighbours too close to move between: the point stays where it is.
  return min > max ? { min: point.t, max: point.t } : { min, max };
}

/** The curve with point `index` at `t` and `mbps`; the same curve when that changes nothing, so it isn't an undo step. */
function withPoint(curve: NetworkCurve, index: number, t: number, mbps: number): NetworkCurve {
  const point = curve.points[index];
  if (point?.t === t && point.mbps === mbps) return curve;
  return {
    ...curve,
    points: curve.points.map((point, i) => (i === index ? { t, mbps } : point)),
  };
}

/** Moves point `index` to `t`, as far as its neighbours allow. */
export function moveTime(curve: NetworkCurve, index: number, t: number): NetworkCurve {
  const point = curve.points[index];
  if (!point) return curve;
  const { min, max } = timeBounds(curve, index);
  return withPoint(curve, index, clamp(roundTime(t), min, max), point.mbps);
}

/** Sets point `index`'s bandwidth, Mbps. */
export function setRate(curve: NetworkCurve, index: number, mbps: number): NetworkCurve {
  const point = curve.points[index];
  if (!point) return curve;
  return withPoint(curve, index, point.t, roundRate(mbps));
}

/** One step up or down: 10% (from nothing up to 0.1 Mbps; from 0.1 Mbps down to nothing). */
export function stepRate(mbps: number, direction: 1 | -1): number {
  if (direction > 0) return roundRate(mbps <= 0 ? 0.1 : Math.max(mbps * 1.1, mbps + 0.01));
  return mbps <= 0.1 ? 0 : roundRate(Math.min(mbps / 1.1, mbps - 0.01));
}

/**
 * The next line of the quality ladder (bitrates in bits/s) above or below `mbps`: past the top it stays, past the
 * bottom it goes to nothing.
 */
export function ladderStep(mbps: number, ladderBps: readonly number[], direction: 1 | -1): number {
  const lines = [...new Set(ladderBps.map((bps) => roundRate(bps / 1e6)))].sort((a, b) => a - b);
  if (direction > 0) return lines.find((line) => line > mbps) ?? mbps;
  return lines.findLast((line) => line < mbps) ?? 0;
}

/** Adds a point at `t` (bandwidth in Mbps) where the order allows one; returns the curve and the new point's index. */
export function insertPoint(
  curve: NetworkCurve,
  t: number,
  mbps: number,
): { curve: NetworkCurve; index: number } | undefined {
  if (curve.points.length >= CURVE_LIMITS.maxPoints) return undefined;
  const time = clamp(roundTime(t), 0, curve.lengthS);
  const later = curve.points.findIndex((point) => point.t > time);
  const index = later < 0 ? curve.points.length : later;
  const points = [
    ...curve.points.slice(0, index),
    { t: time, mbps: roundRate(mbps) },
    ...curve.points.slice(index),
  ];
  const next = { ...curve, points };
  return inTimeOrder(next) ? { curve: next, index } : undefined;
}

/**
 * "Add point after": halfway to the next point, or a few seconds on after the last, at the bandwidth the curve has
 * there. Undefined when there's no room.
 */
export function addPointAfter(
  curve: NetworkCurve,
  index: number,
): { curve: NetworkCurve; index: number } | undefined {
  const point = curve.points[index];
  if (!point) return undefined;
  const next = curve.points[index + 1];
  const t = roundTime(
    next ? (point.t + next.t) / 2 : Math.min(point.t + ADD_AFTER_S, curve.lengthS),
  );
  if (t === point.t || (next && t === next.t)) return undefined;
  return insertPoint(curve, t, bandwidthAt(curve, t) / 1e6);
}

/** Removes point `index`; a network keeps at least one point. */
export function deletePoint(curve: NetworkCurve, index: number): NetworkCurve {
  if (curve.points.length <= 1 || !curve.points[index]) return curve;
  return { ...curve, points: curve.points.filter((_, i) => i !== index) };
}

/** Steps or slopes. Steps need a time per point, so of two points at one time (a jump) the later one stays. */
export function setShape(curve: NetworkCurve, shape: CurveShape): NetworkCurve {
  if (shape === curve.shape) return curve;
  if (shape === "slopes") return { ...curve, shape };
  const points = curve.points.filter((point, i) => curve.points[i + 1]?.t !== point.t);
  return { ...curve, shape, points };
}

/** The network's length in seconds; points past the end go, and one stays at the start if none is left. */
export function setLength(curve: NetworkCurve, lengthS: number): NetworkCurve {
  const length = clamp(roundTime(lengthS), MIN_LENGTH_S, CURVE_LIMITS.maxLengthS);
  const points = curve.points.filter((point) => point.t <= length);
  return {
    ...curve,
    lengthS: length,
    points: points.length > 0 ? points : [{ t: 0, mbps: curve.points[0]?.mbps ?? 0 }],
  };
}

/** The latency (RTT), whole milliseconds. */
export function setRtt(curve: NetworkCurve, rttMs: number): NetworkCurve {
  return { ...curve, rttMs: clamp(Math.round(rttMs), 0, CURVE_LIMITS.maxRttMs) };
}

export type PlaceResult = { ok: true; curve: NetworkCurve } | { ok: false; error: string };

/** Point `index` at a time and bandwidth someone typed; says what's wrong instead of moving it elsewhere. */
export function placePoint(
  curve: NetworkCurve,
  index: number,
  t: number,
  mbps: number,
): PlaceResult {
  const { min, max } = timeBounds(curve, index);
  if (t < min || t > max) {
    return {
      ok: false,
      error:
        min === max
          ? `This point can't move: its neighbours are at ${formatClock(min, 1)}.`
          : `Time must be from ${formatClock(min, 1)} to ${formatClock(max, 1)}, between this point's neighbours.`,
    };
  }
  if (!(mbps >= 0 && mbps <= CURVE_LIMITS.maxMbps)) {
    return { ok: false, error: `Bandwidth must be from 0 to ${CURVE_LIMITS.maxMbps} Mbps.` };
  }
  return { ok: true, curve: withPoint(curve, index, roundTime(t), roundRate(mbps)) };
}

/** "Point 4 of 8: 0:42, 0 Mbps", for the editor's live region and its description. */
export function describePoint(curve: NetworkCurve, index: number): string {
  const point = curve.points[index];
  if (!point) return "";
  return `Point ${index + 1} of ${curve.points.length}: ${formatClock(point.t, point.t % 1 === 0 ? 0 : 1)}, ${point.mbps} Mbps`;
}

/** Undo and redo over whole curves. */
export interface History {
  past: readonly NetworkCurve[];
  present: NetworkCurve;
  future: readonly NetworkCurve[];
}

export const startHistory = (curve: NetworkCurve): History => ({
  past: [],
  present: curve,
  future: [],
});

/** Makes `next` the present; an edit that changed nothing isn't a step. */
export function record(history: History, next: NetworkCurve): History {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-MAX_UNDO),
    present: next,
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
