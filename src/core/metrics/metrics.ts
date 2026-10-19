import { eventsOfType, type Level, type RunEvent } from "@/core/run/events";

export interface Interval {
  start: number;
  end: number;
}

/** What the viewer experienced during one run. Definitions: docs/memory-bank/productContext.md, "Metrics". */
export interface RunMetrics {
  /** Seconds from pressing Run to the first frame; undefined if playback never started. */
  firstFrameS: number | undefined;
  stalls: { count: number; totalS: number; intervals: Interval[] };
  /** Seconds the picture was moving. */
  playS: number;
  /** Stall time ÷ (play time + stall time), 0–1. */
  rebufferRatio: number;
  /** Time-weighted declared bitrate of the level on screen, bits per second. */
  averageBitrate: number | undefined;
  switches: { up: number; down: number; total: number };
  /** Share of play time at the highest level, 0–1. */
  topQualityShare: number;
  /** Bytes downloaded but never played (abandoned downloads). */
  wastedBytes: number;
  downloadedBytes: number;
  /** When the run ended, seconds. */
  endS: number;
  /** The ladder the player used. */
  levels: readonly Level[];
  /** The level on screen from each moment on, starting at the first frame. */
  shown: ShownChange[];
  /** Median media length of the downloaded segments, seconds. */
  segmentS: number | undefined;
  /** Whether the simulation held: downloads the visitor's real network delivered late. */
  honesty: Honesty;
}

/** Downloads count as late when the real network held their bytes back by more than this. */
export const LATE_MS = 50;
/** A download counts as started late past this: two of the shaper's 10 ms ticks, so its own rounding never counts. */
export const LATE_FIRST_BYTE_MS = 20;
/** Below this much busy time the real network's speed isn't worth stating. */
const MIN_BUSY_S = 0.1;

/** Where the visitor's real network or browser held the simulation back. */
export interface Honesty {
  /** Downloads through the simulated network. */
  requests: number;
  /** The real network answered slower than the simulated RTT, so downloads started late. */
  latency: {
    /** The stream's host and its latency measured before the run, ms (undefined if it didn't answer). */
    host: string | undefined;
    realMs: number | undefined;
    late: number;
    worstLateMs: number;
  };
  /** The real network couldn't keep up with the simulated bandwidth, so bytes arrived late mid-download. */
  bandwidth: {
    late: number;
    worstLateMs: number;
    /** What the real network delivered while it was downloading, bits per second. */
    realBps: number | undefined;
  };
  /** Seconds the tab spent in the background, where browsers slow down timers. */
  hiddenS: number;
}

/** From `t` on, `level` is on screen. */
export interface ShownChange {
  t: number;
  level: number;
}

export function computeMetrics(events: readonly RunEvent[]): RunMetrics {
  const endS = runEnd(events);
  const firstFrameS = eventsOfType(events, "first-frame")[0]?.t;
  const levels = eventsOfType(events, "levels").at(-1)?.levels ?? [];

  const stallIntervals = firstFrameS === undefined ? [] : stalls(events, firstFrameS, endS);
  const stallS = sum(stallIntervals.map(length));
  const playIntervals =
    firstFrameS === undefined ? [] : subtract({ start: firstFrameS, end: endS }, stallIntervals);
  const playS = sum(playIntervals.map(length));

  const shown = shownTimeline(events, firstFrameS ?? endS);
  const bitrateOf = (index: number) => levels.find((level) => level.index === index)?.bitrate;
  const top = topLevel(levels);

  let weightedBits = 0;
  let knownS = 0;
  let topS = 0;
  for (const interval of playIntervals) {
    for (const piece of piecesByLevel(shown, interval)) {
      const bitrate = bitrateOf(piece.level);
      if (bitrate === undefined) continue;
      weightedBits += bitrate * length(piece);
      knownS += length(piece);
      if (piece.level === top?.index) topS += length(piece);
    }
  }

  const abandoned = eventsOfType(events, "segment-abandoned");
  const wastedBytes = sum(abandoned.map((event) => event.bytesLoaded));

  return {
    firstFrameS,
    stalls: { count: stallIntervals.length, totalS: stallS, intervals: stallIntervals },
    playS,
    rebufferRatio: playS + stallS > 0 ? stallS / (playS + stallS) : 0,
    averageBitrate: knownS > 0 ? weightedBits / knownS : undefined,
    switches: countSwitches(shown, bitrateOf),
    topQualityShare: playS > 0 ? topS / playS : 0,
    wastedBytes,
    downloadedBytes: sum(eventsOfType(events, "segment").map((event) => event.bytes)) + wastedBytes,
    endS,
    levels,
    shown,
    segmentS: median(eventsOfType(events, "segment").map((event) => event.mediaDuration)),
    honesty: honesty(events, endS),
  };
}

type RequestEvent = Extract<RunEvent, { type: "request" }>;

function honesty(events: readonly RunEvent[], endS: number): Honesty {
  // Each shaped request's last event carries its final numbers.
  const lastById = new Map<string, RequestEvent>();
  for (const event of eventsOfType(events, "request")) lastById.set(event.id, event);
  const requests = [...lastById.values()];
  const check = eventsOfType(events, "network-check")[0];
  return {
    requests: requests.length,
    latency: {
      host: check?.host,
      realMs: check?.latencyMs,
      ...lateness(
        requests.map((request) => request.firstByteLateMs),
        LATE_FIRST_BYTE_MS,
      ),
    },
    bandwidth: {
      ...lateness(
        requests.map((request) => request.bodyLateMs),
        LATE_MS,
      ),
      realBps: realBitrate(requests),
    },
    hiddenS: sum(hiddenIntervals(events, endS).map(length)),
  };
}

