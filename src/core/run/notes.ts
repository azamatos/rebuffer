import { formatClock, formatDuration } from "@/core/format/time";
import { bandwidthAt, curveOutline, type NetworkCurve } from "@/core/netsim/curve-math";
import { formatRate, sampleAt } from "./chart-text";
import { levelLabel } from "./describe";
import type { Level } from "./events";
import type { OpenInterval, Timeline } from "./timeline";

/** One numbered note in the Report's "What happened", from `start` to `end` (seconds). */
export interface Note {
  start: number;
  end: number;
  text: string;
}

/** Switches in one direction at most this far apart tell one story. */
const GROUP_GAP_S = 20;
/** How far back a note looks for the network's low point. */
const LOOKBACK_S = 10;
/** An abandoned download this close to a group of down-switches belongs to its note. */
const ATTACH_S = 5;
/** More notes than this and the switches are summed up in one. */
const MAX_NOTES = 7;
/** A stretch with no signal shorter than this doesn't get a note of its own. */
const MIN_OUTAGE_S = 1;

interface Switch {
  t: number;
  from: number;
  to: number;
  up: boolean;
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/**
 * What the viewer went through, in a few numbered notes: the start, groups of quality switches, abandoned downloads
 * and stalls, each with the simulated network at the time. The notes state what the log shows and name a cause only
 * when the numbers show it (the network below the quality's bitrate, or no signal at all).
 */
export function whatHappened(timeline: Timeline, curve: NetworkCurve): Note[] {
  const endS = timeline.endS ?? timeline.samples.t.at(-1) ?? 0;
  const level = (index: number): Level | undefined =>
    timeline.levels.find((candidate) => candidate.index === index);
  const label = (index: number) => levelLabel(level(index), index);
  const name = (index: number) => level(index)?.name ?? label(index);
  const bitrate = (index: number) => level(index)?.bitrate ?? 0;
  const lowest = (from: number, to: number) =>
    Math.min(
      ...curveOutline(curve, Math.max(0, from), Math.max(from, to) + 1e-6).map((c) => c.bps),
    );
  const rate = (bps: number) => (bps <= 0 ? "0 Mbps (no signal)" : formatRate(bps));

  const firstFrameS = timeline.firstFrameS;
  if (firstFrameS === undefined) {
    const low = lowest(0, endS);
    const high = highest(curve, endS);
    return [
      {
        start: 0,
        end: endS,
        text: `The picture never appeared. The network ${low === high ? `stayed at ${rate(low)}` : `ranged from ${rate(low)} to ${rate(high)}`} over the run.`,
      },
    ];
  }

  const notes: Note[] = [];
  const first = timeline.shown[0];
  notes.push({
    start: 0,
    end: firstFrameS,
    text: `The first frame appeared at ${formatDuration(firstFrameS)}${first ? `, at ${label(first.level)}` : ""}.`,
  });

  // Quality switches, grouped by direction.
  const switches: Switch[] = timeline.shown.slice(1).map((change, i) => {
    const from = timeline.shown[i]?.level ?? change.level;
    return { t: change.t, from, to: change.level, up: bitrate(change.level) > bitrate(from) };
  });
  const groups: Switch[][] = [];
  for (const change of switches) {
    const group = groups.at(-1);
    const last = group?.at(-1);
    if (group && last && last.up === change.up && change.t - last.t <= GROUP_GAP_S)
      group.push(change);
    else groups.push([change]);
  }

  const abandoned = timeline.downloads.filter((download) => download.state === "abandoned");
  const attached = new Set<number>();
  const switchNotes: Note[] = groups.map((group) => {
    const start = group[0]?.t ?? 0;
    const end = group.at(-1)?.t ?? start;
    const from = group[0]?.from ?? 0;
    const to = group.at(-1)?.to ?? 0;
    const count = group.length > 1 ? ` in ${group.length} switches` : "";
    if (group[0]?.up) {
      return {
        start,
        end,
        text: `The player climbed from ${label(from)} to ${label(to)}${count}, with the network at ${rate(bandwidthAt(curve, end))}.`,
      };
    }
    const low = lowest(start - LOOKBACK_S, end);
    const estimate = sampleAt(timeline, timeline.samples.estimateBps, start);
    const context =
      low < bitrate(from)
        ? `The network had fallen to ${rate(low)}, below the ${formatRate(bitrate(from))} that ${name(from)} needs.`
        : `The network still carried at least ${rate(low)}, enough for ${name(from)}${estimate === undefined ? "." : `; the player's estimate was ${formatRate(estimate)}.`}`;
    const gaveUp = abandoned
      .map((download, index) => ({ download, index }))
      .filter(({ download }) => {
        const t = download.end ?? download.start;
        return t >= start - ATTACH_S && t <= end + ATTACH_S;
      });
    for (const { index } of gaveUp) attached.add(index);
    const wasted = gaveUp.reduce((sum, { download }) => sum + (download.bytes ?? 0), 0);
    const abandons =
      gaveUp.length === 0
        ? ""
        : ` It gave up on ${gaveUp.length === 1 ? `a ${name(gaveUp[0]?.download.level ?? 0)} download` : `${gaveUp.length} downloads`} on the way, wasting ${mb(wasted)}.`;
    return {
      start,
      end,
      text: `The player stepped down from ${label(from)} to ${label(to)}${count}. ${context}${abandons}`,
    };
  });

  const eventNotes: Note[] = [];
  // What each event note counts, for the summary when there are more notes than fit.
  const counted = new Map<Note, { stalls: number; abandons: number }>();
  const pushEvent = (note: Note, stalls: number, abandons: number) => {
    eventNotes.push(note);
    counted.set(note, { stalls, abandons });
  };
  abandoned.forEach((download, index) => {
    if (attached.has(index)) return;
    const t = download.end ?? download.start;
    pushEvent(
      {
        start: t,
        end: t,
        text: `The player gave up on a ${label(download.level)} download at ${formatClock(t, 1)}, wasting ${mb(download.bytes ?? 0)}. The network was at ${rate(bandwidthAt(curve, t))}.`,
      },
      0,
      1,
    );
  });

  const stallText = (stall: OpenInterval) => {
    const stallEnd = stall.end ?? endS;
    const open = stall.end === undefined || stall.end >= endS;
    return `stalled at ${formatClock(stall.start, 1)} for ${formatDuration(stallEnd - stall.start)}${open ? ", until the run ended" : ""}`;
  };

  // A stretch with no signal tells its own story: did the buffer carry playback through it?
  const inOutage = new Set<OpenInterval>();
  for (const outage of outages(curve, endS)) {
    if (outage.end - outage.start < MIN_OUTAGE_S || outage.end <= firstFrameS) continue;
    const stalls = timeline.stalls.filter(
      (stall) => stall.start >= outage.start && stall.start <= outage.end + ATTACH_S,
    );
    for (const stall of stalls) inOutage.add(stall);
    const before = sampleAt(timeline, timeline.samples.bufferS, outage.start);
    const sentences = [
      `No signal from ${formatClock(outage.start)} to ${formatClock(outage.end)} (${formatDuration(outage.end - outage.start)}).`,
    ];
    const first = stalls[0];
    if (!first) {
      const low = bufferLow(timeline, outage.start, outage.end);
      sentences.push(
        before === undefined || low === undefined
          ? "Playback carried on without a stall."
          : `The buffer ran down from ${formatDuration(before)} to ${formatDuration(low)}, and playback carried on without a stall.`,
      );
    } else {
      sentences.push(
        `${before === undefined ? "Playback" : `The buffer ran down from ${formatDuration(before)}, and playback`} ${stallText(first)}${stalls.length > 1 ? `, then ${stalls.length - 1} more ${stalls.length === 2 ? "time" : "times"}` : ""}.`,
      );
    }
    pushEvent(
      {
        start: outage.start,
        end: Math.max(outage.end, first?.end ?? 0),
        text: sentences.join(" "),
      },
      stalls.length,
      0,
    );
  }

  for (const stall of timeline.stalls) {
    if (inOutage.has(stall)) continue;
    const stallEnd = stall.end ?? endS;
    const sentences = [`Playback ${stallText(stall)}.`];
    const peak = bufferPeak(timeline, stall.start);
    if (peak && peak.bufferS >= 0.5) {
      sentences.push(
        `The buffer had run down from ${formatDuration(peak.bufferS)} at ${formatClock(peak.t)}.`,
      );
    }
    const net = bandwidthAt(curve, stall.start);
    const onScreen = timeline.shown.findLast((change) => change.t <= stall.start)?.level;
    if (onScreen !== undefined && net < bitrate(onScreen)) {
      sentences.push(
        `The network was at ${rate(net)}, below the ${formatRate(bitrate(onScreen))} of ${name(onScreen)} on screen.`,
      );
    } else {
      sentences.push(
        `The simulated network carried ${rate(net)} then, more than the quality on screen needs; the simulation check below says whether your real network held downloads back.`,
      );
    }
    pushEvent({ start: stall.start, end: stallEnd, text: sentences.join(" ") }, 1, 0);
  }

  if (switchNotes.length === 0 && eventNotes.length === 0 && first) {
    const high = highest(curve, endS);
    const low = lowest(0, endS);
    notes.push({
      start: firstFrameS,
      end: endS,
      text: `No stalls and no quality changes: ${label(first.level)} the whole way, with the network ${low === high ? `at ${rate(low)}` : `between ${rate(low)} and ${rate(high)}`}.`,
    });
  }

  let rest = [...switchNotes, ...eventNotes];
  if (notes.length + rest.length > MAX_NOTES && switchNotes.length > 1) {
    const qualities = timeline.shown.map((change) => change.level);
    const byBitrate = [...new Set(qualities)].sort((a, b) => bitrate(a) - bitrate(b));
    const start = switchNotes[0]?.start ?? 0;
    const end = switchNotes.at(-1)?.end ?? start;
    // The abandons the switch notes told of go into the summary, or no note would mention them.
    const gaveUp = abandoned.filter((_, index) => attached.has(index));
    const wasted = gaveUp.reduce((sum, download) => sum + (download.bytes ?? 0), 0);
    const abandons =
      gaveUp.length === 0
        ? ""
        : ` The player gave up on ${gaveUp.length === 1 ? "a download" : `${gaveUp.length} downloads`} on the way, wasting ${mb(wasted)}.`;
    rest = [
      {
        start,
        end,
        text: `The quality changed ${switches.length} times between ${formatClock(start)} and ${formatClock(end)}, between ${label(byBitrate[0] ?? 0)} and ${label(byBitrate.at(-1) ?? 0)}.${abandons}`,
      },
      ...eventNotes,
    ];
  }
  const all = [...notes, ...rest.sort((a, b) => a.start - b.start)];
  if (all.length <= MAX_NOTES) return all;
  // Too many to list: the last note sums up the rest, so nothing goes unmentioned.
  const left = all.slice(MAX_NOTES - 1);
  const from = left[0]?.start ?? 0;
  const to = Math.max(...left.map((note) => note.end));
  const stalls = left.reduce((sum, note) => sum + (counted.get(note)?.stalls ?? 0), 0);
  const abandons = left.reduce((sum, note) => sum + (counted.get(note)?.abandons ?? 0), 0);
  const parts = [
    stalls > 0 && `${stalls} more ${stalls === 1 ? "stall" : "stalls"}`,
    abandons > 0 && `${abandons} more abandoned ${abandons === 1 ? "download" : "downloads"}`,
  ].filter((part) => part !== false);
  const what = parts.length > 0 ? parts.join(" and ") : `${left.length} more events`;
  return [
    ...all.slice(0, MAX_NOTES - 1),
    {
      start: from,
      end: to,
      text: `From ${formatClock(from)} to ${formatClock(to)}, ${what}; the charts show each one.`,
    },
  ];
}

/** The most video buffered in the half minute before `t`, and when. */
function bufferPeak(timeline: Timeline, t: number): { t: number; bufferS: number } | undefined {
  const { t: times, bufferS } = timeline.samples;
  let peak: { t: number; bufferS: number } | undefined;
  for (let i = 0; i < times.length; i++) {
    const at = times[i] ?? 0;
    if (at < t - 30 || at > t) continue;
    const value = bufferS[i] ?? 0;
    if (!peak || value >= peak.bufferS) peak = { t: at, bufferS: value };
  }
  return peak;
}

function highest(curve: NetworkCurve, endS: number): number {
  return Math.max(...curveOutline(curve, 0, Math.max(endS, 1e-6)).map((corner) => corner.bps));
}

/** The least video buffered between `from` and `to`. */
function bufferLow(timeline: Timeline, from: number, to: number): number | undefined {
  const { t: times, bufferS } = timeline.samples;
  let low: number | undefined;
  for (let i = 0; i < times.length; i++) {
    const at = times[i] ?? 0;
    if (at < from || at > to) continue;
    low = Math.min(low ?? Infinity, bufferS[i] ?? 0);
  }
  return low;
}

/** The stretches with no signal at all up to `endS`: runs of consecutive corners at zero. */
function outages(curve: NetworkCurve, endS: number): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  let start: number | undefined;
  let end: number | undefined;
  for (const corner of curveOutline(curve, 0, Math.max(endS, 1e-6))) {
    if (corner.bps === 0) {
      start ??= corner.t;
      end = corner.t;
      continue;
    }
    if (start !== undefined && end !== undefined && end > start) found.push({ start, end });
    start = undefined;
    end = undefined;
  }
  if (start !== undefined && end !== undefined && end > start) found.push({ start, end });
  return found;
}
