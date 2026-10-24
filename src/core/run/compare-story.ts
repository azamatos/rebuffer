import { formatMbps } from "@/core/format/bitrate";
import { formatClock, formatDuration } from "@/core/format/time";
import { partsTotal } from "@/core/metrics";
import { bandwidthAt, curveOutline, type NetworkCurve } from "@/core/netsim/curve";
import { sampleAt, shownAt } from "./chart-text";
import {
  bufferTargetS,
  heldScoreNote,
  other,
  partDeltas,
  PARTS,
  playerLabel,
  points,
  qualityName,
  seconds2,
  signed,
  SPREAD,
  times,
  type ComparedRun,
  type Comparison,
  type CompareSide,
  type PartKey,
  type SideKey,
  type SideName,
} from "./compare";
import type { Level } from "./events";

/**
 * What Compare says in words: the verdict and its facts, the moments where the runs part ways, and what to look for
 * on the timeline. Facts only: what happened, when and how much. The data can't say why, so no sentence does.
 */

// Reading one run over the compared stretch.

interface Track {
  side: CompareSide;
  name: SideName;
  run: ComparedRun;
  /** The ladder, lowest bitrate first. */
  ladder: Level[];
  firstFrameS: number | undefined;
  endS: number;
  curve: NetworkCurve;
}

function track(side: CompareSide): Track {
  const { timeline } = side.over;
  return {
    side,
    name: side.name,
    run: side.over,
    ladder: [...timeline.levels].sort((x, y) => x.bitrate - y.bitrate),
    firstFrameS: timeline.firstFrameS,
    endS: timeline.endS ?? side.endS,
    curve: side.run.setup.network.curve,
  };
}

const levelOf = (t: Track, index: number | undefined) =>
  index === undefined ? undefined : t.run.timeline.levels.find((level) => level.index === index);

/** A level's place in its ladder, lowest 0; -1 when unknown. */
const rank = (t: Track, level: Level | undefined) =>
  level ? t.ladder.findIndex((candidate) => candidate.bitrate === level.bitrate) : -1;

const levelAt = (t: Track, at: number) => levelOf(t, shownAt(t.run.timeline, at));

const stalledAt = (t: Track, at: number) =>
  t.run.timeline.stalls.some((stall) => stall.start <= at && at < (stall.end ?? t.endS));

const bufferAt = (t: Track, at: number) =>
  sampleAt(t.run.timeline, t.run.timeline.samples.bufferS, at);

const mostBuffer = (t: Track) => Math.max(0, ...t.run.timeline.samples.bufferS);

/** Seconds a run showed `level` or better. */
function timeAtOrAbove(t: Track, level: Level): number {
  const { shown } = t.run.timeline;
  let total = 0;
  shown.forEach((change, i) => {
    const until = Math.min(shown[i + 1]?.t ?? t.endS, t.endS);
    const shownLevel = levelOf(t, change.level);
    if (shownLevel && shownLevel.bitrate >= level.bitrate) total += Math.max(0, until - change.t);
  });
  return total;
}

/** When a run first showed `level` or better. */
function firstReached(t: Track, level: Level): number | undefined {
  return t.run.timeline.shown.find((change) => {
    const shownLevel = levelOf(t, change.level);
    return shownLevel !== undefined && shownLevel.bitrate >= level.bitrate;
  })?.t;
}

/** The best quality both runs showed (the same stream: the same ladder). */
function bestShared(a: Track, b: Track): Level | undefined {
  const shownLevels = (t: Track) =>
    t.run.timeline.shown.map((change) => levelOf(t, change.level)).filter((level) => level);
  const bitratesB = new Set(shownLevels(b).map((level) => level?.bitrate));
  return shownLevels(a)
    .filter((level) => bitratesB.has(level?.bitrate))
    .sort((x, y) => (y?.bitrate ?? 0) - (x?.bitrate ?? 0))[0];
}

/** Stretches where the network carries nothing. */
export function noSignal(curve: NetworkCurve, from = 0, to = curve.lengthS): [number, number][] {
  const corners = curveOutline(curve, from, to);
  const stretches: [number, number][] = [];
  for (let i = 1; i < corners.length; i++) {
    const before = corners[i - 1];
    const after = corners[i];
    if (!before || !after || before.bps > 0 || after.bps > 0 || after.t <= before.t) continue;
    const last = stretches.at(-1);
    if (last && last[1] >= before.t) last[1] = after.t;
    else stretches.push([before.t, after.t]);
  }
  return stretches;
}

