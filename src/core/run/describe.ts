import { formatMbps } from "@/core/format/bitrate";
import { formatClock, formatDuration } from "@/core/format/time";
import { LATE_FIRST_BYTE_MS, type Honesty } from "@/core/metrics";
import type { NetworkCurve } from "@/core/netsim/curve";
import type { Level, RunEvent } from "./events";

/** A level for people: "720p (2.8 Mbps)". */
export function levelLabel(level: Level | undefined, index: number): string {
  if (!level) return `level ${index + 1}`;
  const name = level.name ?? (level.height ? `${level.height}p` : `level ${index + 1}`);
  return `${name} (${formatMbps(level.bitrate)})`;
}

export { formatMbps };

export interface LogLine {
  t: number;
  /** "0:51.8" */
  time: string;
  text: string;
  kind: "switch" | "stall" | "network" | "download" | "error" | "milestone";
}

/**
 * Turns the log into lines people read in the event list. Samples, routine downloads and the player's non-fatal
 * notices (technical, and recovered from on their own) are left out; switches, stalls, abandons, fatal errors and
 * milestones stay. Everything remains in the exported log. `levels` comes from the run's `levels` event.
 */
export function describeEvents(events: readonly RunEvent[]): LogLine[] {
  let levels: readonly Level[] = [];
  let shown: number | undefined;
  let stallStart: number | undefined;
  const lines: LogLine[] = [];
  const line = (t: number, kind: LogLine["kind"], text: string) =>
    lines.push({ t, time: formatClock(t, 1), text, kind });
  const label = (index: number) => levelLabel(levels[index], index);

  for (const event of events) {
    switch (event.type) {
      case "levels":
        levels = event.levels;
        line(event.t, "milestone", `Playlist loaded: ${levels.length} qualities.`);
        break;
      case "first-frame":
        line(event.t, "milestone", "First frame on screen.");
        break;
      case "level-shown": {
        if (shown !== undefined && shown !== event.level) {
          const up = (levels[event.level]?.bitrate ?? 0) > (levels[shown]?.bitrate ?? 0);
          line(event.t, "switch", `Switched ${up ? "up" : "down"} to ${label(event.level)}.`);
        } else if (shown === undefined) {
          line(event.t, "switch", `Playing ${label(event.level)}.`);
        }
        shown = event.level;
        break;
      }
      case "stall-start":
        stallStart = event.t;
        line(event.t, "stall", "Stall: the buffer ran out.");
        break;
      case "stall-end":
        line(
          event.t,
          "stall",
          `Playing again after ${stallStart === undefined ? "a stall" : `${(event.t - stallStart).toFixed(1)} s`}.`,
        );
        stallStart = undefined;
        break;
      case "segment-abandoned":
        line(
          event.t,
          "download",
          `Gave up on a ${label(event.level)} segment after ${(event.bytesLoaded / 1e6).toFixed(1)} MB.`,
        );
        break;
      case "error":
        if (event.fatal) line(event.t, "error", `Stopped: ${event.message}`);
        break;
      case "end":
        line(
          event.t,
          "milestone",
          event.reason === "complete"
            ? "Run finished."
            : event.reason === "stopped"
              ? "Run stopped."
              : "Run ended with an error.",
        );
        break;
      default:
        break;
    }
  }
  return lines;
}

const formatMs = (ms: number) => formatDuration(ms / 1000);

/**
 * A heads-up from the check before the run, when the real network answers slower than the simulated RTT: the
 * simulation can't start a download sooner than that. Undefined when there's nothing to say.
 */
export function describeNetworkCheck(
  check: Extract<RunEvent, { type: "network-check" }> | undefined,
  simulatedRttMs: number,
): string | undefined {
  if (check?.latencyMs === undefined || check.latencyMs <= simulatedRttMs + LATE_FIRST_BYTE_MS) {
    return undefined;
  }
  // Saved downloads don't wait for the real network; the result counts any that did.
  if (check.streamSaved) return undefined;
  return `Your real latency to ${check.host} is about ${Math.round(check.latencyMs)} ms, above the simulated ${simulatedRttMs} ms, so downloads can't start as soon as this network would start them. The result will say how much that mattered.`;
}

/**
 * Says in plain words whether the simulation held (AGENTS.md rule 2): whether downloads started late (the real
 * network took longer to answer than the simulated RTT), arrived late (the real network didn't deliver bytes as fast
 * as the simulation could send them), or the tab sat in the background. It names a cause only where the numbers
 * show one: a slow answer can come from distance, a cache miss or a busy connection alike.
 */
export function describeHonesty(honesty: Honesty, curve: NetworkCurve): string[] {
  const { requests, saved, latency, bandwidth, hiddenS } = honesty;
  const late = (count: number, verb: string, typicalMs: number, worstMs: number) =>
    `${count} of ${requests} downloads ${verb} late, typically by ${formatMs(typicalMs)} and at most ${formatMs(worstMs)}`;
  const sentences: string[] = [];
  const allSaved = requests > 0 && saved === requests;
  if (allSaved) {
    sentences.push(
      `All ${requests} downloads came from the copy saved in this browser by an earlier run, so your real network played no part.`,
    );
  } else if (saved > 0) {
    sentences.push(
      `${saved} of ${requests} downloads came from the copy saved in this browser by an earlier run; the other ${requests - saved} went over your real network.`,
    );
  }
  if (!allSaved && requests > 0 && latency.late === 0 && bandwidth.late === 0) {
    sentences.push(
      `Your connection kept up: all ${requests} downloads arrived before the simulation needed them.`,
    );
  }
  if (latency.late > 0) {
    sentences.push(
      `${late(latency.late, "started", latency.typicalLateMs, latency.worstLateMs)}: the real network took longer to answer than the simulated ${curve.rttMs} ms latency.`,
    );
    if (latency.realMs !== undefined) {
      sentences.push(
        `Measured before the run, ${latency.host ?? "the stream's host"} answered in about ${Math.round(latency.realMs)} ms.`,
      );
    }
  }
  if (bandwidth.late > 0) {
    const peakBps = Math.max(...curve.points.map((point) => point.mbps)) * 1e6;
    const { realBps } = bandwidth;
    const cause =
      realBps === undefined
        ? "the real network didn't deliver them as fast as the simulation could send them"
        : realBps < peakBps
          ? `the real network couldn't keep up with the simulated bandwidth (it delivered about ${formatMbps(realBps)} while downloading; the simulation goes up to ${formatMbps(peakBps)})`
          : `the real network paused partway through them, though on average it delivered about ${formatMbps(realBps)}, more than the simulated top speed of ${formatMbps(peakBps)}`;
    sentences.push(
      `${late(bandwidth.late, "arrived", bandwidth.typicalLateMs, bandwidth.worstLateMs)}: ${cause}.`,
      "This run is slower than the simulated network alone.",
    );
  } else if (latency.late > 0) {
    sentences.push("Once downloads started, your connection kept up.");
  }
  if (hiddenS > 0) {
    sentences.push(
      `The tab was in the background for ${formatDuration(hiddenS)}, where browsers slow down timers, so the player may have behaved differently than in a visible tab.`,
    );
  }
  return sentences;
}
