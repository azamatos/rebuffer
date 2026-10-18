/**
 * The run's event log: everything the report is computed from. Times (`t`) are seconds since the run started.
 * The player adapter and the network shaper append events; nothing edits them afterwards.
 */

/** A quality level (rendition) as the player sees it. */
export interface Level {
  index: number;
  /** Declared peak bitrate (BANDWIDTH), bits per second. */
  bitrate: number;
  width?: number;
  height?: number;
  name?: string;
}

export type RunEvent =
  /** The player parsed the multivariant playlist. */
  | { type: "levels"; t: number; levels: readonly Level[] }
  /** The player decided to load a different level. */
  | { type: "level-requested"; t: number; level: number }
  /** A different level reached the screen. */
  | { type: "level-shown"; t: number; level: number }
  | { type: "first-frame"; t: number }
  /** Playback waits for data. Before the first frame this is startup, not a stall. */
  | { type: "stall-start"; t: number }
  | { type: "stall-end"; t: number }
  /** A media segment finished downloading. */
  | {
      type: "segment";
      t: number;
      level: number;
      sn: number;
      bytes: number;
      /** Seconds of media in the segment. */
      mediaDuration: number;
      requestedAt: number;
      firstByteAt: number;
      loadedAt: number;
    }
  /** The player gave up on a download half-way (an ABR abandon). */
  | { type: "segment-abandoned"; t: number; level: number; sn: number; bytesLoaded: number }
  /** Periodic sample of the player's state, about every 250 ms. */
  | {
      type: "sample";
      t: number;
      bufferS: number;
      estimateBps: number | undefined;
      droppedFrames: number;
      position: number;
    }
  /** One step of a download through the simulated network, as the Service Worker saw it. */
  | {
      type: "request";
      t: number;
      id: string;
      url: string;
      phase: "start" | "first-byte" | "end" | "abort" | "error";
      /** Bytes released to the player so far. */
      bytes: number;
      totalBytes?: number;
      /** How long the real network kept this request waiting while the simulated link was up. */
      lateMs: number;
    }
  | { type: "error"; t: number; fatal: boolean; message: string }
  | { type: "end"; t: number; reason: "complete" | "stopped" | "error" };

export type RunEventType = RunEvent["type"];

/** Narrows the log to one event type, keeping order. */
export function eventsOfType<K extends RunEventType>(
  events: readonly RunEvent[],
  type: K,
): Extract<RunEvent, { type: K }>[] {
  return events.filter((event): event is Extract<RunEvent, { type: K }> => event.type === type);
}