/** When the network first drops below where it starts; undefined if it never does. */
export function firstWeakens(curve: NetworkCurve): number | undefined {
  const corners = curveOutline(curve, 0, curve.lengthS);
  const start = corners[0]?.bps ?? 0;
  return corners.find((corner) => corner.bps < start)?.t;
}

/** "0.6 to 1.7 Mbps", "up to 6 Mbps", "6 Mbps throughout", over a stretch. */
function networkRange(curve: NetworkCurve, to: number): string {
  const rates = curveOutline(curve, 0, to).map((corner) => corner.bps);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  if (low === high) return `${formatMbps(high)} throughout`;
  if (low <= 0) return `up to ${formatMbps(high)}`;
  return `${formatMbps(low)} to ${formatMbps(high)}`;
}

const round = (value: number) => Math.round(value);

// The verdict.

export type Direction = "better" | "worse" | "same";

/** One run's score as the verdict shows it. */
export interface ScoreCell {
  side: SideKey;
  /** "whole run", "first 0:41", "0:06 played". */
  label: string;
  /** Undefined when it isn't compared. */
  score: number | undefined;
  /** When the score stops at 0 or 100: what its parts come to. */
  limit: string;
  /** Why it isn't compared, when it isn't. */
  why: string;
}

export interface CompareVerdict {
  title: string;
  /** How B's score reads against A's; undefined without a verdict. */
  direction: Direction | undefined;
  /** "12 points lower", "1 point lower, within spread". */
  difference: string;
  /** The biggest part pulling the other way: "Though its first frame came 0.74 s sooner: +3 points." */
  though: string;
  /** What happened, in a few facts. */
  facts: string;
  note: string;
  cells: [ScoreCell, ScoreCell];
}

const GAINS: Record<PartKey, (c: Comparison) => string> = {
  quality: () => "its picture earned more",
  switching: () => "it switched quality less",
  stalls: () => "it stalled less",
  startup: (c) => `its first frame came ${firstFrameGap(c)} sooner`,
};
const LOSSES: Record<PartKey, (c: Comparison) => string> = {
  quality: () => "its picture earned less",
  switching: () => "it switched quality more",
  stalls: () => "it stalled more",
  startup: (c) => `its first frame came ${firstFrameGap(c)} later`,
};

function firstFrameGap(c: Comparison): string {
  const a = c.a.over.metrics.firstFrameS ?? 0;
  const b = c.b.over.metrics.firstFrameS ?? 0;
  return seconds2(Math.abs(b - a));
}

/** The biggest part, of at least 3 points, that pulls against the overall direction. */
function thoughLine(c: Comparison, direction: Direction): string {
  if (direction === "same") return "";
  const deltas = partDeltas(c.a.over.score, c.b.over.score);
  const against = PARTS.map(({ key }) => ({ key, delta: deltas[key] }))
    .filter(({ delta }) => (direction === "better" ? delta <= -3 : delta >= 3))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
  if (!against) return "";
  const phrase = (against.delta > 0 ? GAINS : LOSSES)[against.key](c);
  return `Though ${phrase}: ${signed(against.delta)} points.`;
}

function scoreCell(c: Comparison, s: CompareSide): ScoreCell {
  const over = c.untilS === undefined ? "whole run" : `first ${formatClock(c.untilS)}`;
  if (c.state === "too-short") {
    if (s.endS < c.minS) {
      return {
        side: s.key,
        label: `${formatClock(s.endS)} played`,
        score: undefined,
        limit: "",
        why: `Played ${formatClock(s.endS)} of the ${formatClock(c.minS)} needed`,
      };
    }
    const total = round(partsTotal(s.whole.score));
    return {
      side: s.key,
      label: s.stopped ? `over its ${formatClock(s.endS)}` : "whole run",
      score: round(s.whole.score.score),
      limit: heldScoreNote(total),
      why: "",
    };
  }
  if (c.state === "held-back" && s.held) {
    return {
      side: s.key,
      label: over,
      score: undefined,
      limit: "",
      why: "Held back by your network",
    };
  }
  return { side: s.key, label: over, score: s.shown, limit: heldScoreNote(s.total), why: "" };
}

/** The real network's part when it slowed answers or the tab was hidden, short of holding a run back. */
function realNetworkNote(c: Comparison): string {
  const slow = [c.a, c.b].filter((s) => {
    const { honesty } = s.whole.metrics;
    return honesty.latency.late > 0 || honesty.hiddenS > 0;
  });
  if (slow.length === 0) return "";
  const who = slow.length === 2 ? "both runs" : (slow[0]?.name ?? "");
  return ` Your real network or browser slowed ${who} at times (see the simulation check), so part of the difference may be theirs.`;
}

