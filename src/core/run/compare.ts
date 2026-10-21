import { formatMbps } from "@/core/format/bitrate";
import { formatClock, formatDuration } from "@/core/format/time";
import { computeMetrics, computeScore, type RunMetrics, type Score } from "@/core/metrics";
import { curveOutline } from "@/core/netsim/curve";
import type { SavedRun } from "@/core/persist/runs";
import { formatSetting, SETTINGS, type PlayerSettingKey } from "@/core/player/settings";
import { rowStep, sampleAt, shownAt } from "./chart-text";
import { levelLabel } from "./describe";
import { buildTimeline, type OpenInterval, type Timeline } from "./timeline";

/**
 * Two saved runs side by side (the Compare screen): their numbers with the difference in words, what their setups
 * changed, and the text alternatives of the overlaid charts. B is read against A throughout: "B started 0.3 s sooner".
 */

/** A saved run with everything the comparison reads from it. */
export interface ComparedRun {
  run: SavedRun;
  metrics: RunMetrics;
  score: Score;
  timeline: Timeline;
}

export function compared(run: SavedRun): ComparedRun {
  const metrics = computeMetrics(run.events);
  return {
    run,
    metrics,
    score: computeScore(metrics, run.setup.network.curve),
    timeline: buildTimeline(run.events),
  };
}

/** How B did against A on one number; "same" when both read the same. */
export type Verdict = "better" | "worse" | "same";

export interface MetricComparison {
  label: string;
  a: string;
  b: string;
  /** B against A in words ("0.31 s sooner", "+0.8 Mbps"), or "—" when they read the same. */
  difference: string;
  verdict: Verdict;
}

