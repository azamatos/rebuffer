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
  /** The player started downloading a media segment. */
  | { type: "segment-loading"; t: number; level: number; sn: number }
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
      /** How long the real network kept the first byte waiting past the simulated RTT: its latency was higher. */
      firstByteLateMs: number;
      /** How long the real network kept later bytes waiting: it couldn't keep up with the simulated bandwidth. */
      bodyLateMs: number;
      /** When the real server's response arrived, once it has. */
      realFirstByteAt?: number;
      /** When the real server's last byte arrived, once it has. */
      realEndAt?: number;
    }
  /** The real network, measured just before the run without shaping: how fast the stream's host answers. */
  | {
      type: "network-check";
      t: number;
      host: string;
      /** Typical time to an answer once the connection is open, ms; undefined if the host didn't answer. */
      latencyMs: number | undefined;
      /** Every answer's time in order, ms; the first one also opened the connection. */
      samplesMs: readonly number[];
    }
  /** The tab went to the background or came back. Browsers slow down timers in background tabs. */
  | { type: "visibility"; t: number; hidden: boolean }
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