export function compareVerdict(c: Comparison): CompareVerdict {
  const { a, b, state, untilS } = c;
  const cells: [ScoreCell, ScoreCell] = [scoreCell(c, a), scoreCell(c, b)];
  if (state === "too-short") {
    const short = [a, b].filter((s) => s.endS < c.minS);
    const [only] = short;
    const stopped =
      short.length === 2
        ? `A was stopped at ${formatClock(a.endS)} and B at ${formatClock(b.endS)}`
        : only
          ? `${only.name} was stopped at ${formatClock(only.endS)}${
              only.whole.metrics.firstFrameS === undefined
                ? ""
                : `, ${formatDuration(only.endS - only.whole.metrics.firstFrameS)} after its first frame`
            }`
          : "";
    const weakens = c.sameNetwork ? firstWeakens(a.run.setup.network.curve) : undefined;
    const stoppedThere = short.find((s) => weakens !== undefined && Math.abs(s.endS - weakens) < 1);
    return {
      title: "Too short to compare",
      direction: undefined,
      difference: "",
      though: "",
      facts: `${stopped}. Scores are compared once both runs have played ${formatClock(c.minS)}: before that, a score is mostly the wait for the first frame.`,
      note:
        weakens === undefined || weakens >= c.lengthS
          ? ""
          : `This network first weakens at ${formatClock(weakens)}${stoppedThere ? `, where ${stoppedThere.name} stopped` : ""}.`,
      cells,
    };
  }
  if (state === "held-back") {
    const held = [a, b].filter((s) => s.held);
    const late = (s: CompareSide) => s.whole.metrics.honesty.bandwidth.late;
    const of = (s: CompareSide) => s.whole.metrics.honesty.requests;
    const [only] = held;
    const facts =
      held.length === 2
        ? `Your real network held back downloads in both runs: ${late(a)} of A’s ${of(a)} and ${late(b)} of B’s ${of(b)}. Part of each result is your connection’s, so the two can’t be set against each other.`
        : only
          ? `Your real network held back ${late(only)} of ${only.name}’s ${of(only)} downloads, so ${only.name} played on less than ${only.run.setup.network.name} gives. Part of any difference would be your connection’s, not ${playerLabel(only.run)}’s.`
          : "";
    return {
      title: "Can’t compare these",
      direction: undefined,
      difference: "",
      though: "",
      facts,
      note: "Runs compare once each gets the network it was set to.",
      cells,
    };
  }

  const delta = b.shown - a.shown;
  const direction: Direction =
    Math.abs(delta) <= SPREAD.scorePoints ? "same" : delta > 0 ? "better" : "worse";
  const over = untilS === undefined ? "" : ` over the first ${formatClock(untilS)}`;
  const word = c.streams
    ? direction === "better"
      ? "B scored higher"
      : "B scored lower"
    : direction === "better"
      ? "B did better"
      : "B did worse";
  const title =
    direction === "same"
      ? untilS === undefined
        ? "No real difference"
        : `About the same${over}`
      : `${word}${over}`;
  const difference =
    direction === "same"
      ? delta === 0
        ? "The same score"
        : `${points(delta)} ${delta > 0 ? "higher" : "lower"}, within spread`
      : `${points(delta)} ${delta > 0 ? "higher" : "lower"}`;

  const extra: string[] = [];
  if (!c.sameNetwork && !c.streams) {
    const target = (s: CompareSide) => qualityName(s.over.score.against, false);
    extra.push(
      target(a) === target(b)
        ? `Each score is measured against the best its own network could carry: ${target(a)} for both here.`
        : `Each score is measured against the best its own network could carry: ${target(a)} for A, ${target(b)} for B.`,
    );
  }
  if (c.changes.length >= 2) {
    extra.push(`With ${c.changes.length} changes, it can’t be pinned on any one of them.`);
  }
  if (c.streams) extra.push("The streams differ, so treat it as rough.");
  if (untilS !== undefined && c.sameNetwork) {
    const curve = a.run.setup.network.curve;
    const after = noSignal(curve, untilS, curve.lengthS)[0];
    const stopped = [a, b].find((s) => s.stopped && Math.abs(s.endS - untilS) < 1e-6);
    if (after && noSignal(curve, 0, untilS).length === 0 && stopped) {
      extra.push(
        `The stretch with no signal starts at ${formatClock(after[0])}, after ${stopped.name} stopped.`,
      );
    }
  }
  const extras = extra.length > 0 ? ` ${extra.join(" ")}` : "";
  const spread = SPREAD.scorePoints;
  const note =
    untilS !== undefined
      ? `Repeat runs of one setup differ by about ${spread} points over a whole run; over the first ${formatClock(untilS)} nobody has measured it. Take this as a lead, and run both to the end to know.${extras}`
      : direction === "same"
        ? `Repeat runs of one setup differ by about ${spread} points on their own${delta === 0 ? "" : `; ${Math.abs(delta)} is inside that`}.${extras}`
        : `${points(delta)} is more than the ${spread} that repeat runs of one setup differ by on their own.${extras}`;

  return {
    title,
    direction,
    difference,
    though: thoughLine(c, direction),
    facts: verdictFacts(c),
    note: `${note}${realNetworkNote(c)}`,
    cells,
  };
}

