import { formatMbps } from "@/core/format/bitrate";
import { formatClock } from "@/core/format/time";
import {
  computeMetrics,
  computeScore,
  heldBack,
  partsTotal,
  type RunMetrics,
  type Score,
} from "@/core/metrics";
import { bandwidthAt } from "@/core/netsim/curve";
import type { RunSummary, SavedRun } from "@/core/persist/runs";
import {
  PLAYER_PRESETS,
  playerTitle,
  SETTINGS,
  type PlayerSettingKey,
  type PlayerSettings,
} from "@/core/player/settings";
import { sampleAt, shownAt } from "./chart-text";
import { eventsOfType, type Level, type RunEvent } from "./events";
import { playerChanges } from "./report";
import { buildTimeline, type Timeline } from "./timeline";

/**
 * Two saved runs side by side (the Compare screen): B read against A. A comparison has a verdict only when both runs
 * cover enough of the same stretch and both got the network they were set to; when one was stopped, both are read
 * over the stretch both covered. Every sentence is written from the numbers, by rules: what happened, when and how
 * much, never why.
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

/** Below this, a stretch's scores and stalls say little: the wait for the first frame outweighs the rest, seconds. */
export const MIN_COMPARED_S = 30;

/**
 * How much of the same stretch two runs need before their scores compare: 30 s, or half the shorter network (the
 * test streams run 20 s). Six seconds of two runs once scored 0 and 100 (2026-10-23).
 */
export function minComparedS(lengthA: number, lengthB: number): number {
  return Math.min(MIN_COMPARED_S, Math.min(lengthA, lengthB) / 2);
}

/**
 * How far apart repeat runs of one setup land, from the repeatability job (`pnpm repeat`, measured 2026-10-22; the
 * README and About quote it): scores within 1.7 points, first frames within 0.27 s (a fresh browser's first run is
 * the slow one), stall time within 0.08 s, the average bitrate within 0.05 Mbps, and the same stalls and switches. A
 * difference this small can't be told from the spread between runs, so it isn't called better or worse. Measured
 * over whole runs only.
 */
export const SPREAD = {
  scorePoints: 2,
  firstFrameS: 0.3,
  stallS: 0.1,
  bitrateBps: 100_000,
} as const;

