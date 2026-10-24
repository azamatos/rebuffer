import { formatClock } from "@/core/format/time";
import { curveOutline, type NetworkCurve } from "@/core/netsim/curve";
import type { Level } from "@/core/run/events";
import type { Timeline } from "@/core/run/timeline";
import { fitCanvas, readTheme, type ChartTheme, type Painter } from "./draw";
import { bufferTop, linearScale, spreadLabels, timeTicks, type Scale } from "./scale";

/**
 * Compare's timeline: one row per run on the same scales, so nothing is drawn over anything else. A row is the run's
 * network (when the two runs' networks differ), the quality on screen and the buffer, with its stalls across both;
 * the network both shared gets a row of its own above. Colours mean what they mean on the Report.
 */

/** Scale labels in the narrow gutter: the text face, which fits "1.7 Mbps"; the time axis keeps the clock face. */
export const TICK_FONT =
  '11px "Geist Variable", "Geist Fallback", ui-sans-serif, system-ui, sans-serif';
const CLOCK_FONT = '11px "Space Mono", "Space Mono Fallback", ui-monospace, monospace';
const MARKER_FONT =
  '600 11px "Geist Variable", "Geist Fallback", ui-sans-serif, system-ui, sans-serif';

/** A numbered moment from "Where they differ", marked on its run's quality track. */
export interface LaneMarker {
  t: number;
  label: string;
}

/** One run's row. */
export interface LaneRun {
  timeline: Timeline;
  curve: NetworkCurve;
  /** When it ended; past it the row is hatched as not played. */
  endS: number;
  markers: readonly LaneMarker[];
}

/** What the whole timeline shares: its time span, scales and what's compared. */
export interface LaneScales {
  lengthS: number;
  /** Quality as bitrates, when the two runs played different streams. */
  mbps: boolean;
  /** The top of the network rows and of the Mbps quality scale, bits per second. */
  topBps: number;
  /** The top of the buffer tracks, seconds. */
  bufferTopS: number;
  /** When a run was stopped: the stretch compared ends here, and what's after it is faded. */
  untilS: number | undefined;
}

export interface LaneLayout {
  height: number;
  gutter: number;
  network: { top: number; height: number } | undefined;
  quality: { top: number; height: number } | undefined;
  buffer: { top: number; height: number } | undefined;
  /** Where the time axis's labels sit, when this canvas carries it. */
  axis: number | undefined;
}

/**
 * Where each track sits in a canvas. `marks`: room above the quality track for the markers. Narrow screens get
 * shorter tracks and a narrower gutter.
 */
export function laneLayout({
  network,
  run,
  axis,
  narrow,
}: {
  network: boolean;
  run: boolean;
  axis: boolean;
  narrow: boolean;
}): LaneLayout {
  const gutter = narrow ? 44 : 58;
  const networkHeight = narrow ? 32 : 38;
  const qualityHeight = narrow ? 76 : 92;
  const bufferHeight = narrow ? 30 : 36;
  let y = 4;
  const networkTrack = network ? { top: y, height: networkHeight } : undefined;
  // Room under a network for the markers above the quality track.
  if (networkTrack) y += networkHeight + (run ? 14 : 8);
  let qualityTrack: LaneLayout["quality"];
  let bufferTrack: LaneLayout["buffer"];
  if (run) {
    y += 10;
    qualityTrack = { top: y, height: qualityHeight };
    y += qualityHeight + 10;
    bufferTrack = { top: y, height: bufferHeight };
    y += bufferHeight;
  }
  y += 4;
  const axisY = axis ? y + 8 : undefined;
  if (axis) y += 18;
  return {
    height: Math.ceil(y),
    gutter,
    network: networkTrack,
    quality: qualityTrack,
    buffer: bufferTrack,
    axis: axisY,
  };
}

/** A round top for the network rows, with room above the highest rate either network reaches for its label. */
export function networkTop(curves: readonly NetworkCurve[], levels: readonly Level[] = []): number {
  const peak =
    Math.max(
      1e6,
      ...curves.flatMap((curve) => curve.points.map((point) => point.mbps * 1e6)),
      ...levels.map((level) => level.bitrate),
    ) * 1.25;
  const steps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
  const mbps = peak / 1e6;
  return (steps.find((step) => step >= mbps) ?? Math.ceil(mbps / 50) * 50) * 1e6;
}

const BUFFER_TOPS = [10, 20, 30, 45, 60, 90, 120, 180, 240, 300, 450, 600];