/** "B stalled once, for 3.4 s at 0:52; A didn't stall." */
function stallFact(c: Comparison, a: Track, b: Track): string {
  const upTo = c.untilS === undefined ? "" : ` before ${formatClock(c.untilS)}`;
  const stalls = (t: Track) => t.run.metrics.stalls;
  const phrase = (t: Track) => {
    const { count, totalS, intervals } = stalls(t);
    const first = intervals[0];
    return count === 1 && first
      ? `stalled once, for ${formatDuration(totalS)} at ${formatClock(first.start)}`
      : `stalled ${times(count)}, ${formatDuration(totalS)} in all`;
  };
  const countA = stalls(a).count;
  const countB = stalls(b).count;
  if (countA === 0 && countB === 0) return `Neither stalled${upTo}.`;
  if (countA === 0) return `B ${phrase(b)}; A didn’t stall.`;
  if (countB === 0) return `A ${phrase(a)}; B didn’t stall.`;
  return `B ${phrase(b)}; A ${phrase(a)}.`;
}

function qualityFact(c: Comparison, a: Track, b: Track): string {
  const best = c.streams ? undefined : bestShared(a, b);
  if (best) {
    const timeA = round(timeAtOrAbove(a, best));
    const timeB = round(timeAtOrAbove(b, best));
    if (timeA !== timeB) {
      const top = rank(a, best) === a.ladder.length - 1 ? "" : " or above";
      return `B was at ${qualityName(best, false)}${top} for ${timeB} s, A for ${timeA} s.`;
    }
  }
  const average = (t: Track) => t.run.metrics.averageBitrate ?? 0;
  return `B showed ${formatMbps(average(b))} on average, A ${formatMbps(average(a))}.`;
}

function firstFrameFact(a: Track, b: Track): string {
  if (a.firstFrameS === undefined || b.firstFrameS === undefined) {
    if (a.firstFrameS === undefined && b.firstFrameS === undefined)
      return "Neither showed a picture.";
    return `${a.firstFrameS === undefined ? "A" : "B"} never showed a picture.`;
  }
  const gap = b.firstFrameS - a.firstFrameS;
  const startA = levelAt(a, a.firstFrameS);
  const startB = levelAt(b, b.firstFrameS);
  const at =
    startA?.bitrate !== startB?.bitrate && startB ? ` at ${qualityName(startB, false)}` : "";
  return `B showed its first frame${at} ${seconds2(Math.abs(gap))} ${gap < 0 ? "sooner" : "later"}.`;
}

/** Whether two runs showed the same qualities, changing within a second of each other. */
function inStep(a: Track, b: Track): boolean {
  const steps = (t: Track) =>
    t.run.timeline.shown.map((change) => ({
      t: change.t,
      bitrate: levelOf(t, change.level)?.bitrate,
    }));
  const stepsA = steps(a);
  const stepsB = steps(b);
  return (
    stepsA.length === stepsB.length &&
    stepsA.every((step, i) => {
      const theirs = stepsB[i];
      return (
        theirs !== undefined && theirs.bitrate === step.bitrate && Math.abs(theirs.t - step.t) <= 1
      );
    })
  );
}

