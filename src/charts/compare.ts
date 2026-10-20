import { curveOutline, type NetworkCurve } from "@/core/netsim/curve";
import type { Level } from "@/core/run/events";
import { formatMbps } from "@/core/run/describe";
import { wholeRange } from "@/core/run/range";
import type { Timeline } from "@/core/run/timeline";
import {
  clipToPlot,
  drawGutterLabels,
  drawTimeAxis,
  fitCanvas,
  FONT,
  GUTTER_PX,
  hairline,
  readTheme,
  tracePath,
  type ChartTheme,
  type Painter,
} from "./draw";
import {
  axisMbps,
  bandwidthDomain,
  bufferTop,
  linearScale,
  logScale,
  type AxisLabel,
} from "./scale";

/**
 * Two finished runs on one time axis (the Compare screen): A as a solid line in the text colour, B dashed in the
 * accent, so they never depend on colour alone. The network keeps its colour from the run charts.
 */

export interface CompareView {
  a: Timeline;
  b: Timeline;
  curveA: NetworkCurve;
  curveB: NetworkCurve;
  /** The longer run's length, seconds. */
  lengthS: number;
}

export interface CompareCanvases {
  quality: HTMLCanvasElement;
  buffer: HTMLCanvasElement;
  stalls: HTMLCanvasElement;
}

const DASH_B = [7, 4];

/** The style of each run's line. */
function runStroke(ctx: CanvasRenderingContext2D, theme: ChartTheme, run: "a" | "b"): void {
  ctx.strokeStyle = run === "a" ? theme.fg : theme.accent;
  ctx.setLineDash(run === "a" ? [] : DASH_B);
}

const timeAxis = (view: CompareView) => ({
  live: false,
  now: view.lengthS,
  range: wholeRange(view.lengthS),
});

const timeScale = (view: CompareView, { width }: Painter) =>
  linearScale([0, view.lengthS], [0, Math.max(1, width - GUTTER_PX)]);

/** Both ladders, each bitrate once, highest first. */
function ladders(view: CompareView): Level[] {
  const byBitrate = new Map<number, Level>();
  for (const level of [...view.a.levels, ...view.b.levels]) {
    if (!byBitrate.has(level.bitrate)) byBitrate.set(level.bitrate, level);
  }
  return [...byBitrate.values()].sort((x, y) => y.bitrate - x.bitrate);
}

/** The quality on screen as steps, from the first frame to the end of the run. */
function drawSteps(
  ctx: CanvasRenderingContext2D,
  timeline: Timeline,
  x: (t: number) => number,
  y: (bps: number) => number,
): void {
  const end = timeline.endS ?? 0;
  const bitrateOf = new Map(timeline.levels.map((level) => [level.index, level.bitrate]));
  ctx.beginPath();
  timeline.shown.forEach((change, i) => {
    const level = y(bitrateOf.get(change.level) ?? 0);
    const until = Math.min(timeline.shown[i + 1]?.t ?? end, end);
    if (i === 0) ctx.moveTo(x(change.t), level);
    else ctx.lineTo(x(change.t), level);
    ctx.lineTo(x(until), level);
  });
  ctx.stroke();
}

