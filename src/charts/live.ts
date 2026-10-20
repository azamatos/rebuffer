import type { NetworkCurve } from "@/core/netsim/curve";
import type { RunEvent } from "@/core/run/events";
import { addEvent, createTimeline, type Timeline } from "@/core/run/timeline";
import {
  drawBuffer,
  drawDownloads,
  drawNetwork,
  fitCanvas,
  readTheme,
  type ChartTheme,
  type Frame,
  type Painter,
} from "./draw";

export interface RunChartCanvases {
  network: HTMLCanvasElement;
  buffer: HTMLCanvasElement;
  downloads: HTMLCanvasElement;
}

/**
 * The run charts, as the screen sees them. Live data goes straight from the run's events into a timeline and onto
 * the canvases every animation frame; nothing passes through React (AGENTS.md rule 3).
 */
export interface RunCharts {
  /** Starts drawing a new run from scratch; `now` gives its run time in seconds. */
  follow(now: () => number): void;
  /** Adds one event of the run being followed. Its `end` event stops the animation and draws the result. */
  add(event: RunEvent): void;
  /** Draws a finished run from its whole log at once (the Report). */
  show(events: readonly RunEvent[]): void;
  destroy(): void;
}

/**
 * Draws `curve` and the runs that follow on three canvases. Until a run starts, the network chart previews the whole
 * curve. Drawing pauses with the tab (no animation frames there) and catches up when it's back.
 */
export function mountRunCharts(canvases: RunChartCanvases, curve: NetworkCurve): RunCharts {
  let timeline: Timeline = createTimeline();
  let clock: (() => number) | undefined;
  let frameId = 0;
  const theme: ChartTheme = readTheme(canvases.network);
  const painters = new Map<HTMLCanvasElement, Painter | undefined>();
  const fit = (canvas: HTMLCanvasElement) => {
    painters.set(canvas, fitCanvas(canvas));
  };

  const isLive = () => clock !== undefined && timeline.endS === undefined;

  const draw = () => {
    const live = isLive();
    const now =
      live && clock ? Math.min(Math.max(0, clock()), curve.lengthS) : (timeline.endS ?? 0);
    const frame: Frame = { timeline, curve, now, live };
    const network = painters.get(canvases.network);
    const buffer = painters.get(canvases.buffer);
    const downloads = painters.get(canvases.downloads);
    if (network) drawNetwork(network, theme, frame);
    if (buffer) drawBuffer(buffer, theme, frame);
    if (downloads) drawDownloads(downloads, theme, frame);
  };

  const loop = () => {
    draw();
    frameId = isLive() ? requestAnimationFrame(loop) : 0;
  };

  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLCanvasElement) fit(entry.target);
    }
    draw();
  });
  for (const canvas of [canvases.network, canvases.buffer, canvases.downloads]) {
    fit(canvas);
    resize.observe(canvas);
  }
  draw();
  // Labels use Space Mono; redraw once it has loaded.
  void document.fonts.ready.then(draw);

  return {
    follow(now) {
      cancelAnimationFrame(frameId);
      timeline = createTimeline();
      clock = now;
      frameId = requestAnimationFrame(loop);
    },
    add(event) {
      addEvent(timeline, event);
      // A hidden tab gets no animation frames: draw the end now so the result is there when it comes back.
      if (event.type === "end") draw();
    },
    show(events) {
      cancelAnimationFrame(frameId);
      clock = undefined;
      timeline = createTimeline();
      for (const event of events) addEvent(timeline, event);
      draw();
    },
    destroy() {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      clock = undefined;
    },
  };
}