/** What happened, in two or three facts: the parts that moved most, biggest first. */
export function verdictFacts(c: Comparison): string {
  const a = track(c.a);
  const b = track(c.b);
  const deltas = partDeltas(c.a.over.score, c.b.over.score);
  const moved = PARTS.map(({ key }) => ({ key, size: Math.abs(deltas[key]) }))
    .filter(({ size }) => size >= 1)
    .sort((x, y) => y.size - x.size)
    .slice(0, c.sameNetwork ? 3 : 2);
  const sentences: string[] = [];
  if (!c.sameNetwork) {
    sentences.push(
      `B’s network gave ${networkRange(b.curve, b.endS)}; A’s ${networkRange(a.curve, a.endS)}.`,
    );
  }
  const targetA = bufferTargetS(c.a.run);
  const targetB = bufferTargetS(c.b.run);
  if (
    targetA !== targetB &&
    moved.some(({ key }) => key === "stalls" || key === "quality") &&
    Math.abs(mostBuffer(a) - mostBuffer(b)) >= 3
  ) {
    const [lower, higher] = mostBuffer(a) < mostBuffer(b) ? [a, b] : [b, a];
    const target = bufferTargetS(lower.side.run);
    sentences.push(
      mostBuffer(lower) <= target + 1
        ? `${lower.name}’s buffer stayed at ${round(mostBuffer(lower))} s or under, the target its player setup sets; ${higher.name}’s reached ${round(mostBuffer(higher))} s.`
        : `${lower.name}’s buffer held up to ${round(mostBuffer(lower))} s; ${higher.name}’s up to ${round(mostBuffer(higher))} s.`,
    );
  }
  for (const { key } of moved) {
    if (key === "stalls") sentences.push(stallFact(c, a, b));
    if (key === "startup") sentences.push(firstFrameFact(a, b));
    if (key === "quality") sentences.push(qualityFact(c, a, b));
    if (key === "switching") {
      const switchesA = a.run.metrics.switches.total;
      const switchesB = b.run.metrics.switches.total;
      sentences.push(
        switchesA === switchesB
          ? `Both changed quality ${times(switchesA)}, B in ${deltas.switching < 0 ? "bigger" : "smaller"} steps.`
          : `B changed quality ${times(switchesB)} to A’s ${switchesA}.`,
      );
    }
  }
  if (Math.abs(c.b.shown - c.a.shown) <= SPREAD.scorePoints && inStep(a, b)) {
    return [
      ...sentences.filter((sentence) => sentence.startsWith("B’s network")),
      `The two runs changed quality at the same moments, within a second of each other${
        a.run.metrics.stalls.count + b.run.metrics.stalls.count === 0 ? ", and neither stalled" : ""
      }.`,
      ...(a.firstFrameS !== undefined && b.firstFrameS !== undefined
        ? [
            `B’s first frame came ${seconds2(Math.abs(b.firstFrameS - a.firstFrameS))} ${b.firstFrameS < a.firstFrameS ? "before" : "after"} A’s.`,
          ]
        : []),
    ].join(" ");
  }
  const kept = sentences.slice(0, 3);
  if (!moved.some(({ key }) => key === "stalls")) kept.push(stallFact(c, a, b));
  if (moved.length === 0 && a.firstFrameS !== undefined && b.firstFrameS !== undefined) {
    const gap = b.firstFrameS - a.firstFrameS;
    kept.unshift(
      `B’s first frame came ${seconds2(Math.abs(gap))} ${gap < 0 ? "before" : "after"} A’s, and their scores’ parts differ by less than a point each.`,
    );
  }
  return kept.join(" ");
}

// Where they differ.

export interface Moment {
  t: number;
  side: SideKey;
  text: string;
}

function firstFrameMoments(a: Track, b: Track): Moment[] {
  if (a.firstFrameS === undefined || b.firstFrameS === undefined) {
    const shown = a.firstFrameS === undefined ? b : a;
    if (shown.firstFrameS === undefined) return [];
    return [
      {
        t: shown.firstFrameS,
        side: shown.side.key,
        text: `${shown.name}’s first frame. ${other(shown.name)} never showed a picture.`,
      },
    ];
  }
  const gap = Math.abs(a.firstFrameS - b.firstFrameS);
  if (gap < SPREAD.firstFrameS) return [];
  const [early, late] = a.firstFrameS <= b.firstFrameS ? [a, b] : [b, a];
  const earlyAt = early.firstFrameS ?? 0;
  const lateAt = late.firstFrameS ?? 0;
  const startEarly = qualityName(levelAt(early, earlyAt), false);
  if (gap >= 2) {
    return [
      { t: earlyAt, side: early.side.key, text: `${early.name}’s first frame, at ${startEarly}.` },
      {
        t: lateAt,
        side: late.side.key,
        text: `${late.name}’s first frame, ${seconds2(gap)} after ${early.name}’s.`,
      },
    ];
  }
  return [
    {
      t: earlyAt,
      side: early.side.key,
      text: `${early.name}’s first frame, at ${startEarly}, ${seconds2(gap)} before ${late.name}’s.`,
    },
  ];
}

