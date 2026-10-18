import { startShaping, type ShapingOptions, type ShapingSession } from "@/core/netsim/client";
import type { NetworkCurve } from "@/core/netsim/curve";
import { ALL_OTHER_ORIGINS } from "@/core/netsim/protocol";
import { startHlsJs, type PlayerHandle, type RunClock } from "@/core/player/hlsjs";
import type { PlayerSettings } from "@/core/player/settings";
import type { RunEvent } from "./events";

/** Everything a run needs; also what a share link carries. */
export interface RunSetup {
  streamUrl: string;
  curve: NetworkCurve;
  settings: PlayerSettings;
}

export type EndReason = Extract<RunEvent, { type: "end" }>["reason"];

export interface RunResult {
  setup: RunSetup;
  events: RunEvent[];
  /** Epoch milliseconds at run time 0. */
  startedAt: number;
  player: { name: string; version: string };
  reason: EndReason;
}

export interface Run {
  /** The log so far; it only grows. */
  readonly events: readonly RunEvent[];
  readonly startedAt: number;
  /** Calls `listener` for every new event; returns a function that stops it. */
  subscribe(listener: (event: RunEvent) => void): () => void;
  /** Ends the run early. */
  stop(): void;
  /** Settles when the run ends: at the end of the network curve, the end of the video, a stop or a fatal error. */
  readonly finished: Promise<RunResult>;
}

export interface RunOptions {
  shaping?: ShapingOptions;
}

/**
 * Plays `setup.streamUrl` in `video` through the simulated network and records everything into one event log.
 * Run time 0 is the moment the network session starts, so the worker's request timings and the player's events
 * share one clock. The run lasts as long as the network curve, or until the video ends.
 */
export async function startRun(
  setup: RunSetup,
  video: HTMLVideoElement,
  options: RunOptions = {},
): Promise<Run> {
  const session: ShapingSession = await startShaping(
    setup.curve,
    [ALL_OTHER_ORIGINS],
    options.shaping,
  );
  const startedAt = session.startAt;
  const epochNow = () => performance.timeOrigin + performance.now();
  const clock: RunClock = {
    now: () => (epochNow() - startedAt) / 1000,
    fromPerformance: (ms) => (performance.timeOrigin + ms - startedAt) / 1000,
  };

  const events: RunEvent[] = [];
  const listeners = new Set<(event: RunEvent) => void>();
  let finish: (reason: EndReason) => void = () => undefined;

  const emit = (event: RunEvent) => {
    events.push(event);
    for (const listener of listeners) listener(event);
    if (event.type === "end") finish(event.reason);
    if (event.type === "error" && event.fatal) finish("error");
  };

  session.onRequestEvent((message) => {
    emit({
      type: "request",
      t: message.at,
      id: message.requestId,
      url: message.url,
      phase: message.phase,
      bytes: message.bytes,
      ...(message.totalBytes === undefined ? {} : { totalBytes: message.totalBytes }),
      lateMs: message.lateMs,
    });
  });
  session.onEnd((reason) => {
    if (reason === "lost") {
      emit({
        type: "error",
        t: clock.now(),
        fatal: true,
        message:
          "The browser stopped the network simulator, so the rest of the run wouldn't be shaped.",
      });
    }
  });

  let player: PlayerHandle | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const finished = new Promise<RunResult>((resolve) => {
    let done = false;
    finish = (reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (events.at(-1)?.type !== "end") {
        events.push({ type: "end", t: clock.now(), reason });
      }
      player?.destroy();
      void session.end();
      resolve({
        setup,
        events,
        startedAt,
        player: { name: player?.player ?? "hls.js", version: player?.version ?? "unknown" },
        reason,
      });
    };
  });

  try {
    player = await startHlsJs({
      video,
      url: setup.streamUrl,
      settings: setup.settings,
      clock,
      emit,
    });
  } catch (error) {
    await session.end();
    throw error;
  }
  timer = setTimeout(
    () => {
      emit({ type: "end", t: clock.now(), reason: "complete" });
    },
    Math.max(0, setup.curve.lengthS * 1000 - (epochNow() - startedAt)),
  );

  return {
    events,
    startedAt,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      emit({ type: "end", t: clock.now(), reason: "stopped" });
    },
    finished,
  };
}