/** The networks (one area when both ran on the same one) and the quality each run showed. */
export function drawCompareQuality(painter: Painter, theme: ChartTheme, view: CompareView): void {
  const { ctx, width, height } = painter;
  ctx.clearRect(0, 0, width, height);
  const plotRight = width - GUTTER_PX;
  const top = 8;
  const bottom = height - 30;
  const x = timeScale(view, painter);
  const levels = ladders(view);
  const [lowA, highA] = bandwidthDomain(view.curveA, levels);
  const [lowB, highB] = bandwidthDomain(view.curveB, levels);
  const domain: [number, number] = [Math.min(lowA, lowB), Math.max(highA, highB)];
  const y = logScale(domain, [bottom, top]);

  ctx.save();
  ctx.strokeStyle = theme.line;
  ctx.setLineDash([3, 5]);
  for (const level of levels) hairline(ctx, y(level.bitrate), 0, plotRight);
  ctx.restore();
  ctx.font = FONT;
  const fits = (text: string) => ctx.measureText(text).width <= GUTTER_PX - 10;
  const labels: AxisLabel[] = levels.map((level) => {
    const named = `${level.name ?? ""} ${axisMbps(level.bitrate)}`.trim();
    return { y: y(level.bitrate), text: fits(named) ? named : axisMbps(level.bitrate) };
  });
  for (let bps = 1e4; bps <= domain[1]; bps *= 10) {
    if (bps >= domain[0]) labels.push({ y: y(bps), text: formatMbps(bps) });
  }
  drawGutterLabels(painter, theme, labels);
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1;
  hairline(ctx, bottom, 0, plotRight);

  clipToPlot(painter);
  // A's network as an area; B's as a dashed outline when it differs.
  const outlineA = curveOutline(view.curveA, 0, view.curveA.lengthS);
  const first = outlineA[0];
  const last = outlineA.at(-1);
  if (first && last) {
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, outlineA, x, y);
    ctx.lineTo(x(last.t), bottom);
    ctx.lineTo(x(first.t), bottom);
    ctx.closePath();
    ctx.fillStyle = theme.net;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.restore();
  }
  if (JSON.stringify(view.curveA) !== JSON.stringify(view.curveB)) {
    ctx.save();
    ctx.strokeStyle = theme.net;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    tracePath(ctx, curveOutline(view.curveB, 0, view.curveB.lengthS), x, y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  runStroke(ctx, theme, "a");
  drawSteps(ctx, view.a, x, y);
  runStroke(ctx, theme, "b");
  drawSteps(ctx, view.b, x, y);
  ctx.restore();
  ctx.restore();

  drawTimeAxis(painter, theme, timeAxis(view), x, height - 12);
}

/** Seconds of video ahead of each run's playhead. */
export function drawCompareBuffer(painter: Painter, theme: ChartTheme, view: CompareView): void {
  const { ctx, width, height } = painter;
  ctx.clearRect(0, 0, width, height);
  const plotRight = width - GUTTER_PX;
  const top = 8;
  const bottom = height - 8;
  const x = timeScale(view, painter);
  const topS = bufferTop(Math.max(0, ...view.a.samples.bufferS, ...view.b.samples.bufferS));
  const y = linearScale([0, topS], [bottom, top]);

  ctx.save();
  ctx.strokeStyle = theme.line;
  ctx.setLineDash([3, 5]);
  hairline(ctx, y(topS), 0, plotRight);
  hairline(ctx, y(topS / 2), 0, plotRight);
  ctx.restore();
  drawGutterLabels(painter, theme, [
    { y: y(topS), text: `${topS} s` },
    { y: y(topS / 2), text: `${topS / 2} s` },
    { y: y(0), text: "0 s" },
  ]);
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1;
  hairline(ctx, bottom, 0, plotRight);

  clipToPlot(painter);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  for (const [run, timeline] of [
    ["a", view.a],
    ["b", view.b],
  ] as const) {
    const { t: times, bufferS } = timeline.samples;
    runStroke(ctx, theme, run);
    ctx.beginPath();
    times.forEach((t, i) => {
      if (i === 0) ctx.moveTo(x(t), y(bufferS[i] ?? 0));
      else ctx.lineTo(x(t), y(bufferS[i] ?? 0));
    });
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/** Two lanes, A above B, with a bar for each stall. */
export function drawCompareStalls(painter: Painter, theme: ChartTheme, view: CompareView): void {
  const { ctx, width, height } = painter;
  ctx.clearRect(0, 0, width, height);
  const plotRight = width - GUTTER_PX;
  const x = timeScale(view, painter);
  const laneHeight = (height - 12) / 2;
  const lanes = [
    { label: "A", timeline: view.a, top: 4 },
    { label: "B", timeline: view.b, top: 8 + laneHeight },
  ];
  drawGutterLabels(
    painter,
    theme,
    lanes.map((lane) => ({ y: lane.top + laneHeight / 2, text: lane.label })),
  );
  for (const lane of lanes) {
    ctx.save();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    hairline(ctx, lane.top + laneHeight / 2, 0, plotRight);
    ctx.restore();
  }
  clipToPlot(painter);
  ctx.fillStyle = theme.error;
  for (const lane of lanes) {
    const end = lane.timeline.endS ?? view.lengthS;
    for (const stall of lane.timeline.stalls) {
      const x0 = x(stall.start);
      const x1 = x(stall.end ?? end);
      ctx.beginPath();
      ctx.roundRect(x0, lane.top + 3, Math.max(3, x1 - x0), laneHeight - 6, 3);
      ctx.fill();
    }
  }
  ctx.restore();
}

export interface CompareCharts {
  /** Reads the colours again and redraws, after the page's theme changed. */
  retheme(): void;
  destroy(): void;
}

/** Draws the three comparison charts, and again when a canvas changes size or the labels' font arrives. */
export function mountCompareCharts(canvases: CompareCanvases, view: CompareView): CompareCharts {
  let theme = readTheme(canvases.quality);
  const painters = new Map<HTMLCanvasElement, Painter | undefined>();
  const draw = () => {
    const quality = painters.get(canvases.quality);
    const buffer = painters.get(canvases.buffer);
    const stalls = painters.get(canvases.stalls);
    if (quality) drawCompareQuality(quality, theme, view);
    if (buffer) drawCompareBuffer(buffer, theme, view);
    if (stalls) drawCompareStalls(stalls, theme, view);
  };
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLCanvasElement)
        painters.set(entry.target, fitCanvas(entry.target));
    }
    draw();
  });
  for (const canvas of [canvases.quality, canvases.buffer, canvases.stalls]) {
    painters.set(canvas, fitCanvas(canvas));
    resize.observe(canvas);
  }
  draw();
  void document.fonts.ready.then(draw);
  return {
    retheme() {
      theme = readTheme(canvases.quality);
      draw();
    },
    destroy() {
      resize.disconnect();
    },
  };
}
