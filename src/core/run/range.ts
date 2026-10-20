import { formatClock } from "@/core/format/time";

/**
 * The stretch of a run the Report's charts show, in run seconds. Zoom keeps it inside the network's length and at
 * least `MIN_SPAN_S` wide, so a view always holds a whole segment of our film.
 */
export interface TimeRange {
  from: number;
  to: number;
}

/** The narrowest view, seconds: one segment of our film. */
export const MIN_SPAN_S = 4;

/** Room either side of a note when the charts zoom to it, seconds (a quarter of the note when that's more). */
const NOTE_PAD_S = 5;

export const wholeRange = (lengthS: number): TimeRange => ({ from: 0, to: lengthS });

/** Whether `range` shows all of `lengthS`. */
export function isWhole(range: TimeRange, lengthS: number): boolean {
  return range.from <= 1e-6 && range.to >= lengthS - 1e-6;
}

/**
 * `range` made valid: widened around its middle to `MIN_SPAN_S` (or all of `lengthS`, if that's shorter), then moved
 * inside 0…`lengthS` without changing its width.
 */
export function fitRange(range: TimeRange, lengthS: number): TimeRange {
  const length = Math.max(0, lengthS);
  const span = Math.min(length, Math.max(MIN_SPAN_S, range.to - range.from));
  const middle = (range.from + range.to) / 2;
  const from = Math.min(Math.max(0, middle - span / 2), length - span);
  return { from, to: from + span };
}

/** Zooms around the middle of `range`: a `factor` of 0.5 shows half as much, 2 twice as much. */
export function zoomRange(range: TimeRange, factor: number, lengthS: number): TimeRange {
  const middle = (range.from + range.to) / 2;
  const half = ((range.to - range.from) * factor) / 2;
  return fitRange({ from: middle - half, to: middle + half }, lengthS);
}

/** Moves `range` by `share` of its width: −0.5 is half a view earlier, 0.5 half a view later. */
export function panRange(range: TimeRange, share: number, lengthS: number): TimeRange {
  const shift = (range.to - range.from) * share;
  return fitRange({ from: range.from + shift, to: range.to + shift }, lengthS);
}

/** The view for a note from `start` to `end`: the note with room either side. */
export function noteRange(start: number, end: number, lengthS: number): TimeRange {
  const pad = Math.max(NOTE_PAD_S, (end - start) / 4);
  return fitRange({ from: start - pad, to: end + pad }, lengthS);
}

/**
 * The range a drag picks: from `x0` to `x1`, in pixels along a plot `widthPx` wide that shows `view`. Pixels outside
 * the plot count as its edges.
 */
export function rangeFromDrag(
  view: TimeRange,
  x0: number,
  x1: number,
  widthPx: number,
  lengthS: number,
): TimeRange {
  if (!(widthPx > 0)) return view;
  const at = (x: number) =>
    view.from + (Math.min(Math.max(x, 0), widthPx) / widthPx) * (view.to - view.from);
  const [a, b] = [at(x0), at(x1)];
  return fitRange({ from: Math.min(a, b), to: Math.max(a, b) }, lengthS);
}

/** "Showing 0:42–0:54 of 1:30", or "Showing all 1:30". */
export function describeRange(range: TimeRange, lengthS: number): string {
  return isWhole(range, lengthS)
    ? `Showing all ${formatClock(lengthS)}`
    : `Showing ${formatClock(range.from)}–${formatClock(range.to)} of ${formatClock(lengthS)}`;
}