function reachedMoments(a: Track, b: Track): Moment[] {
  const best = bestShared(a, b);
  if (!best) return [];
  const reachA = firstReached(a, best);
  const reachB = firstReached(b, best);
  if (reachA === undefined || reachB === undefined || Math.abs(reachA - reachB) < 2) return [];
  const [early, late] = reachA <= reachB ? [a, b] : [b, a];
  const earlyAt = Math.min(reachA, reachB);
  const lateAt = Math.max(reachA, reachB);
  const name = qualityName(best, false);
  const lateThen = levelAt(late, earlyAt);
  return [
    {
      t: earlyAt,
      side: early.side.key,
      text: `${early.name} reached ${name}. ${late.name} ${lateThen ? `was at ${qualityName(lateThen, false)}` : "hadn’t shown a picture yet"}.`,
    },
    {
      t: lateAt,
      side: late.side.key,
      text: `${late.name} reached ${name}, ${round(lateAt - earlyAt)} s after ${early.name}.`,
    },
  ];
}

/** The first time one run steps down below where the other stays, for 3 s or more. */
function partingMoment(c: Comparison, x: Track, y: Track): Moment | undefined {
  const { shown } = x.run.timeline;
  for (let i = 1; i < shown.length; i++) {
    const change = shown[i];
    const before = shown[i - 1];
    if (!change || !before) continue;
    const now = levelOf(x, change.level);
    const was = levelOf(x, before.level);
    const theirs = levelAt(y, change.t);
    if (!now || !was || !theirs || now.bitrate >= was.bitrate) continue;
    if (theirs.bitrate <= now.bitrate || stalledAt(y, change.t)) continue;
    const theirNext = y.run.timeline.shown.find((candidate) => candidate.t > change.t);
    if (theirNext && theirNext.t - change.t < 3) continue;
    const next = shown[i + 1];
    const further = next && levelOf(x, next.level);
    const deeper =
      next && further && further.bitrate < now.bitrate && next.t < (theirNext?.t ?? y.endS)
        ? `, and to ${qualityName(further, c.streams)} at ${formatClock(next.t)}`
        : "";
    const until = theirNext && theirNext.t < y.endS ? ` until ${formatClock(theirNext.t)}` : "";
    const fell =
      c.sameNetwork &&
      curveOutline(x.curve, Math.max(0, change.t - 3), change.t + 0.01).some(
        (corner, k, corners) => k > 0 && corner.bps < (corners[k - 1]?.bps ?? 0),
      )
        ? bandwidthAt(x.curve, change.t) <= 0
          ? "The network lost its signal. "
          : `The network fell to ${formatMbps(bandwidthAt(x.curve, change.t))}. `
        : "";
    return {
      t: change.t,
      side: x.side.key,
      text: `${fell}${x.name} went down to ${qualityName(now, c.streams)}${deeper}. ${y.name} stayed at ${qualityName(theirs, c.streams)}${until}.`,
    };
  }
  return undefined;
}

function bufferMoment(a: Track, b: Track): Moment | undefined {
  const mostA = mostBuffer(a);
  const mostB = mostBuffer(b);
  const [high, low] = mostA >= mostB ? [a, b] : [b, a];
  const most = Math.max(mostA, mostB);
  const least = Math.min(mostA, mostB);
  if (most < 5 || least > most * 0.6 || most - least < 3) return undefined;
  const { t: at, bufferS } = high.run.timeline.samples;
  const reached = at[bufferS.findIndex((value) => value >= most * 0.95)];
  if (reached === undefined) return undefined;
  return {
    t: reached,
    side: high.side.key,
    text: `${high.name}’s buffer reached ${round(most)} s. ${low.name}’s stayed at ${round(least)} s.`,
  };
}