/** The buffer tracks' top: the round value at or above both runs' fullest buffer (a full 30 s buffer tops at 30 s). */
export function lanesBufferTop(timelines: readonly Timeline[]): number {
  const most = Math.max(10, ...timelines.flatMap((timeline) => timeline.samples.bufferS));
  return BUFFER_TOPS.find((top) => top >= most - 0.5) ?? bufferTop(most);
}

const mbpsLabel = (bps: number) => `${Number((bps / 1e6).toFixed(1))} Mbps`;

function tickLabels(
  { ctx }: Painter,
  theme: ChartTheme,
  gutter: number,
  labels: { y: number; text: string }[],
): void {
  ctx.save();
  ctx.font = TICK_FONT;
  ctx.fillStyle = theme.fgMuted;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const label of spreadLabels(labels, 12)) ctx.fillText(label.text, gutter - 8, label.y);
  ctx.restore();
}

function gridLine(
  ctx: CanvasRenderingContext2D,
  theme: ChartTheme,
  y: number,
  x0: number,
  x1: number,
) {
  ctx.save();
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, Math.round(y) + 0.5);
  ctx.lineTo(x1, Math.round(y) + 0.5);
  ctx.stroke();
  ctx.restore();
}

/** The plot's horizontal scale: run time to pixels right of the gutter. */
const timeScale = (layout: LaneLayout, width: number, lengthS: number): Scale =>
  linearScale([0, lengthS], [layout.gutter, width]);

