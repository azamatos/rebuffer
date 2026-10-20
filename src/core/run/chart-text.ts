import { formatClock, formatDuration } from "@/core/format/time";
import { bandwidthAt, curveOutline, type NetworkCurve } from "@/core/netsim/curve";
import { formatMbps, levelLabel } from "./describe";
import { isWhole, wholeRange, type TimeRange } from "./range";
import type { Download, Timeline } from "./timeline";

/**
 * The charts' text alternatives (AGENTS.md rule 4): a sentence per chart and the rows of its data table. `untilS` is
 * how far the run has got; while it runs the sentences speak of "now", at the end of the whole run. A finished run's
 * charts can be zoomed (the Report): with a `range` that isn't the whole run, they speak of that stretch only.
 */

/** Like `formatMbps`, but nothing reads "0 Mbps". */
export const formatRate = (bps: number) => (bps <= 0 ? "0 Mbps" : formatMbps(bps));

/** Index of the last time at or before `t` in sorted `times`, or -1. */
function lastIndexAtOrBefore(times: readonly number[], t: number): number {
  let low = 0;
  let high = times.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((times[middle] ?? Infinity) <= t) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** The latest sample of `values` at or before `t`; undefined before the first one or where it's NaN. */
export function sampleAt(
  timeline: Timeline,
  values: readonly number[],
  t: number,
): number | undefined {
  const value = values[lastIndexAtOrBefore(timeline.samples.t, t)];
  return value === undefined || Number.isNaN(value) ? undefined : value;
}

/** The level on screen at `t`, if the picture had appeared by then. */
export function shownAt(timeline: Timeline, t: number): number | undefined {
  return timeline.shown.findLast((change) => change.t <= t)?.level;
}

function label(timeline: Timeline, index: number): string {
  return levelLabel(
    timeline.levels.find((level) => level.index === index),
    index,
  );
}

function curveRange(curve: NetworkCurve, from: number, to: number): string {
  const rates = curveOutline(curve, from, to).map((corner) => corner.bps);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  return low === high
    ? `${formatRate(high)} throughout`
    : `between ${formatRate(low)} and ${formatRate(high)}`;
}

/** The stretch a zoomed chart's text speaks of, or undefined when it shows the whole run. */
function zoomed(
  range: TimeRange | undefined,
  lengthS: number,
  untilS: number,
): { from: number; to: number; heading: string } | undefined {
  if (!range || isWhole(range, lengthS) || untilS <= 0) return undefined;
  const to = Math.max(range.from, Math.min(range.to, untilS));
  return { from: range.from, to, heading: `From ${formatClock(range.from)} to ${formatClock(to)}` };
}

export function describeNetworkChart(
  timeline: Timeline,
  curve: NetworkCurve,
  untilS: number,
  range?: TimeRange,
): string {
  const view = zoomed(range, curve.lengthS, untilS);
  if (view) return describeNetworkStretch(timeline, curve, view);
  if (untilS <= 0) {
    return `The simulated network over ${formatClock(curve.lengthS)}: ${curveRange(curve, 0, curve.lengthS)}, with ${curve.rttMs} ms latency.`;
  }
  const ended = timeline.endS !== undefined;
  const estimate = sampleAt(timeline, timeline.samples.estimateBps, untilS);
  const shown = shownAt(timeline, untilS);
  const switches = Math.max(0, timeline.shown.length - 1);
  const sentences = [
    ended
      ? `Over ${formatClock(untilS)}, the network gave ${curveRange(curve, 0, untilS)}.`
      : `At ${formatClock(untilS)} the network gives ${formatRate(bandwidthAt(curve, untilS))} (${curveRange(curve, 0, untilS)} so far).`,
    estimate === undefined
      ? "The player hasn't estimated the bandwidth yet."
      : `The player's estimate ${ended ? "ended at" : "is"} ${formatRate(estimate)}.`,
    shown === undefined
      ? "Nothing on screen yet."
      : `On screen ${ended ? "at the end" : "now"}: ${label(timeline, shown)}${switches === 0 ? "" : `, after ${switches} quality ${switches === 1 ? "switch" : "switches"}`}.`,
  ];
  return sentences.join(" ");
}

/** The values of `values` from `from` to `to`: the one in force at `from`, then each sample after it. */
function valuesBetween(
  timeline: Timeline,
  values: readonly number[],
  from: number,
  to: number,
): number[] {
  const { t } = timeline.samples;
  const found: number[] = [];
  for (let i = Math.max(0, lastIndexAtOrBefore(t, from)); i < t.length; i++) {
    if ((t[i] ?? Infinity) > to) break;
    const value = values[i];
    if (value !== undefined && !Number.isNaN(value)) found.push(value);
  }
  return found;
}

function describeNetworkStretch(
  timeline: Timeline,
  curve: NetworkCurve,
  view: { from: number; to: number; heading: string },
): string {
  const { from, to, heading } = view;
  const estimates = valuesBetween(timeline, timeline.samples.estimateBps, from, to);
  const low = Math.min(...estimates);
  const high = Math.max(...estimates);
  const atStart = shownAt(timeline, from);
  const atEnd = shownAt(timeline, to);
  const switches = timeline.shown.slice(1).filter((change) => change.t > from && change.t <= to);
  const sentences = [
    `${heading}, the network gave ${curveRange(curve, from, to)}.`,
    estimates.length === 0
      ? "The player had no estimate of the bandwidth then."
      : low === high
        ? `The player's estimate was ${formatRate(high)}.`
        : `The player's estimate was between ${formatRate(low)} and ${formatRate(high)}.`,
    atEnd === undefined
      ? "Nothing was on screen yet."
      : switches.length === 0
        ? `On screen: ${label(timeline, atEnd)} throughout.`
        : `On screen: ${atStart === undefined ? "nothing" : label(timeline, atStart)} at ${formatClock(from)}, ${label(timeline, atEnd)} at ${formatClock(to)}, after ${switches.length} quality ${switches.length === 1 ? "switch" : "switches"}.`,
  ];
  return sentences.join(" ");
}

/** Seconds of `stalls` inside `from`…`to`, an open stall lasting until `untilS`. */
const stalledFor = (
  stalls: readonly { start: number; end: number | undefined }[],
  from: number,
  to: number,
  untilS: number,
) =>
  stalls.reduce(
    (total, stall) =>
      total + Math.max(0, Math.min(stall.end ?? untilS, untilS, to) - Math.max(stall.start, from)),
    0,
  );

export function describeBufferChart(
  timeline: Timeline,
  untilS: number,
  range?: TimeRange,
  lengthS = Infinity,
): string {
  const { t, bufferS } = timeline.samples;
  if (t.length === 0 || untilS <= 0) return "The buffer chart fills in once the run starts.";
  const view = zoomed(range, lengthS, untilS);
  if (view) {
    const { from, to, heading } = view;
    const values = valuesBetween(timeline, bufferS, from, to);
    const first = values[0];
    const stalls = timeline.stalls.filter(
      (stall) => stall.start <= to && (stall.end ?? untilS) > from,
    );
    const held =
      first === undefined
        ? `${heading} the player had no buffer yet.`
        : `${heading} the buffer went from ${formatDuration(first)} to ${formatDuration(sampleAt(timeline, bufferS, to) ?? 0)} of video (at most ${formatDuration(Math.max(...values))}).`;
    const stalled =
      stalls.length === 0
        ? "No stalls then."
        : `${stalls.length === 1 ? "1 stall" : `${stalls.length} stalls`} in this stretch, ${formatDuration(stalledFor(stalls, from, to, untilS))} of it; the first from ${formatClock(stalls[0]?.start ?? from)}.`;
    return `${held} ${stalled}`;
  }
  const ended = timeline.endS !== undefined;
  const last = lastIndexAtOrBefore(t, untilS);
  const most = Math.max(0, ...bufferS.slice(0, last + 1));
  const now = bufferS[last] ?? 0;
  const stalls = timeline.stalls.filter((stall) => stall.start <= untilS);
  const stallS = stalls.reduce(
    (total, stall) => total + Math.min(stall.end ?? untilS, untilS) - stall.start,
    0,
  );
  const held = ended
    ? `The buffer held up to ${formatDuration(most)} of video and ended at ${formatDuration(now)}.`
    : `At ${formatClock(untilS)} the buffer holds ${formatDuration(now)} of video (at most ${formatDuration(most)} so far).`;
  const first = stalls[0];
  const stalled = !first
    ? `No stalls${ended ? "" : " so far"}.`
    : stalls.length === 1
      ? `1 stall of ${formatDuration(stallS)}, at ${formatClock(first.start)}.`
      : `${stalls.length} stalls, ${formatDuration(stallS)} in all; the first at ${formatClock(first.start)}.`;
  return `${held} ${stalled}`;
}

/** Whether a download overlaps `range`; one still loading lasts until `untilS`. */
const overlaps = (download: Download, range: TimeRange, untilS: number) =>
  download.start <= range.to && (download.end ?? untilS) >= range.from;

export function describeDownloadsChart(
  timeline: Timeline,
  untilS: number,
  range?: TimeRange,
  lengthS = Infinity,
): string {
  const view = zoomed(range, lengthS, untilS);
  const started = timeline.downloads.filter(
    (download) => download.start <= untilS && (!view || overlaps(download, view, untilS)),
  );
  if (view && started.length === 0) {
    return `No video segments downloaded from ${formatClock(view.from)} to ${formatClock(view.to)}.`;
  }
  if (started.length === 0) return "Downloads appear here once the run starts.";
  const done = started.filter((download) => download.state === "done");
  const abandoned = started.filter((download) => download.state === "abandoned").length;
  const loading = started.some((download) => download.state === "loading");

  const counts = new Map<number, number>();
  for (const download of done) counts.set(download.level, (counts.get(download.level) ?? 0) + 1);
  const most = [...counts].sort((a, b) => b[1] - a[1])[0];
  const longest = done.reduce<Download | undefined>(
    (best, download) => (best === undefined || took(download) > took(best) ? download : best),
    undefined,
  );

  const parts = [
    `${done.length} video ${done.length === 1 ? "segment" : "segments"} downloaded${most ? `, most at ${label(timeline, most[0])}` : ""}`,
  ];
  if (abandoned > 0) parts.push(`${abandoned} abandoned`);
  if (loading && timeline.endS === undefined) parts.push("one downloading now");
  const sentences = [`${view ? `${view.heading}: ` : ""}${parts.join("; ")}.`];
  if (longest) {
    sentences.push(
      `The longest took ${formatDuration(took(longest))}, from ${formatClock(longest.start, 1)}.`,
    );
  }
  return sentences.join(" ");
}

const took = (download: Download) => (download.end ?? download.start) - download.start;

/** A row of the network and buffer data tables. */
export interface ChartRow {
  t: number;
  networkBps: number;
  estimateBps: number | undefined;
  shown: string | undefined;
  bufferS: number | undefined;
  stalled: boolean;
}

/** Seconds between table rows: a round step that keeps the table at about 60 rows or fewer. */
export function rowStep(lengthS: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((step) => lengthS / step <= 60) ?? 600;
}

/** Rows at a round step up to `untilS`; with a `range`, only the rows inside it, at a step that suits its width. */
export function chartRows(
  timeline: Timeline,
  curve: NetworkCurve,
  untilS: number,
  range: TimeRange = wholeRange(curve.lengthS),
): ChartRow[] {
  const step = rowStep(range.to - range.from);
  const until = Math.min(untilS, range.to);
  const rows: ChartRow[] = [];
  for (
    let t = Math.max(0, Math.ceil(range.from / step - 1e-9) * step);
    t <= until + 1e-9;
    t += step
  ) {
    const shown = shownAt(timeline, t);
    rows.push({
      t,
      networkBps: bandwidthAt(curve, t),
      estimateBps: sampleAt(timeline, timeline.samples.estimateBps, t),
      shown: shown === undefined ? undefined : label(timeline, shown),
      bufferS: sampleAt(timeline, timeline.samples.bufferS, t),
      stalled: timeline.stalls.some((stall) => stall.start <= t && t < (stall.end ?? Infinity)),
    });
  }
  return rows;
}

/** A row of the downloads table. */
export interface DownloadRow {
  start: number;
  /** Seconds it took, or undefined while it's loading. */
  tookS: number | undefined;
  quality: string;
  bytes: number | undefined;
  state: Download["state"];
}

/** Every download, or with a `range` the ones that overlap it (one still loading lasts until `untilS`). */
export function downloadRows(
  timeline: Timeline,
  range?: TimeRange,
  untilS = Infinity,
): DownloadRow[] {
  const downloads = range
    ? timeline.downloads.filter((download) => overlaps(download, range, untilS))
    : timeline.downloads;
  return downloads.map((download) => ({
    start: download.start,
    tookS: download.end === undefined ? undefined : download.end - download.start,
    quality: label(timeline, download.level),
    bytes: download.bytes,
    state: download.state,
  }));
}