function stallMoments(x: Track, y: Track): Moment[] {
  return x.run.timeline.stalls.slice(0, 3).map((stall) => {
    const end = stall.end ?? x.endS;
    const dark = noSignal(x.curve).find(([from, to]) => from <= stall.start && stall.start < to);
    const where = dark
      ? `, ${round(stall.start - dark[0])} s into the stretch with no signal`
      : `, its network at ${formatMbps(bandwidthAt(x.curve, stall.start))}`;
    const theirs = bufferAt(y, stall.start);
    const them =
      stall.start > y.endS || y.firstFrameS === undefined || stall.start < y.firstFrameS
        ? ""
        : stalledAt(y, stall.start)
          ? ` ${y.name} stalled then too.`
          : theirs === undefined
            ? ""
            : ` ${y.name} had ${round(theirs)} s of video ahead.`;
    return {
      t: stall.start,
      side: x.side.key,
      text: `${x.name} stalled for ${formatDuration(end - stall.start)}${where}.${them}`,
    };
  });
}

/** Moments where the two runs part ways, in time order, numbered on the timeline. */
export function moments(c: Comparison): Moment[] {
  if (c.state === "held-back") return [];
  const a = track(c.a);
  const b = track(c.b);
  const found: Moment[] = [
    ...firstFrameMoments(a, b),
    ...(c.streams ? [] : reachedMoments(a, b)),
    ...[partingMoment(c, a, b), partingMoment(c, b, a)].filter((m): m is Moment => m !== undefined),
    ...[bufferMoment(a, b)].filter((m): m is Moment => m !== undefined),
    ...stallMoments(a, b),
    ...stallMoments(b, a),
  ].sort((x, y) => x.t - y.t);
  const kept = found.slice(0, 6);
  // A stopped run ends its row: say so, and whether the runs matched up to there.
  for (const s of [c.a, c.b]) {
    if (!s.stopped || s.endS >= c.lengthS) continue;
    const earlier = kept.filter((m) => m.t <= s.endS).length;
    const dark = noSignal(s.run.setup.network.curve).find(
      ([from]) => from > s.endS && from - s.endS <= 5,
    );
    const before = dark
      ? `, ${plainSeconds(dark[0] - s.endS)} before the stretch with no signal`
      : "";
    kept.push({
      t: s.endS,
      side: s.key,
      text: `${s.name} was stopped${before}.${earlier === 0 ? " Up to here the two runs match." : ""}`,
    });
  }
  return kept.sort((x, y) => x.t - y.t);
}

const plainSeconds = (value: number) => (round(value) === 1 ? "a second" : `${round(value)} s`);

/** What "Where they differ" says when it lists nothing. */
export function noMoments(c: Comparison): string {
  if (c.state !== "held-back") return "Nowhere by more than a second.";
  const held = [c.a, c.b].filter((s) => s.held);
  return held.length === 2
    ? "Not listed: part of both runs is your network’s doing."
    : `Not listed: part of ${held[0]?.name ?? "B"}’s run is your network’s doing, so a difference here wouldn’t say what the setup did.`;
}

/** The line above the timeline: what to look for. */
export function lookFor(c: Comparison, found: readonly Moment[]): string {
  const { a, b } = c;
  if (c.state === "held-back") {
    const held = [a, b].filter((s) => s.held);
    const [only] = held;
    return held.length === 2 || !only
      ? "Both rows are what the runs got, your network’s delays included. The blue row is what was simulated."
      : `${only.name}’s row is what ${only.name} got, your network’s delays included. The blue row is what was simulated.`;
  }
  if (c.state === "too-short") {
    const short = [a, b].filter((s) => s.endS < c.minS);
    const [only] = short;
    return short.length === 2 || !only
      ? "Both rows end early."
      : `${only.name}’s row ends at ${formatClock(only.endS)}. Nothing after it can be compared.`;
  }
  if (c.untilS !== undefined) {
    const until = formatClock(c.untilS);
    if (a.stopped && b.stopped) {
      const [first, then] = a.endS <= b.endS ? [a, b] : [b, a];
      return `${first.name}’s row ends at ${until}. ${then.name}’s is faded after that: it isn’t counted.`;
    }
    const going = a.stopped ? b : a;
    return `Right of the dashed line at ${until} is ${going.name} alone; it isn’t counted.`;
  }
  if (c.streams)
    return "Quality is in Mbps here because the streams’ qualities differ: compare heights, not names.";
  if (!c.sameNetwork) return "The networks differ, so each run has its own blue row.";
  const deltas = partDeltas(a.over.score, b.over.score);
  const biggest = PARTS.map(({ key }) => ({ key, size: Math.abs(deltas[key]) })).sort(
    (x, y) => y.size - x.size,
  )[0];
  if (found.length === 0 && Math.abs(b.shown - a.shown) <= SPREAD.scorePoints) {
    return "The two rows match step for step.";
  }
  if (!biggest || biggest.size < 1) {
    return found.length === 0
      ? "The two rows match step for step."
      : "The numbered markers show where the two rows part ways.";
  }
  switch (biggest.key) {
    case "stalls":
      return "Look at the red bars, where a picture stopped, and at each purple buffer just before.";
    case "startup":
      return "Look at where each green line starts: the first frame.";
    case "quality":
      return "Look at the green lines: where each run steps down, and how far.";
    case "switching":
      return "Count the steps in each green line.";
  }
}