/** A network as an area with its outline. */
function drawNetworkTrack(
  painter: Painter,
  theme: ChartTheme,
  track: { top: number; height: number },
  curve: NetworkCurve,
  scales: LaneScales,
  x: Scale,
): void {
  const { ctx, width } = painter;
  const bottom = track.top + track.height;
  const y = linearScale([0, scales.topBps], [bottom, track.top]);
  const peak = Math.max(...curve.points.map((point) => point.mbps)) * 1e6;
  gridLine(ctx, theme, y(peak), x(0), width);
  gridLine(ctx, theme, bottom, x(0), width);
  tickLabels(painter, theme, x(0), [
    { y: y(peak), text: mbpsLabel(peak) },
    { y: bottom, text: "0" },
  ]);
  const outline = curveOutline(curve, 0, Math.min(curve.lengthS, scales.lengthS));
  const first = outline[0];
  const last = outline.at(-1);
  if (!first || !last) return;
  ctx.save();
  ctx.beginPath();
  outline.forEach((corner, i) => {
    if (i === 0) ctx.moveTo(x(corner.t), y(corner.bps));
    else ctx.lineTo(x(corner.t), y(corner.bps));
  });
  ctx.lineTo(x(last.t), bottom);
  ctx.lineTo(x(first.t), bottom);
  ctx.closePath();
  ctx.fillStyle = theme.net;
  ctx.globalAlpha = 0.32;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  outline.forEach((corner, i) => {
    if (i === 0) ctx.moveTo(x(corner.t), y(corner.bps));
    else ctx.lineTo(x(corner.t), y(corner.bps));
  });
  ctx.strokeStyle = theme.net;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Where a quality sits: evenly spaced steps of the run's own ladder, or its bitrate on the shared Mbps scale. */
export function qualityY(
  levels: readonly Level[],
  track: { top: number; height: number },
  scales: Pick<LaneScales, "mbps" | "topBps">,
): (level: Level) => number {
  const bottom = track.top + track.height;
  if (scales.mbps) {
    const y = linearScale([0, scales.topBps], [bottom, track.top]);
    return (level) => y(level.bitrate);
  }
  const ladder = [...levels].sort((a, b) => a.bitrate - b.bitrate);
  const step = track.height / Math.max(1, ladder.length);
  return (level) => {
    const rank = Math.max(
      0,
      ladder.findIndex((candidate) => candidate.bitrate === level.bitrate),
    );
    return bottom - (rank + 0.5) * step;
  };
}

function drawStallBands(
  ctx: CanvasRenderingContext2D,
  theme: ChartTheme,
  run: LaneRun,
  x: Scale,
  top: number,
  bottom: number,
): void {
  ctx.save();
  ctx.fillStyle = theme.error;
  ctx.globalAlpha = 0.85;
  for (const stall of run.timeline.stalls) {
    const x0 = x(stall.start);
    const x1 = x(stall.end ?? run.endS);
    ctx.fillRect(x0, top, Math.max(2, x1 - x0), bottom - top);
  }
  ctx.restore();
}

function drawQualityTrack(
  painter: Painter,
  theme: ChartTheme,
  track: { top: number; height: number },
  run: LaneRun,
  scales: LaneScales,
  x: Scale,
): void {
  const { ctx, width } = painter;
  const { timeline } = run;
  const y = qualityY(timeline.levels, track, scales);
  const bottom = track.top + track.height;
  if (scales.mbps) {
    const ticks = [0.25, 0.5, 0.75, 1].map((share) => scales.topBps * share);
    for (const bps of ticks) gridLine(ctx, theme, y({ index: -1, bitrate: bps }), x(0), width);
    gridLine(ctx, theme, bottom, x(0), width);
    tickLabels(painter, theme, x(0), [
      ...ticks.map((bps) => ({ y: y({ index: -1, bitrate: bps }), text: mbpsLabel(bps) })),
      { y: bottom, text: "0" },
    ]);
  } else {
    const ladder = [...timeline.levels].sort((a, b) => a.bitrate - b.bitrate);
    for (const level of ladder) gridLine(ctx, theme, y(level), x(0), width);
    tickLabels(
      painter,
      theme,
      x(0),
      ladder.map((level) => ({
        y: y(level),
        text: level.name ?? (level.height ? `${level.height}p` : mbpsLabel(level.bitrate)),
      })),
    );
  }
  drawStallBands(ctx, theme, run, x, track.top, bottom);

  const levelOf = new Map(timeline.levels.map((level) => [level.index, level]));
  const end = Math.min(run.endS, timeline.endS ?? run.endS);
  ctx.save();
  ctx.strokeStyle = theme.onscreen;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  timeline.shown.forEach((change, i) => {
    const level = levelOf.get(change.level);
    if (!level) return;
    const at = y(level);
    const until = Math.min(timeline.shown[i + 1]?.t ?? end, end);
    if (i === 0) ctx.moveTo(x(change.t), at);
    else ctx.lineTo(x(change.t), at);
    ctx.lineTo(x(until), at);
  });
  ctx.stroke();
  ctx.restore();
}

function drawBufferTrack(
  painter: Painter,
  theme: ChartTheme,
  track: { top: number; height: number },
  run: LaneRun,
  scales: LaneScales,
  x: Scale,
): void {
  const { ctx, width } = painter;
  const bottom = track.top + track.height;
  const y = linearScale([0, scales.bufferTopS], [bottom, track.top]);
  gridLine(ctx, theme, track.top, x(0), width);
  gridLine(ctx, theme, bottom, x(0), width);
  tickLabels(painter, theme, x(0), [
    { y: track.top, text: `${scales.bufferTopS} s` },
    { y: bottom, text: "0 s" },
  ]);
  drawStallBands(ctx, theme, run, x, track.top, bottom);
  const { t: times, bufferS } = run.timeline.samples;
  const points = times
    .map((t, i) => ({ t, v: bufferS[i] ?? 0 }))
    .filter((point) => point.t <= run.endS);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x(first.t), bottom);
  for (const point of points) ctx.lineTo(x(point.t), y(point.v));
  ctx.lineTo(x(last.t), bottom);
  ctx.closePath();
  ctx.fillStyle = theme.buffer;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  points.forEach((point, i) => {
    if (i === 0) ctx.moveTo(x(point.t), y(point.v));
    else ctx.lineTo(x(point.t), y(point.v));
  });
  ctx.strokeStyle = theme.buffer;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Diagonal hatching over what a run never played. */
function hatch(
  ctx: CanvasRenderingContext2D,
  theme: ChartTheme,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
): void {
  if (x1 <= x0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, bottom - top);
  ctx.clip();
  ctx.strokeStyle = theme.fg;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let start = x0 - (bottom - top); start < x1; start += 7) {
    ctx.moveTo(start, bottom);
    ctx.lineTo(start + (bottom - top), top);
  }
  ctx.stroke();
  ctx.restore();
}