function lateness(
  lates: readonly number[],
  thresholdMs: number,
): { late: number; worstLateMs: number } {
  return {
    late: lates.filter((lateMs) => lateMs > thresholdMs).length,
    worstLateMs: lates.reduce((worst, lateMs) => Math.max(worst, lateMs), 0),
  };
}

/**
 * The real network's speed: the bytes of finished downloads over the time it was busy with at least one of them,
 * so downloads that overlapped share it instead of counting twice.
 */
function realBitrate(requests: readonly RequestEvent[]): number | undefined {
  let bytes = 0;
  const busy: Interval[] = [];
  for (const request of requests) {
    if (request.phase !== "end") continue;
    if (request.realFirstByteAt === undefined || request.realEndAt === undefined) continue;
    bytes += request.totalBytes ?? request.bytes;
    busy.push({ start: request.realFirstByteAt, end: request.realEndAt });
  }
  const busyS = sum(union(busy).map(length));
  return busyS >= MIN_BUSY_S ? (bytes * 8) / busyS : undefined;
}

/** When the tab was in the background; if it still is at the end, until the end. */
function hiddenIntervals(events: readonly RunEvent[], endS: number): Interval[] {
  const intervals: Interval[] = [];
  let hiddenSince: number | undefined;
  for (const event of eventsOfType(events, "visibility")) {
    if (event.hidden) {
      hiddenSince ??= event.t;
    } else if (hiddenSince !== undefined) {
      intervals.push({ start: hiddenSince, end: event.t });
      hiddenSince = undefined;
    }
  }
  if (hiddenSince !== undefined) intervals.push({ start: hiddenSince, end: endS });
  return intervals.filter((interval) => interval.end > interval.start);
}

/** The level with the highest declared bitrate. */
export function topLevel(levels: readonly Level[]): Level | undefined {
  return levels.reduce<Level | undefined>(
    (best, level) => (best === undefined || level.bitrate > best.bitrate ? level : best),
    undefined,
  );
}

function runEnd(events: readonly RunEvent[]): number {
  const end = eventsOfType(events, "end")[0];
  if (end) return end.t;
  return events.reduce((latest, event) => Math.max(latest, event.t), 0);
}

/** Stall intervals after the first frame; one still open at the end is closed there. */
function stalls(events: readonly RunEvent[], firstFrameS: number, endS: number): Interval[] {
  const intervals: Interval[] = [];
  let openSince: number | undefined;
  for (const event of events) {
    if (event.t < firstFrameS || event.t > endS) continue;
    if (event.type === "stall-start" && openSince === undefined) openSince = event.t;
    if (event.type === "stall-end" && openSince !== undefined) {
      if (event.t > openSince) intervals.push({ start: openSince, end: event.t });
      openSince = undefined;
    }
  }
  if (openSince !== undefined && endS > openSince) intervals.push({ start: openSince, end: endS });
  return intervals;
}

/**
 * Which level is on screen from when. The level shown at the first frame is the last `level-shown` before it,
 * or, if the player reports it a moment later, the first one after it.
 */
function shownTimeline(events: readonly RunEvent[], firstFrameS: number): ShownChange[] {
  const changes = eventsOfType(events, "level-shown").map(({ t, level }) => ({ t, level }));
  const before = changes.filter((change) => change.t <= firstFrameS);
  const after = changes.filter((change) => change.t > firstFrameS);
  const initial = before.at(-1) ?? after[0];
  if (!initial) return [];
  const timeline = [{ t: firstFrameS, level: initial.level }];
  for (const change of after) {
    if (change === initial) continue;
    if (change.level !== timeline.at(-1)?.level) timeline.push(change);
  }
  return timeline;
}

function piecesByLevel(
  timeline: readonly ShownChange[],
  interval: Interval,
): (Interval & { level: number })[] {
  const pieces: (Interval & { level: number })[] = [];
  timeline.forEach((change, i) => {
    const start = Math.max(change.t, interval.start);
    const end = Math.min(timeline[i + 1]?.t ?? Number.POSITIVE_INFINITY, interval.end);
    if (end > start) pieces.push({ start, end, level: change.level });
  });
  return pieces;
}

/** Every change after the first entry happens after the first frame, so each one is a switch the viewer saw. */
function countSwitches(
  timeline: readonly ShownChange[],
  bitrateOf: (index: number) => number | undefined,
): RunMetrics["switches"] {
  let up = 0;
  let down = 0;
  for (let i = 1; i < timeline.length; i++) {
    const previous = timeline[i - 1];
    const current = timeline[i];
    if (!previous || !current) continue;
    const from = bitrateOf(previous.level) ?? previous.level;
    const to = bitrateOf(current.level) ?? current.level;
    if (to > from) up++;
    else if (to < from) down++;
  }
  return { up, down, total: up + down };
}

function union(intervals: readonly Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function subtract(whole: Interval, holes: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  let cursor = whole.start;
  for (const hole of [...holes].sort((a, b) => a.start - b.start)) {
    if (hole.start > cursor) result.push({ start: cursor, end: Math.min(hole.start, whole.end) });
    cursor = Math.max(cursor, hole.end);
  }
  if (whole.end > cursor) result.push({ start: cursor, end: whole.end });
  return result.filter((interval) => interval.end > interval.start);
}

function length(interval: Interval): number {
  return interval.end - interval.start;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
