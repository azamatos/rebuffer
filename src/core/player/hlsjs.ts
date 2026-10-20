import type {
  ErrorData,
  FragLoadedData,
  FragLoadEmergencyAbortedData,
  FragLoadingData,
} from "hls.js";
import type { RunEvent } from "@/core/run/events";
import { bufferAhead, levelsFromHls } from "./map";
import type { PlayerSettings } from "./settings";

/** Turns clock readings into run time (seconds since the run started). */
export interface RunClock {
  now(): number;
  /** Converts a `performance.now()` reading (ms), as hls.js stamps its load stats, to run time. */
  fromPerformance(ms: number): number;
}

export interface HlsJsOptions {
  video: HTMLVideoElement;
  url: string;
  settings: PlayerSettings;
  clock: RunClock;
  emit: (event: RunEvent) => void;
  /** How often to sample buffer, estimate and dropped frames. */
  sampleEveryMs?: number;
}

export interface PlayerHandle {
  readonly player: "hls.js";
  readonly version: string;
  destroy(): void;
}

/** PlaylistLevelType.MAIN is "main"; comparing the string keeps hls.js's enum values out of this module. */
function isMainPlaylist(type: string): boolean {
  return type === "main";
}

export class PlayerUnsupportedError extends Error {
  constructor() {
    super(
      "This browser can't play HLS through Media Source Extensions, so the lab can't run here.",
    );
    this.name = "PlayerUnsupportedError";
  }
}

/**
 * Plays `url` with hls.js and reports what happens as run events. hls.js is loaded on demand so it stays out of
 * the home page's JavaScript. The player keeps its own loader: the network is shaped by the Service Worker, so
 * hls.js measures and decides exactly as it would in production.
 */
export async function startHlsJs({
  video,
  url,
  settings,
  clock,
  emit,
  sampleEveryMs = 250,
}: HlsJsOptions): Promise<PlayerHandle> {
  const { default: Hls } = await import("hls.js");
  if (!Hls.isSupported()) throw new PlayerUnsupportedError();

  const hls = new Hls({ ...settings, lowLatencyMode: false });
  const STALLED: ErrorData["details"] = Hls.ErrorDetails.BUFFER_STALLED_ERROR;
  const cleanups: (() => void)[] = [];
  const listen = (type: keyof HTMLVideoElementEventMap, handler: () => void) => {
    video.addEventListener(type, handler);
    cleanups.push(() => {
      video.removeEventListener(type, handler);
    });
  };

  // --- player decisions -------------------------------------------------------------------------
  hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
    emit({ type: "levels", t: clock.now(), levels: levelsFromHls(data.levels) });
    void video.play().catch(() => {
      // Autoplay refused: the run is started by a click, so this only happens when the tab lost focus.
      emit({
        type: "error",
        t: clock.now(),
        fatal: false,
        message: "The browser blocked playback.",
      });
    });
  });
  hls.on(Hls.Events.LEVEL_SWITCHING, (_, data) => {
    emit({ type: "level-requested", t: clock.now(), level: data.level });
  });
  // hls.js fires LEVEL_SWITCHED when playback enters a fragment of a different level: what's on screen.
  hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
    emit({ type: "level-shown", t: clock.now(), level: data.level });
  });
  hls.on(Hls.Events.FRAG_LOADING, (_, data: FragLoadingData) => {
    const { frag } = data;
    if (!isMainPlaylist(frag.type) || frag.sn === "initSegment") return;
    emit({ type: "segment-loading", t: clock.now(), level: frag.level, sn: frag.sn });
  });
  hls.on(Hls.Events.FRAG_LOADED, (_, data: FragLoadedData) => {
    const { frag } = data;
    if (!isMainPlaylist(frag.type) || frag.sn === "initSegment") return;
    const { loading, loaded } = frag.stats;
    emit({
      type: "segment",
      t: clock.now(),
      level: frag.level,
      sn: frag.sn,
      bytes: loaded,
      mediaDuration: frag.duration,
      requestedAt: clock.fromPerformance(loading.start),
      firstByteAt: clock.fromPerformance(loading.first),
      loadedAt: clock.fromPerformance(loading.end),
    });
  });
  hls.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, (_, data: FragLoadEmergencyAbortedData) => {
    const { frag } = data;
    if (frag.sn === "initSegment") return;
    emit({
      type: "segment-abandoned",
      t: clock.now(),
      level: frag.level,
      sn: frag.sn,
      bytesLoaded: data.stats.loaded,
    });
  });
  hls.on(Hls.Events.ERROR, (_, data: ErrorData) => {
    // Stalls are measured from the video element; hls.js reports them as non-fatal errors too.
    if (data.details === STALLED) return;
    emit({ type: "error", t: clock.now(), fatal: data.fatal, message: data.error.message });
  });

  // --- what the viewer sees -------------------------------------------------------------------
  let firstFrameShown = false;
  let stalled = false;
  const markFirstFrame = () => {
    if (firstFrameShown) return;
    firstFrameShown = true;
    emit({ type: "first-frame", t: clock.now() });
  };
  if ("requestVideoFrameCallback" in video) {
    video.requestVideoFrameCallback(markFirstFrame);
  } else {
    listen("playing", markFirstFrame);
  }
  listen("waiting", () => {
    if (!firstFrameShown || stalled || video.seeking) return;
    stalled = true;
    emit({ type: "stall-start", t: clock.now() });
  });
  const resume = () => {
    if (!stalled) return;
    stalled = false;
    emit({ type: "stall-end", t: clock.now() });
  };
  listen("playing", resume);
  let lastPosition = 0;
  listen("timeupdate", () => {
    if (video.currentTime > lastPosition && !video.paused) resume();
    lastPosition = video.currentTime;
  });
  listen("ended", () => {
    emit({ type: "end", t: clock.now(), reason: "complete" });
  });

  const timer = setInterval(() => {
    const estimate = hls.bandwidthEstimate;
    emit({
      type: "sample",
      t: clock.now(),
      bufferS: bufferAhead(video.buffered, video.currentTime),
      estimateBps: Number.isFinite(estimate) && estimate > 0 ? estimate : undefined,
      droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
      position: video.currentTime,
    });
  }, sampleEveryMs);
  cleanups.push(() => {
    clearInterval(timer);
  });

  hls.loadSource(url);
  hls.attachMedia(video);

  return {
    player: "hls.js",
    version: Hls.version,
    destroy() {
      for (const cleanup of cleanups) cleanup();
      hls.destroy();
    },
  };
}