// When the scores can't be compared.

export interface ShortRow {
  label: string;
  value: string;
  note: string;
}

/** What a stretch too short to score can still tell: what both runs reached. */
export function shortRows(c: Comparison): ShortRow[] {
  const a = track(c.a);
  const b = track(c.b);
  const rows: ShortRow[] = [];
  if (a.firstFrameS !== undefined && b.firstFrameS !== undefined) {
    const gap = Math.abs(b.firstFrameS - a.firstFrameS);
    rows.push({
      label: "First frame",
      value: `A ${seconds2(a.firstFrameS)} · B ${seconds2(b.firstFrameS)}`,
      note:
        gap < SPREAD.firstFrameS
          ? `${seconds2(gap)} apart: within the ${SPREAD.firstFrameS} s that repeat runs differ by`
          : `B’s came ${seconds2(gap)} ${b.firstFrameS < a.firstFrameS ? "sooner" : "later"}`,
    });
  }
  const until = c.sharedS;
  const steps = (t: Track) =>
    t.run.timeline.shown
      .filter((change) => change.t <= until)
      .map((change, i) => {
        const name = qualityName(levelOf(t, change.level), c.streams);
        return i === 0 ? name : `${name} from ${formatClock(change.t)}`;
      })
      .join(", ");
  const stepsA = steps(a);
  const stepsB = steps(b);
  if (stepsA || stepsB) {
    rows.push({
      label: "Quality on screen",
      value:
        stepsA === stepsB ? `Both: ${stepsA}` : `A: ${stepsA || "none"} · B: ${stepsB || "none"}`,
      note:
        stepsA === stepsB
          ? `The same up to ${formatClock(until)}`
          : `They differ before ${formatClock(until)}`,
    });
  }
  const bufferA = bufferAt(a, until);
  const bufferB = bufferAt(b, until);
  if (bufferA !== undefined && bufferB !== undefined && Math.abs(bufferA - bufferB) >= 3) {
    const [lower] = bufferA < bufferB ? [a] : [b];
    const target = bufferTargetS(lower.side.run);
    rows.push({
      label: "Buffer",
      value: `At ${formatClock(until)}: A ${round(bufferA)} s · B ${round(bufferB)} s`,
      note:
        mostBuffer(lower) <= target + 1 && target < bufferTargetS((lower === a ? b : a).side.run)
          ? `${lower.name}’s stayed at ${target} s or under: the target its player setup sets`
          : `${lower.name}’s held less`,
    });
  }
  const short = [c.a, c.b].filter((s) => s.endS < c.minS);
  rows.push({
    label: "Score",
    value: "Not compared",
    note:
      short.length === 2
        ? `Both played less than the ${formatClock(c.minS)} needed: A ${formatClock(c.a.endS)}, B ${formatClock(c.b.endS)}`
        : `${short[0]?.name ?? "B"} played ${formatClock(short[0]?.endS ?? 0)} of the ${formatClock(c.minS)} needed`,
  });
  return rows;
}

/** When the real network held a run back: what to do, and what the visitor's connection delivered. */
export function heldBackText(c: Comparison): { text: string; note: string } {
  const held = [c.a, c.b].filter((s) => s.held);
  const both = held.length === 2;
  const rates = held
    .map((s) => s.whole.metrics.honesty.bandwidth.realBps)
    .filter((bps): bps is number => bps !== undefined);
  const peak = Math.max(
    ...held.map((s) => Math.max(...s.run.setup.network.curve.points.map((point) => point.mbps))),
  );
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  const delivered =
    rates.length === 0
      ? ""
      : ` While downloading, yours delivered about ${low === high ? formatMbps(low) : `${formatMbps(low).replace(" Mbps", "")} to ${formatMbps(high)}`}; this network goes up to ${formatMbps(peak * 1e6)}.`;
  return {
    text: both
      ? "Run both again. It runs A, then B, and opens this comparison when B ends."
      : `Run ${held[0]?.name ?? "B"} again. It opens this comparison when it ends.`,
    note: `The simulation can only slow your connection down.${delivered}`,
  };
}
