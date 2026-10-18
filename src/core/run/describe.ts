import { formatClock } from "@/core/format/time";
import type { Level, RunEvent } from "./events";

/** A level for people: "720p (2.8 Mbps)". */
export function levelLabel(level: Level | undefined, index: number): string {
  if (!level) return `level ${index + 1}`;
  const name = level.name ?? (level.height ? `${level.height}p` : `level ${index + 1}`);
  return `${name} (${formatMbps(level.bitrate)})`;
}

export function formatMbps(bitsPerSecond: number): string {
  const mbps = bitsPerSecond / 1e6;
  return mbps >= 10
    ? `${mbps.toFixed(0)} Mbps`
    : mbps >= 1
      ? `${mbps.toFixed(1)} Mbps`
      : `${Math.round(bitsPerSecond / 1000)} kbps`;
}

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
