import { formatMbps } from "@/core/format/bitrate";
import { formatClock, formatDuration } from "@/core/format/time";
import { computeMetrics, computeScore, type RunMetrics, type Score } from "@/core/metrics";
import { curveOutline } from "@/core/netsim/curve";
import type { SavedRun } from "@/core/persist/runs";
import {
  PLAYER_PRESETS,
  SETTINGS,
  type PlayerSettingKey,
  type PlayerSettings,
} from "@/core/player/settings";
import { rowStep, sampleAt, shownAt } from "./chart-text";
import { levelLabel } from "./describe";
import { eventsOfType, type Level, type RunEvent } from "./events";
import { playerChanges } from "./report";
import { buildTimeline, type OpenInterval, type Timeline } from "./timeline";

/**
 * Two saved runs side by side (the Compare screen): what their setups changed, a verdict, their numbers with the
 * difference in words, and the overlaid charts' takeaways. B is read against A throughout: "B started 0.3 s sooner".
 */

/** A saved run with everything the comparison reads from it. */
export interface ComparedRun {
  run: SavedRun;
  metrics: RunMetrics;
  score: Score;
  timeline: Timeline;
}

/** A saved run as the comparison reads it; with `untilS`, only its first `untilS` seconds, as if stopped there. */
export function compared(run: SavedRun, untilS?: number): ComparedRun {
  const events = untilS === undefined ? run.events : cutEvents(run.events, untilS);
  const metrics = computeMetrics(events);
  return {
    run,
    metrics,
    score: computeScore(metrics, run.setup.network.curve),
    timeline: buildTimeline(events),
  };
}

/** The log up to `untilS`, ended there as Stop would end it. */
export function cutEvents(events: readonly RunEvent[], untilS: number): RunEvent[] {
  return [
    ...events.filter((event) => event.type !== "end" && event.t <= untilS),
    { type: "end", t: untilS, reason: "stopped" },
  ];
}

/** When a run ended, seconds. */
export function runEndS(run: SavedRun): number {
  const end = eventsOfType(run.events, "end")[0];
  return end?.t ?? run.events.reduce((latest, event) => Math.max(latest, event.t), 0);
}

/** One run that didn't play to the end: which, where it ended and what it would have run. */
export interface EndedEarly {
  side: "A" | "B";
  atS: number;
  lengthS: number;
  reason: "stopped" | "error";
}

/** The runs that ended early (stopped, or broken off by an error), A first. */
export function endedEarly(a: SavedRun, b: SavedRun): EndedEarly[] {
  const ended: EndedEarly[] = [];
  for (const [side, run] of [
    ["A", a],
    ["B", b],
  ] as const) {
    if (run.reason === "complete") continue;
    ended.push({
      side,
      atS: runEndS(run),
      lengthS: run.setup.network.curve.lengthS,
      reason: run.reason,
    });
  }
  return ended;
}

/**
 * The stretch both runs cover when one ended early: from the start to the earlier end, seconds. Undefined when both
 * played to the end; runs of different lengths then compare whole, lined up from 0:00.
 */
export function sharedSpanS(a: SavedRun, b: SavedRun): number | undefined {
  if (endedEarly(a, b).length === 0) return undefined;
  return Math.min(runEndS(a), runEndS(b));
}

/**
 * How far apart repeat runs of one setup land, from the repeatability job (`pnpm repeat`, measured 2026-10-22; the
 * README and About quote it): scores within 1.7 points, first frames within 0.27 s (a fresh browser's first run is
 * the slow one), stall time within 0.08 s, the average bitrate within 0.05 Mbps, and the same stalls and switches. A
 * difference this small can't be told from the spread between runs, so it isn't called better or worse.
 */
export const SPREAD = {
  scorePoints: 2,
  firstFrameS: 0.3,
  stallS: 0.1,
  bitrateBps: 100_000,
} as const;