// Words and numbers.

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
export const points = (count: number) => plural(Math.abs(count), "point", "points");
/** "+3", "−12", "0", with a real minus sign. */
export const signed = (value: number) =>
  value === 0 ? "0" : `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
/** "1.12 s" */
export const seconds2 = (value: number) => `${value.toFixed(2)} s`;
/** "2.45" */
export const mbps2 = (bps: number) => (bps / 1e6).toFixed(2);
/** "once", "twice", "3 times" */
export const times = (count: number) =>
  count === 1 ? "once" : count === 2 ? "twice" : `${count} times`;
/** The other side's name. */
export const other = (side: SideName): SideName => (side === "A" ? "B" : "A");

// The setups.

/** One way the setups differ. */
export interface SetupChange {
  label: string;
  a: string;
  b: string;
  /** For a player preset: the settings it changes, in a sentence. */
  detail?: string;
  /** For a player preset: the settings it changes, one per item ("buffer target 30 s → 10 s"). */
  settings?: string[];
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

/** Whether two runs ran on the same network: the same preset or drawing, unchanged. */
export function sameNetwork(a: SavedRun, b: SavedRun): boolean {
  return (
    a.setup.network.id === b.setup.network.id &&
    JSON.stringify(a.setup.network.curve) === JSON.stringify(b.setup.network.curve)
  );
}

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
  if (!sameNetwork(a, b)) {
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
        settings: list,
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

/** A run's player setup for people: "Low-memory TV", or "Defaults · abrEwmaFastVoD 1.5" with settings changed by hand. */
export function playerLabel(run: SavedRun): string {
  const [, ...changed] = playerTitle(run.setup.player.name, playerChanges(run)).split(" · ");
  return [run.setup.player.name, ...changed].join(" · ");
}

/** What didn't change, in a line: "The same in both: Tears of Steel, Train through a tunnel, Chrome on macOS." */
export function sameInBoth(a: SavedRun, changes: readonly SetupChange[]): string {
  const changed = new Set(changes.map((change) => change.label));
  const byHand = SETTING_KEYS.some((key) => changed.has(SETTINGS[key].label));
  const same = [
    !changed.has("Stream") && a.setup.streamName,
    !changed.has("Network") && a.setup.network.name,
    !changed.has("Player setup") && !byHand && playerLabel(a),
    !changed.has("Browser") && a.environment.browser,
  ].filter((item): item is string => typeof item === "string" && item !== "");
  return same.length === 0 ? "" : `The same in both: ${same.join(", ")}.`;
}

/** The setting a player's buffer fills to, seconds (hls.js's `maxBufferLength`). */
export function bufferTargetS(run: SavedRun): number {
  const fallback = SETTINGS.maxBufferLength.hlsjsDefault;
  return (
    run.setup.player.settings.maxBufferLength ?? (typeof fallback === "number" ? fallback : 30)
  );
}

// The two runs.

export type SideKey = "a" | "b";
export type SideName = "A" | "B";

/** One of the two runs, read for the comparison. */
export interface CompareSide {
  key: SideKey;
  name: SideName;
  run: SavedRun;
  /** When it ended, seconds. */
  endS: number;
  /** Its network's length: what it would have run, seconds. */
  lengthS: number;
  /** It ended before its network did: stopped, or broken off by an error. */
  stopped: boolean;
  /** The visitor's real network held its downloads back, so it played on less than the network it was set to. */
  held: boolean;
  whole: ComparedRun;
  /** The stretch compared: the whole run, or its first `untilS` seconds when a run was stopped. */
  over: ComparedRun;
  /** What the score's parts add up to over that stretch, before the score is held between 0 and 100, rounded. */
  total: number;
  /** The score over that stretch, as shown. */
  shown: number;
}

/**
 * - `compared`: a verdict, the score's parts, the other numbers.
 * - `too-short`: the runs share less than `minS`, so only what both reached compares.
 * - `held-back`: the real network held one run back or both: no verdict.
 */
export type CompareState = "compared" | "too-short" | "held-back";

export interface Comparison {
  a: CompareSide;
  b: CompareSide;
  state: CompareState;
  /** When a run was stopped: the stretch both cover, from the start to the earlier end. Undefined for whole runs. */
  untilS: number | undefined;
  /** How far both runs got: the earlier end, seconds. */
  sharedS: number;
  /** How much both need to cover before their scores compare, seconds. */
  minS: number;
  /** The time the timeline spans: the longer network, seconds. */
  lengthS: number;
  changes: SetupChange[];
  /** The runs played different streams: their qualities don't share an axis, so they read in Mbps. */
  streams: boolean;
  sameNetwork: boolean;
}

const shownScore = (score: Score) => Math.round(score.score);

function side(key: SideKey, run: SavedRun, untilS: number | undefined): CompareSide {
  const whole = compared(run);
  const over = untilS === undefined ? whole : compared(run, untilS);
  return {
    key,
    name: key === "a" ? "A" : "B",
    run,
    endS: runEndS(run),
    lengthS: run.setup.network.curve.lengthS,
    stopped: run.reason !== "complete",
    held: heldBack(whole.metrics.honesty),
    whole,
    over,
    total: Math.round(partsTotal(over.score)),
    shown: shownScore(over.score),
  };
}

/** Reads two saved runs for Compare: B against A. */
export function compareRuns(a: SavedRun, b: SavedRun): Comparison {
  const sharedS = Math.min(runEndS(a), runEndS(b));
  const stopped = a.reason !== "complete" || b.reason !== "complete";
  const untilS = stopped ? sharedS : undefined;
  const sideA = side("a", a, untilS);
  const sideB = side("b", b, untilS);
  const minS = minComparedS(sideA.lengthS, sideB.lengthS);
  return {
    a: sideA,
    b: sideB,
    state: sharedS < minS ? "too-short" : sideA.held || sideB.held ? "held-back" : "compared",
    untilS,
    sharedS,
    minS,
    lengthS: Math.max(sideA.lengthS, sideB.lengthS),
    changes: setupChanges(a, b),
    streams: a.setup.streamUrl !== b.setup.streamUrl,
    sameNetwork: sameNetwork(a, b),
  };
}

/** "Stopped at 0:41 of 1:30", or "1:30, played to the end". */
export function runStatus({ stopped, endS, lengthS }: CompareSide): string {
  return stopped
    ? `Stopped at ${formatClock(endS)} of ${formatClock(lengthS)}`
    : `${formatClock(lengthS)}, played to the end`;
}

/** A run's setup in a line: its player and network, and its stream when the two runs' streams differ. */
export function setupLine(c: Comparison, s: CompareSide): string {
  const { setup } = s.run;
  return `${c.streams ? `${setup.streamName} · ` : ""}${playerLabel(s.run)} · ${setup.network.name}`;
}

/** The page's title: what changed, A → B. */
export function compareTitle(c: Comparison): string {
  const { changes, a, b } = c;
  const [first] = changes;
  if (!first) return `${playerLabel(a.run)}, run twice`;
  const labels = changes.map((change) => change.label);
  if (changes.length === 1) return `${first.a} → ${first.b}`;
  if (changes.length === 2 && labels.includes("Network") && labels.includes("Player setup")) {
    return `${playerLabel(a.run)} → ${playerLabel(b.run)} on ${b.run.setup.network.name}`;
  }
  return `${first.a} → ${first.b}, and ${plural(changes.length - 1, "more change", "more changes")}`;
}

/** Under the title: what both share, and how far each got. */
export function compareSubtitle(c: Comparison): string {
  const changed = new Set(c.changes.map((change) => change.label));
  const { a, b } = c;
  const shared = [
    !changed.has("Stream") && a.run.setup.streamName,
    !changed.has("Network") && a.run.setup.network.name,
    !changed.has("Player setup") && playerLabel(a.run),
  ].filter((item): item is string => typeof item === "string");
  const ends =
    a.stopped && b.stopped
      ? `A stopped at ${formatClock(a.endS)}, B at ${formatClock(b.endS)}`
      : a.stopped || b.stopped
        ? `${a.stopped ? "A" : "B"} stopped at ${formatClock((a.stopped ? a : b).endS)} of ${formatClock((a.stopped ? a : b).lengthS)}`
        : a.lengthS === b.lengthS
          ? `both played to the end (${formatClock(a.lengthS)})`
          : "both played to the end";
  return [...shared, ends].join(" · ");
}

// The score, part by part.

export type PartKey = "quality" | "switching" | "stalls" | "startup";

export const PARTS: readonly { key: PartKey; label: string }[] = [
  { key: "quality", label: "Quality earned" },
  { key: "switching", label: "Quality switches" },
  { key: "stalls", label: "Stalls" },
  { key: "startup", label: "Wait for the first frame" },
];

/** A score's parts as points added: the picture earns, the rest cost. */
export function signedParts(score: Score): Record<PartKey, number> {
  return {
    quality: score.quality,
    switching: -score.switching,
    stalls: -score.stalls,
    startup: -score.startup,
  };
}

/**
 * B's parts minus A's, rounded so they add up exactly to the difference of the two rounded totals (largest
 * remainder), so the walk from A's total to B's never loses a point to rounding.
 */
export function partDeltas(a: Score, b: Score): Record<PartKey, number> {
  const partsA = signedParts(a);
  const partsB = signedParts(b);
  const exact = PARTS.map(({ key }) => partsB[key] - partsA[key]);
  const rounded = exact.map(Math.floor);
  let remaining =
    Math.round(partsTotal(b)) - Math.round(partsTotal(a)) - rounded.reduce((x, y) => x + y, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((x, y) => y.rest - x.rest);
  for (let k = 0; remaining > 0 && k < byRemainder.length; k++, remaining--) {
    const at = byRemainder[k]?.i ?? 0;
    rounded[at] = (rounded[at] ?? 0) + 1;
  }
  for (let k = byRemainder.length - 1; remaining < 0 && k >= 0; k--, remaining++) {
    const at = byRemainder[k]?.i ?? 0;
    rounded[at] = (rounded[at] ?? 0) - 1;
  }
  const result = {} as Record<PartKey, number>;
  PARTS.forEach(({ key }, i) => {
    result[key] = (rounded[i] ?? 0) + 0;
  });
  return result;
}

/** One step from A's total to B's. */
export interface WalkStep {
  key: PartKey;
  label: string;
  /** What was measured, in words. */
  fact: string;
  /** Points B gained (positive) or lost (negative) against A on this part. */
  delta: number;
  /** The running total before and after this step. */
  from: number;
  to: number;
}

/** A's or B's end of the walk. */
export interface WalkEnd {
  total: number;
  shown: number;
  fact: string;
}

export interface Walk {
  title: string;
  subtitle: string;
  a: WalkEnd;
  b: WalkEnd;
  steps: WalkStep[];
  /** The scale: 0–100, widened to whole fives when a total falls outside it. */
  lo: number;
  hi: number;
  /** A's shown score, shaded ± the spread on B's row: over whole runs only (the spread wasn't measured otherwise). */
  band: number | undefined;
}

/** "Its parts come to −5; a score stops at 0.", when the score is held. */
export function heldScoreNote(total: number): string {
  if (total < 0) return `Its parts come to ${signed(total)}; a score stops at 0.`;
  if (total > 100) return `Its parts come to ${total}; a score stops at 100.`;
  return "";
}

function stallsPhrase(metrics: RunMetrics): string {
  const { count, totalS } = metrics.stalls;
  if (count === 0) return "none";
  const share = (metrics.rebufferRatio * 100).toFixed(1);
  return `${plural(count, "stall", "stalls")}, ${totalS.toFixed(1)} s (${share}% of the time)`;
}

function firstFrameFact(a: RunMetrics, b: RunMetrics): string {
  const ffA = a.firstFrameS;
  const ffB = b.firstFrameS;
  if (ffA === undefined && ffB === undefined) return "Neither showed a picture";
  if (ffA === undefined) return `A never showed a picture · B ${seconds2(ffB ?? 0)}`;
  if (ffB === undefined) return `A ${seconds2(ffA)} · B never showed a picture`;
  const delta = ffB - ffA;
  const both = `A ${seconds2(ffA)} · B ${seconds2(ffB)}`;
  return Math.abs(delta) < SPREAD.firstFrameS
    ? `${both}: within the ${SPREAD.firstFrameS} s that repeat runs differ by`
    : `${both}: ${seconds2(Math.abs(delta))} ${delta < 0 ? "sooner" : "later"}`;
}

/** A quality by name ("720p"), or by bitrate when the runs played different streams. */
export function qualityName(level: Level | undefined, mbps: boolean): string {
  if (!level) return "an unknown quality";
  if (mbps) return formatMbps(level.bitrate);
  return level.name ?? (level.height ? `${level.height}p` : formatMbps(level.bitrate));
}

function partFact(c: Comparison, key: PartKey): string {
  const a = c.a.over;
  const b = c.b.over;
  const upTo = c.untilS === undefined ? "" : `, up to ${formatClock(c.untilS)}`;
  switch (key) {
    case "quality": {
      const average = (run: ComparedRun) =>
        run.metrics.averageBitrate === undefined ? "none" : mbps2(run.metrics.averageBitrate);
      const against = (run: ComparedRun) => run.score.against;
      const targets =
        against(a)?.bitrate !== against(b)?.bitrate && against(a) && against(b)
          ? `; scored against ${qualityName(against(a), false)} (${formatMbps(against(a)?.bitrate ?? 0)}) and ${qualityName(against(b), false)} (${formatMbps(against(b)?.bitrate ?? 0)})`
          : "";
      return `A ${average(a)} · B ${average(b)} Mbps on screen, on average${targets}`;
    }
    case "switching": {
      const switchesA = a.metrics.switches.total;
      const switchesB = b.metrics.switches.total;
      if (switchesA === switchesB) {
        return switchesA === 0 ? "None in either run" : `${switchesA} in each run`;
      }
      return `A ${switchesA} · B ${switchesB}`;
    }
    case "stalls":
      return a.metrics.stalls.count + b.metrics.stalls.count === 0
        ? `None in either run${upTo}`
        : `A ${stallsPhrase(a.metrics)} · B ${stallsPhrase(b.metrics)}`;
    case "startup":
      return firstFrameFact(a.metrics, b.metrics);
  }
}

/** "Where the points went": from A's score to B's, part by part, on one 0–100 scale. */
export function scoreWalk(c: Comparison): Walk {
  const { a, b, untilS } = c;
  const deltas = partDeltas(a.over.score, b.over.score);
  const steps: WalkStep[] = [];
  let running = a.total;
  for (const { key, label } of PARTS) {
    const delta = deltas[key];
    steps.push({ key, label, fact: partFact(c, key), delta, from: running, to: running + delta });
    running += delta;
  }
  const totals = [a.total, ...steps.map((step) => step.to)];
  const lowest = Math.min(...totals);
  const highest = Math.max(...totals);
  const lo = lowest < 0 ? Math.floor(lowest / 5) * 5 : 0;
  const hi = highest > 100 ? Math.ceil(highest / 5) * 5 : 100;

  const over = untilS === undefined ? "" : `, over the first ${formatClock(untilS)}`;
  const held = [a, b].filter((s) => s.total !== s.shown);
  const scoreDelta = b.shown - a.shown;
  const partsDelta = b.total - a.total;
  const heldText =
    held.length === 0
      ? ""
      : ` ${held
          .map(
            (s) =>
              `${s.name}’s parts come to ${signed(s.total)}, but a score stops at ${s.shown}, so it shows ${s.shown}.`,
          )
          .join(
            " ",
          )} That’s why the parts add up to ${signed(partsDelta)} while the scores differ by ${Math.abs(scoreDelta)}.`;
  const endFact = (s: CompareSide, fallback: string) =>
    heldScoreNote(s.total) ||
    (untilS === undefined ? fallback : `Over its first ${formatClock(untilS)}`);
  return {
    title:
      held.length > 0 || scoreDelta === 0
        ? "Where the points went"
        : `Where the ${points(scoreDelta)} went`,
    subtitle: `From A’s score to B’s, part by part${over}.${heldText}`,
    a: { total: a.total, shown: a.shown, fact: endFact(a, "") },
    b: {
      total: b.total,
      shown: b.shown,
      fact: endFact(b, `Shaded: A’s score ± ${SPREAD.scorePoints}, as much as repeat runs differ`),
    },
    steps,
    lo,
    hi,
    band: untilS === undefined ? a.shown : undefined,
  };
}

// The other numbers.

export interface Tile {
  label: string;
  value: string;
  note: string;
}

/** The numbers outside the score: a tile for each that differs, one line for the ones that don't. */
export function otherNumbers(c: Comparison): { tiles: Tile[]; same: string } {
  const a = c.a.over.metrics;
  const b = c.b.over.metrics;
  const tiles: Tile[] = [];
  const same: string[] = [];

  const averageA = a.averageBitrate;
  const averageB = b.averageBitrate;
  if (averageA !== undefined && averageB !== undefined) {
    const delta = averageB - averageA;
    const mbps1 = (bps: number) => (bps / 1e6).toFixed(1);
    if (Math.abs(delta) >= SPREAD.bitrateBps) {
      tiles.push({
        label: "Average bitrate",
        value: `${mbps1(Math.abs(delta))} Mbps ${delta > 0 ? "higher" : "lower"}`,
        note: `A ${mbps1(averageA)} · B ${mbps1(averageB)} Mbps`,
      });
    } else same.push(`average bitrate ${mbps1(averageA)} Mbps`);
  }

  const topA = Math.round(a.topQualityShare * 100);
  const topB = Math.round(b.topQualityShare * 100);
  if (topA !== topB) {
    tiles.push({
      label: "Time at the top quality",
      value: `${Math.abs(topB - topA)}% ${topB > topA ? "more" : "less"}`,
      note: `A ${topA}% · B ${topB}% of play time`,
    });
  } else same.push(`${topA}% of play time at ${c.streams ? "each stream’s" : "the"} top quality`);

  const megabytes = (bytes: number) => (bytes / 1e6).toFixed(1);
  const wastedA = Number(megabytes(a.wastedBytes));
  const wastedB = Number(megabytes(b.wastedBytes));
  if (Math.abs(wastedB - wastedA) >= 0.1) {
    tiles.push({
      label: "Wasted data",
      value: `${Math.abs(wastedB - wastedA).toFixed(1)} MB ${wastedB > wastedA ? "more" : "less"}`,
      note: `A ${wastedA.toFixed(1)} · B ${wastedB.toFixed(1)} MB downloaded, never shown`,
    });
  } else same.push(wastedA === 0 ? "no wasted data" : `${wastedA.toFixed(1)} MB of wasted data`);

  const all = same.length === 3;
  return {
    tiles,
    same:
      same.length === 0 ? "" : `${all ? "All the same" : "The same"} in both: ${same.join(", ")}.`,
  };
}

// What to do next.

/** Running again: which sides, and what the button says. */
export interface Again {
  sides: SideKey[];
  label: string;
  note: string;
}

/**
 * The runs worth running again: a stopped one (or both) to compare whole runs, one too short to score, or one the real
 * network held back. Undefined when nothing needs it.
 */
export function runAgain(c: Comparison): Again | undefined {
  const { a, b, state } = c;
  const sides = (
    state === "too-short"
      ? [a, b].filter((s) => s.endS < c.minS)
      : state === "held-back"
        ? [a, b].filter((s) => s.held)
        : c.untilS !== undefined
          ? [a, b].filter((s) => s.stopped)
          : []
  ).map((s) => s.key);
  const [first] = sides;
  if (!first) return undefined;
  const both = sides.length === 2;
  const toEnd = state === "too-short" ? ", to the end" : "";
  const name = first.toUpperCase();
  return {
    sides,
    label: `${both ? "Run both again" : `Run ${name} again`}${toEnd}`,
    note:
      state === "held-back"
        ? both
          ? "Same setups as A and B."
          : `Same setup as ${name}.`
        : both
          ? "A first, then B. It opens this comparison when B ends."
          : `Same setup as ${name}. It opens this comparison when it ends.`,
  };
}

/** The warning above everything when A and B differ in more than one thing, or in the stream. */
export interface CompareWarning {
  title: string;
  body: string;
  /** The run that would differ from A in one thing: B's player on A's network. */
  oneChange?: string;
}

export function compareWarning(c: Comparison): CompareWarning | undefined {
  const { changes, a, b } = c;
  const stream = changes.some((change) => change.label === "Stream");
  if (!stream && changes.length < 2) return undefined;
  const parts: string[] = [];
  if (stream) {
    parts.push(
      "Their qualities sit at different bitrates, so the quality rows are in Mbps and each run is scored against its own stream.",
    );
    const segmentA = a.over.metrics.segmentS;
    const segmentB = b.over.metrics.segmentS;
    if (segmentA && segmentB && Math.abs(segmentA - segmentB) >= 0.5) {
      const ratio = Number((segmentB / segmentA).toFixed(1));
      parts.push(
        `Scores count switches and waiting per segment, and B’s segments are ${Number(segmentB.toFixed(1))} s to A’s ${Number(segmentA.toFixed(1))} s: each second of waiting costs B ${ratio} times the points.`,
      );
    }
  }
  if (changes.length >= 2) {
    const named = changes.map((change) => change.label.toLowerCase());
    parts.push(
      `The ${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""} ${changes.length === 2 ? "both" : "all"} changed. This says how B did, not which change made the difference.`,
    );
  }
  const labels = changes.map((change) => change.label);
  const networkAndPlayer =
    changes.length === 2 && labels.includes("Network") && labels.includes("Player setup");
  return {
    title: changes.length >= 2 ? `A and B differ in ${changes.length} things` : "Different streams",
    body: parts.join(" "),
    ...(networkAndPlayer && {
      oneChange: `Run ${playerLabel(b.run)} on ${a.run.setup.network.name}`,
    }),
  };
}

// The timeline as a table.

export interface TimelineCell {
  network: number;
  shown: string;
  buffer: string;
}

export interface TimelineRow {
  t: number;
  a: TimelineCell;
  b: TimelineCell;
}

/** A step that gives about 20 rows. */
export function tableStep(lengthS: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((step) => lengthS / step <= 20) ?? 600;
}

function cellAt(c: Comparison, s: CompareSide, t: number): TimelineCell {
  const { timeline } = s.whole;
  const network = bandwidthAt(s.run.setup.network.curve, t);
  if (t > s.endS + 1e-9) return { network, shown: "not played", buffer: "not played" };
  const bufferS = sampleAt(timeline, timeline.samples.bufferS, t);
  const buffer = bufferS === undefined ? "—" : `${bufferS.toFixed(1)} s`;
  if (timeline.stalls.some((stall) => stall.start <= t && t < (stall.end ?? Infinity))) {
    return { network, shown: "Stalled", buffer };
  }
  const level = shownAt(timeline, t);
  if (level === undefined) return { network, shown: "Starting", buffer };
  const shown = qualityName(
    timeline.levels.find((candidate) => candidate.index === level),
    c.streams,
  );
  return { network, shown, buffer };
}

/** Both runs every few seconds: each one's network, the quality on screen and the buffer. */
export function timelineRows(c: Comparison): TimelineRow[] {
  const step = tableStep(c.lengthS);
  const rows: TimelineRow[] = [];
  for (let t = 0; t <= c.lengthS + 1e-9; t += step) {
    rows.push({ t, a: cellAt(c, c.a, t), b: cellAt(c, c.b, t) });
  }
  return rows;
}

// Choosing runs, from the summaries the lists keep.

const summaryStopped = (summary: RunSummary) => summary.stopped ?? false;
const summaryLength = (summary: RunSummary) => summary.networkLengthS ?? summary.lengthS;

/** A summary's player for people: "Low-memory TV", with settings changed by hand after it. */
export function summaryPlayer(summary: RunSummary): string {
  const [, ...changed] = (summary.playerTitle ?? summary.playerName).split(" · ");
  return [summary.playerName, ...changed].join(" · ");
}

/** How B's setup differs from A's, as the lists say it: "Network: Busy café Wi-Fi". */
export function summaryChanges(a: RunSummary, b: RunSummary): string[] {
  const changes: string[] = [];
  if ((a.streamUrl ?? a.streamName) !== (b.streamUrl ?? b.streamName))
    changes.push(`Stream: ${b.streamName}`);
  if (a.networkName !== b.networkName || summaryLength(a) !== summaryLength(b))
    changes.push(`Network: ${b.networkName}`);
  if (summaryPlayer(a) !== summaryPlayer(b)) changes.push(`Player setup: ${summaryPlayer(b)}`);
  return changes;
}

/** "Stopped at 0:41 of 1:30", or "1:30, played to the end". */
export function summaryStatus(summary: RunSummary): string {
  return summaryStopped(summary)
    ? `Stopped at ${formatClock(summary.lengthS)} of ${formatClock(summaryLength(summary))}`
    : `${formatClock(summaryLength(summary))}, played to the end`;
}

/**
 * A run's score as Compare would show it: "Not compared" when the real network held it back, "Too short to compare"
 * under the minimum, and the stretch a stopped run covers.
 */
export function summaryScore(summary: RunSummary): string {
  if (summary.heldBack) return "Not compared";
  const length = summaryLength(summary);
  if (summary.lengthS < minComparedS(length, length)) return "Too short to compare";
  const score = `${Math.round(summary.score)} / 100`;
  return summaryStopped(summary) ? `${score} over its ${formatClock(summary.lengthS)}` : score;
}

export interface PickRow {
  summary: RunSummary;
  /** How many other runs differ from it in one thing (choosing A). */
  near: number;
  /** How it differs from A (choosing B). */
  changes: string[];
}

export interface PickGroup {
  key: string;
  name: string;
  note: string;
  rows: PickRow[];
}

/** Runs to choose A from, grouped by stream and network so comparable runs sit together, newest group first. */
export function groupsForA(runs: readonly RunSummary[]): PickGroup[] {
  const groups = new Map<string, PickGroup>();
  for (const summary of runs) {
    const key = `${summary.streamName} · ${summary.networkName}`;
    const near = runs.filter(
      (candidate) => candidate.id !== summary.id && summaryChanges(summary, candidate).length === 1,
    ).length;
    const group = groups.get(key) ?? { key, name: key, note: "", rows: [] };
    group.rows.push({ summary, near, changes: [] });
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Runs to choose B from, by how many things differ from A: one first, the clearest comparisons. */
export function groupsForB(a: RunSummary, runs: readonly RunSummary[]): PickGroup[] {
  const groups: PickGroup[] = [
    { key: "one", name: "One thing different", note: "The clearest comparisons.", rows: [] },
    {
      key: "none",
      name: "Nothing different",
      note: "The same setup again: shows how much runs differ on their own.",
      rows: [],
    },
    {
      key: "more",
      name: "More than one thing different",
      note: "These can say how B did, not which change made the difference.",
      rows: [],
    },
    {
      key: "stream",
      name: "Another stream",
      note: "Different qualities, so only bitrates compare.",
      rows: [],
    },
  ];
  for (const summary of runs) {
    if (summary.id === a.id) continue;
    const changes = summaryChanges(a, summary);
    const key =
      changes.length === 0
        ? "none"
        : changes.some((change) => change.startsWith("Stream:"))
          ? "stream"
          : changes.length === 1
            ? "one"
            : "more";
    groups.find((group) => group.key === key)?.rows.push({ summary, near: 0, changes });
  }
  return groups.filter((group) => group.rows.length > 0);
}
