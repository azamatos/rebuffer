import type { ShownChange } from "@/core/metrics";
import type { Level, RunEvent } from "./events";

/** One video segment download, as the downloads chart draws it. */
export interface Download {
  level: number;
  sn: number;
  start: number;
  /** When it finished or was given up; undefined while it's loading. */
  end: number | undefined;
  state: "loading" | "done" | "abandoned";
  /** All its bytes when done, what had arrived when abandoned; undefined while loading. */
  bytes: number | undefined;
}

/** A stretch of time that may not have ended yet. */
export interface OpenInterval {
  start: number;
  end: number | undefined;
}

/**
 * What the charts draw, built one event at a time: a live run appends every event as it happens and never rescans
 * its log. Samples sit in parallel number arrays, so a long run doesn't allocate an object per sample.
 */
export interface Timeline {
  levels: readonly Level[];
  samples: {
    t: number[];
    bufferS: number[];
    /** NaN until the player has an estimate. */
    estimateBps: number[];
  };
  /** The level on screen from each moment on, starting at the first frame (as in the metrics). */
  shown: ShownChange[];
  /** Stalls after the first frame; the last one is open while it lasts. */
  stalls: OpenInterval[];
  /** Video segment downloads in the order they started. */
  downloads: Download[];
  firstFrameS: number | undefined;
  /** When the run ended; undefined while it runs. */
  endS: number | undefined;
  /** The level the player reported before the first frame; it's the one on screen when the picture appears. */
  shownBeforeFirstFrame: number | undefined;
}

export function createTimeline(): Timeline {
  return {
    levels: [],
    samples: { t: [], bufferS: [], estimateBps: [] },
    shown: [],
    stalls: [],
    downloads: [],
    firstFrameS: undefined,
    endS: undefined,
    shownBeforeFirstFrame: undefined,
  };
}

export function buildTimeline(events: readonly RunEvent[]): Timeline {
  const timeline = createTimeline();
  for (const event of events) addEvent(timeline, event);
  return timeline;
}

/** The download of segment `sn` at `level` that hasn't finished yet, newest first. */
function unfinished(timeline: Timeline, level: number, sn: number): Download | undefined {
  return timeline.downloads.findLast(
    (download) => download.level === level && download.sn === sn && download.state !== "done",
  );
}

function showLevel(timeline: Timeline, t: number, level: number): void {
  if (timeline.shown.at(-1)?.level !== level) timeline.shown.push({ t, level });
}

export function addEvent(timeline: Timeline, event: RunEvent): void {
  if (timeline.endS !== undefined) return;
  switch (event.type) {
    case "levels":
      timeline.levels = event.levels;
      break;
    case "sample":
      timeline.samples.t.push(event.t);
      timeline.samples.bufferS.push(event.bufferS);
      timeline.samples.estimateBps.push(event.estimateBps ?? Number.NaN);
      break;
    case "first-frame":
      if (timeline.firstFrameS !== undefined) break;
      timeline.firstFrameS = event.t;
      if (timeline.shownBeforeFirstFrame !== undefined) {
        showLevel(timeline, event.t, timeline.shownBeforeFirstFrame);
      }
      break;
    case "level-shown":
      if (timeline.firstFrameS === undefined) timeline.shownBeforeFirstFrame = event.level;
      else
        showLevel(
          timeline,
          timeline.shown.length === 0 ? timeline.firstFrameS : event.t,
          event.level,
        );
      break;
    case "stall-start": {
      // Waiting before the first frame is startup, not a stall.
      const last = timeline.stalls.at(-1);
      if (timeline.firstFrameS === undefined || (last && last.end === undefined)) break;
      timeline.stalls.push({ start: event.t, end: undefined });
      break;
    }
    case "stall-end": {
      const last = timeline.stalls.at(-1);
      if (last && last.end === undefined) last.end = event.t;
      break;
    }
    case "segment-loading": {
      // The player loads one video segment at a time: one still loading when the next starts was given up.
      const previous = timeline.downloads.at(-1);
      if (previous?.state === "loading") {
        previous.end = event.t;
        previous.state = "abandoned";
      }
      timeline.downloads.push({
        level: event.level,
        sn: event.sn,
        start: event.t,
        end: undefined,
        state: "loading",
        bytes: undefined,
      });
      break;
    }
    case "segment": {
      const download = unfinished(timeline, event.level, event.sn);
      const done = {
        start: event.requestedAt,
        end: event.loadedAt,
        state: "done",
        bytes: event.bytes,
      } as const;
      if (download) Object.assign(download, done);
      else timeline.downloads.push({ level: event.level, sn: event.sn, ...done });
      break;
    }
    case "segment-abandoned": {
      const download = unfinished(timeline, event.level, event.sn);
      if (!download) break;
      download.end = download.end ?? event.t;
      download.state = "abandoned";
      download.bytes = event.bytesLoaded;
      break;
    }
    case "end":
      timeline.endS = event.t;
      for (const stall of timeline.stalls) stall.end ??= event.t;
      for (const download of timeline.downloads) {
        if (download.state === "loading") download.end = event.t;
      }
      break;
    default:
      break;
  }
}