/** How B did against A on one number. */
export type Verdict = "better" | "worse" | "same" | "spread" | "not-comparable";

/** The groups the numbers come in, in order. */
export type MetricGroup = "Overall" | "Starting" | "Stalling" | "Picture" | "Data";

export interface MetricComparison {
  label: string;
  group: MetricGroup;
  a: string;
  b: string;
  /** B against A in words ("0.31 s sooner", "+0.8 Mbps"); empty when there's nothing to say. */
  difference: string;
  verdict: Verdict;
}

interface Measure {
  label: string;
  group: MetricGroup;
  value: (run: ComparedRun) => number | undefined;
  format: (value: number) => string;
  /** The value to the precision `format` shows, so a difference is never smaller than what can be seen. */
  round: (value: number) => number;
  higherIsBetter: boolean;
  /** B's value against A's in words; `delta` is B − A of the rounded values, never zero. */
  describe: (delta: number) => string;
  /** How a run reads when it has no value: it never got that far, which is the worst there is. */
  missing?: string;
  /** The spread between repeat runs of one setup (`SPREAD`); a difference up to it is no difference. */
  spread?: number;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;
const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const seconds = (value: number) => `${value.toFixed(2)} s`;
const toStep = (step: number) => (value: number) => Math.round(value / step) * step;
/** As `formatMbps` shows it: whole Mbps from 10 up, tenths from 1, kbps below. */
const roundBitrate = (bps: number) => toStep(bps >= 1e7 ? 1e6 : bps >= 1e6 ? 1e5 : 1e3)(bps);
const points = (delta: number) => plural(Math.abs(Math.round(delta)), "point", "points");

const measures: Measure[] = [
  {
    label: "QoE score",
    group: "Overall",
    value: ({ score }) => score.score,
    format: (value) => String(Math.round(value)),
    round: Math.round,
    higherIsBetter: true,
    describe: (delta) => `${delta > 0 ? "+" : "−"}${points(delta)}`,
    spread: SPREAD.scorePoints,
  },
  {
    label: "First frame",
    group: "Starting",
    value: ({ metrics }) => metrics.firstFrameS,
    format: seconds,
    round: toStep(0.01),
    higherIsBetter: false,
    describe: (delta) => `${seconds(Math.abs(delta))} ${delta < 0 ? "sooner" : "later"}`,
    missing: "never",
    spread: SPREAD.firstFrameS,
  },
  {
    label: "Stalls",
    group: "Stalling",
    value: ({ metrics }) => metrics.stalls.count,
    format: String,
    round: (value) => value,
    higherIsBetter: false,
    describe: (delta) => `${Math.abs(delta)} ${delta < 0 ? "fewer" : "more"}`,
  },
  {
    label: "Stall time",
    group: "Stalling",
    value: ({ metrics }) => metrics.stalls.totalS,
    format: (value) => (value === 0 ? "none" : formatDuration(value)),
    round: toStep(0.01),
    higherIsBetter: false,
    describe: (delta) => `${formatDuration(Math.abs(delta))} ${delta < 0 ? "less" : "more"}`,
    spread: SPREAD.stallS,
  },
  {
    label: "Rebuffer ratio",
    group: "Stalling",
    value: ({ metrics }) => metrics.rebufferRatio,
    format: (value) => `${(value * 100).toFixed(1)}%`,
    round: toStep(0.001),
    higherIsBetter: false,
    describe: (delta) =>
      `${(Math.abs(delta) * 100).toFixed(1)} percentage points ${delta < 0 ? "lower" : "higher"}`,
  },
  {
    label: "Average bitrate",
    group: "Picture",
    value: ({ metrics }) => metrics.averageBitrate,
    format: formatMbps,
    round: roundBitrate,
    higherIsBetter: true,
    describe: (delta) => `${delta > 0 ? "+" : "−"}${formatMbps(Math.abs(delta))}`,
    spread: SPREAD.bitrateBps,
  },
  {
    label: "At top quality",
    group: "Picture",
    value: ({ metrics }) => metrics.topQualityShare,
    format: percent,
    round: toStep(0.01),
    higherIsBetter: true,
    describe: (delta) =>
      `${Math.round(Math.abs(delta) * 100)} percentage points ${delta > 0 ? "more" : "less"}`,
  },
  {
    label: "Quality switches",
    group: "Picture",
    value: ({ metrics }) => metrics.switches.total,
    format: String,
    round: (value) => value,
    higherIsBetter: false,
    describe: (delta) => `${Math.abs(delta)} ${delta < 0 ? "fewer" : "more"}`,
  },
  {
    label: "Wasted data",
    group: "Data",
    value: ({ metrics }) => metrics.wastedBytes,
    format: megabytes,
    round: toStep(1e5),
    higherIsBetter: false,
    describe: (delta) => `${megabytes(Math.abs(delta))} ${delta < 0 ? "less" : "more"}`,
  },
];

/**
 * Every number the Report shows, for both runs, with how B did against A. With `firstFrameOnly` (whole runs, one of
 * which ended early), only the first frame compares; the rest are marked so.
 */
export function compareMetrics(
  a: ComparedRun,
  b: ComparedRun,
  { firstFrameOnly = false } = {},
): MetricComparison[] {
  return measures.map((measure) => {
    const valueA = measure.value(a);
    const valueB = measure.value(b);
    const shown = (value: number | undefined) =>
      value === undefined ? (measure.missing ?? "—") : measure.format(value);
    const row = { label: measure.label, group: measure.group, a: shown(valueA), b: shown(valueB) };
    if (firstFrameOnly && measure.label !== "First frame") {
      return { ...row, difference: "", verdict: "not-comparable" };
    }
    if (valueA === undefined || valueB === undefined) {
      // A run that never got there did worst; two that never did, the same.
      if (valueA === valueB) return { ...row, difference: "", verdict: "same" };
      return { ...row, difference: "", verdict: valueA === undefined ? "better" : "worse" };
    }
    // Numbers that read the same are the same: a difference below what's shown isn't one.
    const delta = measure.round(valueB) - measure.round(valueA);
    if (row.a === row.b || Math.abs(delta) < 1e-9) {
      return { ...row, difference: "", verdict: "same" };
    }
    const difference = measure.describe(delta);
    if (measure.spread !== undefined && Math.abs(delta) <= measure.spread + 1e-9) {
      return { ...row, difference, verdict: "spread" };
    }
    const better = measure.higherIsBetter ? delta > 0 : delta < 0;
    return { ...row, difference, verdict: better ? "better" : "worse" };
  });
}

/** "2 better · 5 worse · 2 the same"; over whole runs where one ended early, that only the first frame compares. */
export function tally(rows: readonly MetricComparison[]): string {
  if (rows.some((row) => row.verdict === "not-comparable")) {
    return "Over whole runs, only the first frame compares fairly.";
  }
  const count = (verdict: Verdict) => rows.filter((row) => row.verdict === verdict).length;
  return (
    [
      [count("better"), "better"],
      [count("worse"), "worse"],
      [count("spread"), "within spread"],
      [count("same"), "the same"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`)
    .join(" · ");
}

/** One way the setups differ. */
export interface SetupChange {
  label: string;
  a: string;
  b: string;
  /** For a player preset: the settings it changes. */
  detail?: string;
}

const SETTING_KEYS = Object.keys(SETTINGS) as PlayerSettingKey[];

/** A setting's value in words: its own, or hls.js's default ("30 s", "unlimited", "auto", "on"). */
export function settingText(
  key: PlayerSettingKey,
  value: PlayerSettings[PlayerSettingKey],
): string {
  const info = SETTINGS[key];
  const shown = value ?? info.hlsjsDefault;
  if (typeof shown === "boolean") return shown ? "on" : "off";
  if (shown === undefined) return "auto";
  if (shown === Number.POSITIVE_INFINITY) return "unlimited";
  if (info.unit === "bit/s") return formatMbps(shown);
  return info.unit ? `${shown} ${info.unit}` : String(shown);
}

function networkName(run: SavedRun): string {
  const { network } = run.setup;
  return network.id ? network.name : `${network.name} (drawn)`;
}

const presetSettings = (presetId: string): PlayerSettings =>
  PLAYER_PRESETS.find((preset) => preset.id === presetId)?.settings ?? {};

/**
 * Where the two setups differ: the stream, the network, the player preset (one change, with the settings it changes
 * listed), each setting changed by hand, the player's version and the browser.
 */
export function setupChanges(a: SavedRun, b: SavedRun): SetupChange[] {
  const changes: SetupChange[] = [];
  const add = (label: string, valueA: string, valueB: string) => {
    if (valueA !== valueB) changes.push({ label, a: valueA, b: valueB });
  };

  if (a.setup.streamUrl !== b.setup.streamUrl) {
    changes.push({ label: "Stream", a: a.setup.streamName, b: b.setup.streamName });
  }
  const sameNetwork =
    a.setup.network.id === b.setup.network.id &&
    JSON.stringify(a.setup.network.curve) === JSON.stringify(b.setup.network.curve);
  if (!sameNetwork) {
    const nameA = networkName(a);
    const nameB = networkName(b);
    changes.push({ label: "Network", a: nameA, b: nameB === nameA ? `${nameB}, changed` : nameB });
  }

  const playerA = a.setup.player;
  const playerB = b.setup.player;
  if (playerA.presetId !== playerB.presetId) {
    const fromA = presetSettings(playerA.presetId);
    const fromB = presetSettings(playerB.presetId);
    const keys = SETTING_KEYS.filter(
      (key) => settingText(key, fromA[key]) !== settingText(key, fromB[key]),
    );
    const list = keys.map(
      (key) =>
        `${SETTINGS[key].label.toLowerCase()} ${settingText(key, fromA[key])} → ${settingText(key, fromB[key])}`,
    );
    changes.push({
      label: "Player setup",
      a: playerA.name,
      b: playerB.name,
      ...(keys.length > 0 && {
        detail: `The preset changes ${plural(keys.length, "setting", "settings")}: ${list.join(", ")}.`,
      }),
    });
  }
  // Settings changed by hand, beyond the presets: each is a change of its own.
  const byHand = new Set([...Object.keys(playerChanges(a)), ...Object.keys(playerChanges(b))]);
  for (const key of SETTING_KEYS) {
    if (!byHand.has(key)) continue;
    add(
      SETTINGS[key].label,
      settingText(key, playerA.settings[key]),
      settingText(key, playerB.settings[key]),
    );
  }

  add("Player", `${a.player.name} ${a.player.version}`, `${b.player.name} ${b.player.version}`);
  add("Browser", a.environment.browser, b.environment.browser);
  return changes;
}

/** The verdict at the top of Compare. */
export interface CompareVerdict {
  /** The scores' difference: "12 points lower", with how it reads. */
  difference: { text: string; verdict: Verdict };
  headline: string;
  detail: string;
  /** The difference is the spread between runs: point to how repeatable runs are. */
  spread: boolean;
}

/** How a run's stalls read: "never stalled", "stalled once, for 3.4 s from 0:52". */
function stalledPhrase({ metrics }: ComparedRun): string {
  const { count, totalS, intervals } = metrics.stalls;
  const first = intervals[0];
  if (count === 0 || !first) return "never stalled";
  if (count === 1)
    return `stalled once, for ${formatDuration(totalS)} from ${formatClock(first.start)}`;
  return `stalled ${count === 2 ? "twice" : `${count} times`}, ${formatDuration(totalS)} in all, first at ${formatClock(first.start)}`;
}

/** "B stalled once, for 3.4 s from 0:52. A never stalled.", or "No stalls in either run." */
function stallSentence(a: ComparedRun, b: ComparedRun): string {
  if (a.metrics.stalls.count === 0 && b.metrics.stalls.count === 0)
    return "No stalls in either run.";
  return `B ${stalledPhrase(b)}. A ${stalledPhrase(a)}.`;
}

/**
 * The headline's clause on the number that moved most: a stall, then switches, then the bitrate. `good` says whether
 * it went B's way, so the headline can say "though" when it runs against the verdict.
 */
function mostMoved(a: ComparedRun, b: ComparedRun): { text: string; good: boolean } | undefined {
  const stallsA = a.metrics.stalls.count;
  const stallsB = b.metrics.stalls.count;
  const times = (count: number) =>
    count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
  if (stallsA !== stallsB) {
    const good = stallsB < stallsA;
    if (stallsB === 0) return { text: "it never stalled", good };
    if (stallsA === 0) return { text: `it stalled ${times(stallsB)}`, good };
    return { text: `it stalled ${times(stallsB)} to A's ${times(stallsA)}`, good };
  }
  const switches = b.metrics.switches.total - a.metrics.switches.total;
  if (switches !== 0) {
    const count = Math.abs(switches);
    return {
      text: `it made ${count} ${switches < 0 ? "fewer" : "more"} quality ${count === 1 ? "switch" : "switches"}`,
      good: switches < 0,
    };
  }
  const bitrateA = a.metrics.averageBitrate;
  const bitrateB = b.metrics.averageBitrate;
  if (bitrateA !== undefined && bitrateB !== undefined) {
    const delta = roundBitrate(bitrateB) - roundBitrate(bitrateA);
    if (Math.abs(delta) > SPREAD.bitrateBps) {
      return {
        text: `it averaged ${formatMbps(Math.abs(delta))} ${delta > 0 ? "more" : "less"} on screen`,
        good: delta > 0,
      };
    }
  }
  return undefined;
}

/** The real network's part, when it held downloads back in either run: then not all of a difference is the setup's. */
function realNetworkSentence(a: ComparedRun, b: ComparedRun): string {
  const lateIn = (run: ComparedRun) => {
    const { honesty } = run.metrics;
    return { late: honesty.latency.late + honesty.bandwidth.late, of: honesty.requests };
  };
  const held = (
    [
      ["A", lateIn(a)],
      ["B", lateIn(b)],
    ] as const
  ).filter(([, { late }]) => late > 0);
  if (held.length === 0) return "";
  const parts = held.map(([side, { late, of }]) => `${late} of ${of} downloads in ${side}`);
  return `The real network held back ${parts.join(" and ")}, so part of the difference may be its doing, not the setup's.`;
}

/** The facts under the headline: stalls, the first frame and the buffer, B against A. */
function facts(a: ComparedRun, b: ComparedRun, rows: readonly MetricComparison[]): string[] {
  const sentences = [stallSentence(a, b)];
  const first = rows.find((row) => row.label === "First frame");
  if (first && (first.verdict === "better" || first.verdict === "worse")) {
    sentences.push(`B showed its first frame ${first.difference}.`);
  }
  const mostA = Math.max(0, ...a.timeline.samples.bufferS);
  const mostB = Math.max(0, ...b.timeline.samples.bufferS);
  if (Math.abs(mostA - mostB) >= 2) {
    sentences.push(
      `B's buffer held up to ${formatDuration(mostB)}; A's up to ${formatDuration(mostA)}.`,
    );
  }
  return sentences;
}

/**
 * The verdict: the scores' difference, a headline naming what moved most, and the facts behind it. `rows` are
 * `compareMetrics(a, b)`; `ended` the runs that ended early, if any; `whole` whether they're compared whole anyway.
 */
export function compareVerdict(
  a: ComparedRun,
  b: ComparedRun,
  changes: readonly SetupChange[],
  rows: readonly MetricComparison[],
  { ended = [], whole = false }: { ended?: readonly EndedEarly[]; whole?: boolean } = {},
): CompareVerdict {
  const scoreRow = rows.find((row) => row.label === "QoE score");
  const delta = Math.round(b.score.score) - Math.round(a.score.score);
  const higherLower = `${points(delta)} ${delta > 0 ? "higher" : "lower"}`;
  const real = realNetworkSentence(a, b);

  if (ended.length > 0) {
    const [first, second] = ended;
    const verb = (end: EndedEarly) => (end.reason === "stopped" ? "was stopped" : "broke off");
    const headline =
      first && second
        ? `Too early to tell: A ${verb(first)} at ${formatClock(first.atS)} and B at ${formatClock(second.atS)}.`
        : first
          ? `Too early to tell: ${first.side} ${verb(first)} at ${formatClock(first.atS)} of ${formatClock(first.lengthS)}.`
          : "";
    if (whole) {
      const firstFrame = rows.find((row) => row.label === "First frame");
      return {
        difference: {
          text: `not comparable: ${ended.map((end) => end.side).join(" and ")} didn't finish`,
          verdict: "not-comparable",
        },
        headline,
        detail: `Over whole runs, only the first frame compares fairly${
          firstFrame?.difference ? `: B showed its first frame ${firstFrame.difference}` : ""
        }.`,
        spread: false,
      };
    }
    return {
      difference: scoreDifference(delta, scoreRow),
      headline,
      detail: [...facts(a, b, rows), real].filter(Boolean).join(" "),
      spread: false,
    };
  }

  const difference = scoreDifference(delta, scoreRow);
  if (difference.verdict === "spread" || difference.verdict === "same") {
    if (changes.length === 0) {
      const parts = [
        ...(delta === 0 ? [] : [`scored ${higherLower}`]),
        ...rows
          .filter((row) => row.label === "First frame" && row.difference)
          .map((row) => `showed its first frame ${row.difference}`),
      ];
      const what = parts.length > 0 ? `B ${parts.join(" and ")}.` : "B and A scored the same.";
      return {
        difference,
        headline: "The same setup, and no real difference.",
        detail: `${what} Repeat runs of one setup land within ${SPREAD.scorePoints} points and ${SPREAD.firstFrameS} s of each other, so this is the spread from one run to the next, not a cause.`,
        spread: true,
      };
    }
    return {
      difference,
      headline: `No clear difference: the scores are within ${SPREAD.scorePoints} points.`,
      detail: [
        ...facts(a, b, rows),
        `Repeat runs of one setup land within ${SPREAD.scorePoints} points of each other, so the score can't pin a difference on the change.`,
        real,
      ]
        .filter(Boolean)
        .join(" "),
      spread: true,
    };
  }

  const verdict = delta > 0 ? "better" : "worse";
  const moved = mostMoved(a, b);
  const clause = moved ? `${moved.good === delta > 0 ? ", and" : ", though"} ${moved.text}` : "";
  const headline =
    changes.length === 0
      ? `The same setup, yet B did ${verdict}: ${higherLower}${clause}.`
      : `B did ${verdict}: ${higherLower}${clause}.`;
  return {
    difference,
    headline,
    detail: [...facts(a, b, rows), real].filter(Boolean).join(" "),
    spread: false,
  };
}

function scoreDifference(
  delta: number,
  row: MetricComparison | undefined,
): CompareVerdict["difference"] {
  if (delta === 0 || row?.verdict === "same") return { text: "the same score", verdict: "same" };
  const text = `${points(delta)} ${delta > 0 ? "higher" : "lower"}`;
  if (row?.verdict === "spread") return { text: `${text}, within spread`, verdict: "spread" };
  return { text, verdict: delta > 0 ? "better" : "worse" };
}

/** A level as the takeaways name it: "720p", or its bitrate when the two runs' ladders differ. */
function levelName(level: Level | undefined, mbps: boolean): string {
  if (!level) return "an unknown quality";
  if (mbps) return formatMbps(level.bitrate);
  return level.name ?? (level.height ? `${level.height}p` : formatMbps(level.bitrate));
}

/** The highest and lowest quality a run showed, and when it first reached the lowest. */
function qualitySpan(run: ComparedRun) {
  const levelOf = (index: number) => run.timeline.levels.find((level) => level.index === index);
  let top: Level | undefined;
  let low: { level: Level; t: number } | undefined;
  for (const change of run.timeline.shown) {
    const level = levelOf(change.level);
    if (!level) continue;
    if (!top || level.bitrate > top.bitrate) top = level;
    if (!low || level.bitrate < low.level.bitrate) low = { level, t: change.t };
  }
  return { top, low, startT: run.timeline.shown[0]?.t };
}

/** What the quality chart shows: where each run topped out, and how far down it went and when. */
export function qualityTakeaway(a: ComparedRun, b: ComparedRun, { mbps = false } = {}): string {
  const spanA = qualitySpan(a);
  const spanB = qualitySpan(b);
  if (!spanA.top && !spanB.top) return "Neither run showed a picture.";
  if (!spanA.top || !spanB.top) {
    const [shown, blank] = spanA.top ? ["A", "B"] : ["B", "A"];
    return `${blank} never showed a picture; ${shown} topped out at ${levelName(spanA.top ?? spanB.top, mbps)}.`;
  }
  const topA = levelName(spanA.top, mbps);
  const topB = levelName(spanB.top, mbps);
  const tops =
    topA === topB ? `Both topped out at ${topA}.` : `A topped out at ${topA}, B at ${topB}.`;
  // A run that started on its lowest quality never went down to it.
  const went = ({ top, low, startT }: ReturnType<typeof qualitySpan>) =>
    !low || !top || low.level.bitrate === top.bitrate
      ? `never left ${levelName(top, mbps)}`
      : low.t <= (startT ?? 0)
        ? `never went below ${levelName(low.level, mbps)}`
        : `went down to ${levelName(low.level, mbps)} at ${formatClock(low.t)}`;
  return `${tops} B ${went(spanB)}; A ${went(spanA)}.`;
}

/** What the buffer chart shows: how much each run held, and whether and when it ran dry. */
export function bufferTakeaway(a: ComparedRun, b: ComparedRun): string {
  const phrase = (run: ComparedRun) => {
    const most = Math.max(0, ...run.timeline.samples.bufferS);
    const dry = run.metrics.stalls.intervals[0];
    return `held up to ${formatDuration(most)} and ${dry ? `ran dry at ${formatClock(dry.start)}` : "never ran dry"}`;
  };
  return `B's buffer ${phrase(b)}. A's ${phrase(a)}.`;
}

/** What the stalls lanes show; `untilS` when the comparison covers only the start of the runs. */
export function stallsTakeaway(a: ComparedRun, b: ComparedRun, untilS?: number): string {
  const sentence = stallSentence(a, b);
  if (untilS === undefined) return sentence;
  return `${sentence.slice(0, -1)}, up to ${formatClock(untilS)}.`;
}

/** The quality on screen, from the first frame to the end, as the overlaid chart's label tells it. */
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

/** The overlaid bandwidth and quality chart's label. */
export function describeCompareQuality(a: ComparedRun, b: ComparedRun): string {
  const sameNetwork =
    JSON.stringify(a.run.setup.network.curve) === JSON.stringify(b.run.setup.network.curve);
  const network = sameNetwork
    ? `Both ran on the same network, ${networkRange(a)}.`
    : `A's network was ${networkRange(a)}; B's ${networkRange(b)}.`;
  return `${network} A ${onScreen(a)}; B ${onScreen(b)}.`;
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