interface Measure {
  label: string;
  value: (run: ComparedRun) => number | undefined;
  format: (value: number) => string;
  /** The value to the precision `format` shows, so a difference is never smaller than what can be seen. */
  round: (value: number) => number;
  higherIsBetter: boolean;
  /** B's value against A's in words; `delta` is B − A of the rounded values, never zero. */
  describe: (delta: number) => string;
  /** How a run reads when it has no value: it never got that far, which is the worst there is. */
  missing?: string;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const seconds = (value: number) => `${value.toFixed(2)} s`;
const toStep = (step: number) => (value: number) => Math.round(value / step) * step;
/** As `formatMbps` shows it: whole Mbps from 10 up, tenths from 1, kbps below. */
const roundBitrate = (bps: number) => toStep(bps >= 1e7 ? 1e6 : bps >= 1e6 ? 1e5 : 1e3)(bps);

const measures: Measure[] = [
  {
    label: "QoE score",
    value: ({ score }) => score.score,
    format: (value) => String(Math.round(value)),
    round: Math.round,
    higherIsBetter: true,
    describe: (delta) =>
      `${delta > 0 ? "+" : "−"}${plural(Math.abs(Math.round(delta)), "point", "points")}`,
  },
  {
    label: "First frame",
    value: ({ metrics }) => metrics.firstFrameS,
    format: seconds,
    round: toStep(0.01),
    higherIsBetter: false,
    describe: (delta) => `${seconds(Math.abs(delta))} ${delta < 0 ? "sooner" : "later"}`,
    missing: "never",
  },
  {
    label: "Stall time",
    value: ({ metrics }) => metrics.stalls.totalS,
    format: (value) => (value === 0 ? "none" : formatDuration(value)),
    round: toStep(0.01),
    higherIsBetter: false,
    describe: (delta) => `${formatDuration(Math.abs(delta))} ${delta < 0 ? "less" : "more"}`,
  },
  {
    label: "Stalls",
    value: ({ metrics }) => metrics.stalls.count,
    format: String,
    round: (value) => value,
    higherIsBetter: false,
    describe: (delta) => `${Math.abs(delta)} ${delta < 0 ? "fewer" : "more"}`,
  },
  {
    label: "Rebuffer ratio",
    value: ({ metrics }) => metrics.rebufferRatio,
    format: (value) => `${(value * 100).toFixed(1)}%`,
    round: toStep(0.001),
    higherIsBetter: false,
    describe: (delta) =>
      `${(Math.abs(delta) * 100).toFixed(1)} percentage points ${delta < 0 ? "lower" : "higher"}`,
  },
  {
    label: "Average bitrate",
    value: ({ metrics }) => metrics.averageBitrate,
    format: formatMbps,
    round: roundBitrate,
    higherIsBetter: true,
    describe: (delta) => `${delta > 0 ? "+" : "−"}${formatMbps(Math.abs(delta))}`,
  },
  {
    label: "Quality switches",
    value: ({ metrics }) => metrics.switches.total,
    format: String,
    round: (value) => value,
    higherIsBetter: false,
    describe: (delta) => `${Math.abs(delta)} ${delta < 0 ? "fewer" : "more"}`,
  },
  {
    label: "At top quality",
    value: ({ metrics }) => metrics.topQualityShare,
    format: percent,
    round: toStep(0.01),
    higherIsBetter: true,
    describe: (delta) =>
      `${Math.round(Math.abs(delta) * 100)} percentage points ${delta > 0 ? "more" : "less"}`,
  },
  {
    label: "Wasted data",
    value: ({ metrics }) => metrics.wastedBytes,
    format: megabytes,
    round: toStep(1e5),
    higherIsBetter: false,
    describe: (delta) => `${megabytes(Math.abs(delta))} ${delta < 0 ? "less" : "more"}`,
  },
];

/** Every number the Report shows, for both runs, with how B did against A. */
export function compareMetrics(a: ComparedRun, b: ComparedRun): MetricComparison[] {
  return measures.map((measure) => {
    const valueA = measure.value(a);
    const valueB = measure.value(b);
    const shown = (value: number | undefined) =>
      value === undefined ? (measure.missing ?? "—") : measure.format(value);
    const row = { label: measure.label, a: shown(valueA), b: shown(valueB) };
    if (valueA === undefined || valueB === undefined) {
      // A run that never got there did worst; two that never did, the same.
      if (valueA === valueB) return { ...row, difference: "—", verdict: "same" };
      return { ...row, difference: "—", verdict: valueA === undefined ? "better" : "worse" };
    }
    // Numbers that read the same are the same: a difference below what's shown isn't one.
    const delta = measure.round(valueB) - measure.round(valueA);
    if (row.a === row.b || Math.abs(delta) < 1e-9) {
      return { ...row, difference: "—", verdict: "same" };
    }
    const better = measure.higherIsBetter ? delta > 0 : delta < 0;
    return { ...row, difference: measure.describe(delta), verdict: better ? "better" : "worse" };
  });
}

export interface SetupDifference {
  label: string;
  a: string;
  b: string;
}

function networkName(run: SavedRun): string {
  const { network } = run.setup;
  return network.id ? network.name : `${network.name} (drawn)`;
}

/** Where the two setups differ: the stream, the network, the player and each setting, the browser. */
export function setupDifferences(a: SavedRun, b: SavedRun): SetupDifference[] {
  const differences: SetupDifference[] = [];
  const add = (label: string, valueA: string, valueB: string) => {
    if (valueA !== valueB) differences.push({ label, a: valueA, b: valueB });
  };

  if (a.setup.streamUrl !== b.setup.streamUrl) {
    differences.push({ label: "Stream", a: a.setup.streamName, b: b.setup.streamName });
  }
  const sameNetwork =
    a.setup.network.id === b.setup.network.id &&
    JSON.stringify(a.setup.network.curve) === JSON.stringify(b.setup.network.curve);
  if (!sameNetwork) {
    const nameA = networkName(a);
    const nameB = networkName(b);
    differences.push({
      label: "Network",
      a: nameA,
      b: nameB === nameA ? `${nameB}, changed` : nameB,
    });
  }
  add("Player setup", a.setup.player.name, b.setup.player.name);
  for (const key of Object.keys(SETTINGS) as PlayerSettingKey[]) {
    const value = (run: SavedRun) =>
      formatSetting(key, run.setup.player.settings[key] ?? SETTINGS[key].hlsjsDefault);
    add(key, value(a), value(b));
  }
  add("Player", `${a.player.name} ${a.player.version}`, `${b.player.name} ${b.player.version}`);
  add("Browser", a.environment.browser, b.environment.browser);
  return differences;
}

/** The quality on screen, from the first frame to the end, as the overlaid chart's sentence tells it. */
function onScreen(run: ComparedRun): string {
  const { metrics } = run;
  if (metrics.averageBitrate === undefined) return "never showed a picture";
  const switches = metrics.switches.total;
  return `averaged ${formatMbps(metrics.averageBitrate)} on screen with ${switches === 0 ? "no quality switches" : plural(switches, "quality switch", "quality switches")}`;
}

function networkRange({ run }: ComparedRun): string {
  const { curve } = run.setup.network;
  const rates = curveOutline(curve, 0, curve.lengthS).map((corner) => corner.bps);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  return low === high
    ? `${formatMbps(high)} throughout`
    : `between ${low <= 0 ? "0 Mbps" : formatMbps(low)} and ${formatMbps(high)}`;
}

/** The sentence of the overlaid bandwidth and quality chart. */
export function describeCompareQuality(a: ComparedRun, b: ComparedRun): string {
  const sameNetwork =
    JSON.stringify(a.run.setup.network.curve) === JSON.stringify(b.run.setup.network.curve);
  const network = sameNetwork
    ? `Both ran on the same network, ${networkRange(a)}.`
    : `A's network was ${networkRange(a)}; B's ${networkRange(b)}.`;
  return `${network} A ${onScreen(a)}; B ${onScreen(b)}.`;
}

function held(run: ComparedRun): string {
  const most = Math.max(0, ...run.timeline.samples.bufferS);
  return formatDuration(most);
}

/** The sentence of the overlaid buffer chart. */
export function describeCompareBuffer(a: ComparedRun, b: ComparedRun): string {
  return `A's buffer held up to ${held(a)} of video; B's up to ${held(b)}.`;
}

function stalledIn({ metrics }: ComparedRun): string {
  const { count, totalS } = metrics.stalls;
  if (count === 0) return "never stalled";
  const first = metrics.stalls.intervals[0];
  return `stalled ${count === 1 ? "once" : `${count} times`}, ${formatDuration(totalS)} in all${first ? `, first at ${formatClock(first.start)}` : ""}`;
}

/** The sentence of the stalls lanes. */
export function describeCompareStalls(a: ComparedRun, b: ComparedRun): string {
  return `A ${stalledIn(a)}; B ${stalledIn(b)}.`;
}

/** One run at one moment, for the data table. */
export interface CompareCell {
  shown: string | undefined;
  bufferS: number | undefined;
  stalled: boolean;
}

export interface CompareRow {
  t: number;
  a: CompareCell;
  b: CompareCell;
}

const stalledAt = (stalls: readonly OpenInterval[], t: number) =>
  stalls.some((stall) => stall.start <= t && t < (stall.end ?? Infinity));

function cellAt({ timeline }: ComparedRun, t: number): CompareCell {
  const end = timeline.endS ?? Infinity;
  if (t > end) return { shown: undefined, bufferS: undefined, stalled: false };
  const level = shownAt(timeline, t);
  return {
    shown:
      level === undefined
        ? undefined
        : levelLabel(
            timeline.levels.find((candidate) => candidate.index === level),
            level,
          ),
    bufferS: sampleAt(timeline, timeline.samples.bufferS, t),
    stalled: stalledAt(timeline.stalls, t),
  };
}

/** Rows at a round step over the longer run: what each showed, its buffer, and whether it was stalled. */
export function compareRows(a: ComparedRun, b: ComparedRun): CompareRow[] {
  const lengthS = Math.max(a.timeline.endS ?? 0, b.timeline.endS ?? 0);
  const step = rowStep(lengthS);
  const rows: CompareRow[] = [];
  for (let t = 0; t <= lengthS + 1e-9; t += step) {
    rows.push({ t, a: cellAt(a, t), b: cellAt(b, t) });
  }
  return rows;
}
