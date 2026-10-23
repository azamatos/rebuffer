import type { NetworkCurve } from "@/core/netsim/curve";
import type { RunEvent } from "@/core/run/events";
import { rangeFromDrag, wholeRange, type TimeRange } from "@/core/run/range";
import { addEvent, createTimeline, type Timeline } from "@/core/run/timeline";
import {
  drawBuffer,
  drawDownloads,
  drawNetwork,
  fitCanvas,
  readTheme,
  type ChartMarker,
  type ChartTheme,
  GUTTER_PX,
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
  /** Draws a finished run from its whole log at once (the Report), with numbered markers for its notes. */
  show(events: readonly RunEvent[], markers?: readonly ChartMarker[]): void;
  /** Reads the colours again and redraws, after the page's theme changed. */
  retheme(): void;
  /** Shows only `range` of the run on all three charts (the Report's zoom); undefined shows all of it. */
  zoom(range: TimeRange | undefined): void;
  /**
   * Lets the viewer pick a range with a pointer: a drag across any chart picks the stretch it covers, a double-click
   * the whole run. Returns a function that stops listening.
   */
  pick(listener: (range: TimeRange) => void): () => void;
  destroy(): void;
}

/** A pointer that moves less than this far is a click, not a drag. */
const DRAG_PX = 4;

/**
 * Draws `curve` and the runs that follow on three canvases. Until a run starts, the network chart previews the whole
 * curve. Drawing pauses with the tab (no animation frames there) and catches up when it's back.
 */
export function mountRunCharts(
  canvases: RunChartCanvases,
  curve: NetworkCurve,
  /** Run A, behind run B of a comparison. */
  reference?: Timeline,
): RunCharts {
  let timeline: Timeline = createTimeline();
  let clock: (() => number) | undefined;
  let markers: readonly ChartMarker[] = [];
  let range: TimeRange | undefined;
  let selection: TimeRange | undefined;
  let frameId = 0;
  let theme: ChartTheme = readTheme(canvases.network);
  const painters = new Map<HTMLCanvasElement, Painter | undefined>();
  const fit = (canvas: HTMLCanvasElement) => {
    painters.set(canvas, fitCanvas(canvas));
  };

  const isLive = () => clock !== undefined && timeline.endS === undefined;

  const draw = () => {
    const live = isLive();
    const now =
      live && clock ? Math.min(Math.max(0, clock()), curve.lengthS) : (timeline.endS ?? 0);
    const frame: Frame = {
      timeline,
      curve,
      now,
      live,
      markers,
      range: range ?? wholeRange(curve.lengthS),
      selection,
      reference,
    };
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
      markers = [];
      clock = now;
      frameId = requestAnimationFrame(loop);
    },
    add(event) {
      addEvent(timeline, event);
      // A hidden tab gets no animation frames: draw the end now so the result is there when it comes back.
      if (event.type === "end") draw();
    },
    show(events, numbered = []) {
      cancelAnimationFrame(frameId);
      clock = undefined;
      markers = numbered;
      timeline = createTimeline();
      for (const event of events) addEvent(timeline, event);
      draw();
    },
    retheme() {
      theme = readTheme(canvases.network);
      draw();
    },
    zoom(next) {
      range = next;
      if (!isLive()) draw();
    },
    pick(listener) {
      const stops = [canvases.network, canvases.buffer, canvases.downloads].map((canvas) =>
        pickOn(canvas, listener),
      );
      return () => {
        for (const stop of stops) stop();
      };
    },
    destroy() {
      cancelAnimationFrame(frameId);
      resize.disconnect();
      clock = undefined;
    },
  };

  function pickOn(canvas: HTMLCanvasElement, listener: (range: TimeRange) => void): () => void {
    let startX: number | undefined;
    let dragging = false;
    const plotX = (event: PointerEvent) => event.clientX - canvas.getBoundingClientRect().left;
    const picked = (x: number) =>
      rangeFromDrag(
        range ?? wholeRange(curve.lengthS),
        startX ?? x,
        x,
        canvas.clientWidth - GUTTER_PX,
        curve.lengthS,
      );
    const finish = () => {
      startX = undefined;
      dragging = false;
      selection = undefined;
      draw();
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      startX = plotX(event);
      dragging = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (startX === undefined) return;
      const x = plotX(event);
      if (!dragging && Math.abs(x - startX) < DRAG_PX) return;
      dragging = true;
      selection = picked(x);
      draw();
    };
    const up = (event: PointerEvent) => {
      if (startX === undefined) return;
      const next = dragging ? picked(plotX(event)) : undefined;
      finish();
      if (next) listener(next);
    };
    const whole = () => {
      listener(wholeRange(curve.lengthS));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    // A touch that turns into scrolling the page is cancelled; it picks nothing.
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("dblclick", whole);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", finish);
      canvas.removeEventListener("dblclick", whole);
    };
  }
}