/** Past the stretch compared: faded; past the run's end: hatched; and a dashed line where the comparison ends. */
function drawVeils(
  painter: Painter,
  theme: ChartTheme,
  layout: LaneLayout,
  run: LaneRun | undefined,
  scales: LaneScales,
  x: Scale,
): void {
  const { ctx, width } = painter;
  const tracks = [layout.network, layout.quality, layout.buffer].filter(
    (track): track is { top: number; height: number } => track !== undefined,
  );
  const top = Math.min(...tracks.map((track) => track.top));
  const bottom = Math.max(...tracks.map((track) => track.top + track.height));
  if (tracks.length === 0) return;
  const { untilS } = scales;
  if (run) {
    if (untilS !== undefined && run.endS > untilS) {
      ctx.save();
      ctx.fillStyle = theme.surface;
      ctx.globalAlpha = 0.62;
      for (const track of tracks) {
        ctx.fillRect(x(untilS), track.top - 1, x(run.endS) - x(untilS), track.height + 2);
      }
      ctx.restore();
    }
    if (run.endS < scales.lengthS) {
      for (const track of tracks) {
        hatch(ctx, theme, x(run.endS), width, track.top, track.top + track.height);
      }
    }
  }
  if (untilS !== undefined && untilS < scales.lengthS) {
    ctx.save();
    ctx.strokeStyle = theme.fgMuted;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x(untilS)) + 0.5, top - 4);
    ctx.lineTo(Math.round(x(untilS)) + 0.5, bottom + 4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawMarkers(
  painter: Painter,
  theme: ChartTheme,
  track: { top: number; height: number },
  markers: readonly LaneMarker[],
  x: Scale,
): void {
  const { ctx, width } = painter;
  ctx.save();
  ctx.font = MARKER_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let lastRight = -Infinity;
  for (const marker of markers) {
    // Markers close together sit side by side.
    const at = Math.min(Math.max(x(marker.t), lastRight + 11, x(0) + 10), width - 10);
    lastRight = at + 10;
    const y = track.top - 1;
    ctx.beginPath();
    ctx.arc(at, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(at, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = theme.fg;
    ctx.fill();
    ctx.fillStyle = theme.surface;
    ctx.fillText(marker.label, at, y + 0.5);
  }
  ctx.restore();
}

function drawAxis(
  painter: Painter,
  theme: ChartTheme,
  layout: LaneLayout,
  scales: LaneScales,
  x: Scale,
) {
  if (layout.axis === undefined) return;
  const { ctx, width } = painter;
  ctx.save();
  ctx.font = CLOCK_FONT;
  ctx.fillStyle = theme.fgMuted;
  ctx.textBaseline = "middle";
  const ticks = timeTicks(0, scales.lengthS, width - layout.gutter, 88);
  for (const t of ticks) {
    const text = formatClock(t);
    const textWidth = ctx.measureText(text).width;
    const left = Math.min(Math.max(layout.gutter, x(t) - textWidth / 2), width - textWidth);
    ctx.textAlign = "left";
    ctx.fillText(text, left, layout.axis);
  }
  ctx.restore();
}

/** What one canvas draws: the shared network, or one run's row; the last canvas carries the time axis. */
export interface LaneCanvas {
  canvas: HTMLCanvasElement;
  layout: LaneLayout;
  /** The network drawn in its own track: the shared one, or this run's when the two differ. */
  network: NetworkCurve | undefined;
  run: LaneRun | undefined;
}

export function drawLane(
  painter: Painter,
  theme: ChartTheme,
  lane: LaneCanvas,
  scales: LaneScales,
): void {
  const { ctx, width, height } = painter;
  ctx.clearRect(0, 0, width, height);
  const x = timeScale(lane.layout, width, scales.lengthS);
  const { layout, run } = lane;
  if (layout.network && lane.network) {
    drawNetworkTrack(painter, theme, layout.network, lane.network, scales, x);
  }
  if (run && layout.quality) drawQualityTrack(painter, theme, layout.quality, run, scales, x);
  if (run && layout.buffer) drawBufferTrack(painter, theme, layout.buffer, run, scales, x);
  drawVeils(painter, theme, layout, run, scales, x);
  if (run && layout.quality) drawMarkers(painter, theme, layout.quality, run.markers, x);
  drawAxis(painter, theme, layout, scales, x);
}

export interface Lanes {
  /** Reads the colours again and redraws, after the page's theme changed. */
  retheme(): void;
  destroy(): void;
}

/** Draws the lanes, and again when a canvas changes size or the labels' font arrives. */
export function mountLanes(lanes: readonly LaneCanvas[], scales: LaneScales): Lanes {
  const [first] = lanes;
  let theme = first ? readTheme(first.canvas) : undefined;
  const painters = new Map<HTMLCanvasElement, Painter | undefined>();
  const draw = () => {
    if (!theme) return;
    for (const lane of lanes) {
      const painter = painters.get(lane.canvas);
      if (painter) drawLane(painter, theme, lane, scales);
    }
  };
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLCanvasElement)
        painters.set(entry.target, fitCanvas(entry.target));
    }
    draw();
  });
  for (const lane of lanes) {
    painters.set(lane.canvas, fitCanvas(lane.canvas));
    resize.observe(lane.canvas);
  }
  draw();
  void document.fonts.ready.then(draw);
  return {
    retheme() {
      theme = first ? readTheme(first.canvas) : undefined;
      draw();
    },
    destroy() {
      resize.disconnect();
    },
  };
}
