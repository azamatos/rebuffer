import { formatClock } from "@/core/format/time";
import { curveOutline, type CurveCorner, type NetworkCurve } from "@/core/netsim/curve";
import { formatMbps } from "@/core/run/describe";
import type { TimeRange } from "@/core/run/range";
import type { Timeline } from "@/core/run/timeline";
import {
  axisMbps,
  bandwidthDomain,
  bufferTop,
  linearScale,
  logScale,
  qualityShade,
  spreadLabels,
  timeTicks,
  type AxisLabel,
  type Scale,
} from "./scale";

/** The chart colours, read from the CSS tokens in src/styles.css so they're defined once. */
export interface ChartTheme {
  net: string;
  estimate: string;
  onscreen: string;
  buffer: string;
  /** Qualities, lowest first. */
  quality: readonly string[];
  error: string;
  errorText: string;
  fg: string;
  fgMuted: string;
  ground: string;
  accent: string;
  line: string;
  lineStrong: string;
}

export function readTheme(element: Element): ChartTheme {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--color-${name}`).trim();
  return {
    net: token("net"),
    estimate: token("estimate"),
    onscreen: token("onscreen"),
    buffer: token("buffer"),
    quality: [0, 1, 2, 3, 4].map((shade) => token(`q${shade}`)),
    error: token("error"),
    errorText: token("error-text"),
    fg: token("fg"),
    fgMuted: token("fg-3"),
    ground: token("ground"),
    accent: token("accent"),
    line: token("line"),
    lineStrong: token("line-strong"),
  };
}

/** A canvas ready to draw on in CSS pixels. */
export interface Painter {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
}

/** Sizes the canvas's pixels to its CSS box at the screen's density; call again when the box changes. */
export function fitCanvas(canvas: HTMLCanvasElement): Painter | undefined {
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const density = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  ctx.setTransform(density, 0, 0, density, 0, 0);
  return { ctx, width, height };
}

/** A numbered marker on the bandwidth chart, matching a note in the Report. */
export interface ChartMarker {
  t: number;
  label: string;
}

/** What one frame shows. */
export interface Frame {
  timeline: Timeline;
  curve: NetworkCurve;
  /** Run seconds drawn up to. */
  now: number;
  /** A live run gets a playhead at `now`. */
  live: boolean;
  markers: readonly ChartMarker[];
  /** The stretch of run time on view: all of it, or what the Report zoomed to. */
  range: TimeRange;
  /** The stretch a drag across the charts is picking, while it lasts. */
  selection: TimeRange | undefined;
}

/** Room on the right for axis labels. Every chart keeps the same, so their time axes line up. */
export const GUTTER_PX = 84;
const FONT = '12px "Space Mono", ui-monospace, monospace';
const LABEL_GAP_PX = 14;

const timeScale = (frame: Frame, painter: Painter): Scale =>
  linearScale([frame.range.from, frame.range.to], [0, Math.max(1, painter.width - GUTTER_PX)]);

/** Keeps what's drawn next inside the plot, out of the labels' gutter. Undo with `ctx.restore()`. */
function clipToPlot({ ctx, width, height }: Painter): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, Math.max(0, width - GUTTER_PX), height);
  ctx.clip();
}

/** The stretch a drag is picking: a light band with its edges marked. */
function drawSelection(
  { ctx }: Painter,
  theme: ChartTheme,
  frame: Frame,
  x: Scale,
  top: number,
  bottom: number,
): void {
  if (!frame.selection) return;
  const x0 = x(frame.selection.from);
  const x1 = x(frame.selection.to);
  ctx.save();
  ctx.fillStyle = theme.fg;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(x0, top, x1 - x0, bottom - top);
  ctx.globalAlpha = 0.7;
  ctx.fillRect(Math.round(x0), top, 1, bottom - top);
  ctx.fillRect(Math.round(x1) - 1, top, 1, bottom - top);
  ctx.restore();
}

function hairline(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number): void {
  const snapped = Math.round(y) + 0.5;
  ctx.beginPath();
  ctx.moveTo(x0, snapped);
  ctx.lineTo(x1, snapped);
  ctx.stroke();
}

function drawStalls(
  { ctx }: Painter,
  theme: ChartTheme,
  frame: Frame,
  x: Scale,
  top: number,
  bottom: number,
): void {
  ctx.save();
  ctx.fillStyle = theme.error;
  ctx.globalAlpha = 0.3;
  for (const stall of frame.timeline.stalls) {
    if (stall.start > frame.now) continue;
    const x0 = x(stall.start);
    const x1 = x(Math.min(stall.end ?? frame.now, frame.now));
    ctx.fillRect(x0, top, Math.max(2, x1 - x0), bottom - top);
  }
  ctx.restore();
}

function drawPlayhead(
  { ctx }: Painter,
  theme: ChartTheme,
  frame: Frame,
  x: Scale,
  bottom: number,
): void {
  if (!frame.live) return;
  ctx.save();
  ctx.strokeStyle = theme.fg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x(frame.now), 0);
  ctx.lineTo(x(frame.now), bottom);
  ctx.stroke();
  ctx.restore();
}

function drawGutterLabels({ ctx, width }: Painter, theme: ChartTheme, labels: AxisLabel[]): void {
  ctx.save();
  ctx.font = FONT;
  ctx.fillStyle = theme.fgMuted;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const label of spreadLabels(labels, LABEL_GAP_PX)) {
    ctx.fillText(label.text, width - GUTTER_PX + 8, label.y);
  }
  ctx.restore();
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  corners: CurveCorner[],
  x: Scale,
  y: Scale,
): void {
  corners.forEach((corner, i) => {
    if (i === 0) ctx.moveTo(x(corner.t), y(corner.bps));
    else ctx.lineTo(x(corner.t), y(corner.bps));
  });
}

/** Bandwidth and quality: the network (area so far, dashed ahead), the player's estimate and the quality on screen. */
export function drawNetwork(painter: Painter, theme: ChartTheme, frame: Frame): void {
  const { ctx, width, height } = painter;
  const { timeline, curve, now } = frame;
  ctx.clearRect(0, 0, width, height);
  const plotRight = width - GUTTER_PX;
  const top = 8;
  const bottom = height - 30;
  const x = timeScale(frame, painter);
  const domain = bandwidthDomain(curve, timeline.levels);
  const y = logScale(domain, [bottom, top]);

  // The ladder: a dashed line and a label per quality. Powers of ten label the rest of the scale.
  ctx.save();
  ctx.strokeStyle = theme.line;
  ctx.setLineDash([3, 5]);
  for (const level of timeline.levels) hairline(ctx, y(level.bitrate), 0, plotRight);
  ctx.restore();
  ctx.font = FONT;
  const fits = (text: string) => ctx.measureText(text).width <= GUTTER_PX - 10;
  const ladder = [...timeline.levels]
    .sort((a, b) => b.bitrate - a.bitrate)
    .map((level) => {
      const named = `${level.name ?? ""} ${axisMbps(level.bitrate)}`.trim();
      return { y: y(level.bitrate), text: fits(named) ? named : axisMbps(level.bitrate) };
    });
  const decades: AxisLabel[] = [];
  for (let bps = 1e4; bps <= domain[1]; bps *= 10) {
    if (bps >= domain[0]) decades.push({ y: y(bps), text: formatMbps(bps) });
  }
  drawGutterLabels(painter, theme, [...ladder, ...decades]);

  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1;
  hairline(ctx, bottom, 0, plotRight);
  clipToPlot(painter);
  drawStalls(painter, theme, frame, x, top, bottom);

  // The network still to come, dashed; only the stretch on view.
  const { from, to } = frame.range;
  const ahead = curveOutline(curve, Math.max(now, from), to);
  if (ahead.length > 0) {
    ctx.save();
    ctx.strokeStyle = theme.net;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    tracePath(ctx, ahead, x, y);
    ctx.stroke();
    ctx.restore();
  }

  // The network so far, as an area.
  const past = curveOutline(curve, from, Math.min(now, to));
  const first = past[0];
  const last = past.at(-1);
  if (first && last) {
    ctx.save();
    ctx.beginPath();
    tracePath(ctx, past, x, y);
    ctx.strokeStyle = theme.net;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(x(last.t), bottom);
    ctx.lineTo(x(first.t), bottom);
    ctx.closePath();
    ctx.fillStyle = theme.net;
    ctx.globalAlpha = 0.28;
    ctx.fill();
    ctx.restore();
  }

  // The player's estimate, dashed so it never depends on colour alone; gaps where it had none.
  const { t: times, estimateBps } = timeline.samples;
  ctx.save();
  ctx.strokeStyle = theme.estimate;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i < times.length; i++) {
    const t = times[i] ?? 0;
    const bps = estimateBps[i] ?? Number.NaN;
    if (t > now) break;
    if (Number.isNaN(bps)) {
      drawing = false;
      continue;
    }
    if (drawing) ctx.lineTo(x(t), y(bps));
    else ctx.moveTo(x(t), y(bps));
    drawing = true;
  }
  ctx.stroke();
  ctx.restore();

  // The quality on screen, as steps.
  const bitrateOf = new Map(timeline.levels.map((level) => [level.index, level.bitrate]));
  ctx.save();
  ctx.strokeStyle = theme.onscreen;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  timeline.shown.forEach((change, i) => {
    if (change.t > now) return;
    const level = y(bitrateOf.get(change.level) ?? domain[0]);
    const until = Math.min(timeline.shown[i + 1]?.t ?? now, now);
    if (i === 0) ctx.moveTo(x(change.t), level);
    else ctx.lineTo(x(change.t), level);
    ctx.lineTo(x(until), level);
  });
  ctx.stroke();
  ctx.restore();

  drawSelection(painter, theme, frame, x, top, bottom);
  ctx.restore();

  drawMarkers(painter, theme, frame, x, top + 10);
  drawPlayhead(painter, theme, frame, x, bottom);
  drawTimeAxis(painter, theme, frame, x, height - 12);
}

const MARKER_RADIUS = 9;

/** Numbered circles along the top, nudged apart when two notes start close together. */
function drawMarkers(
  { ctx, width }: Painter,
  theme: ChartTheme,
  frame: Frame,
  x: Scale,
  y: number,
): void {
  const plotRight = width - GUTTER_PX;
  ctx.save();
  ctx.font = '600 12px "Geist Variable", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let previous = Number.NEGATIVE_INFINITY;
  for (const marker of frame.markers) {
    if (marker.t > frame.now || marker.t < frame.range.from || marker.t > frame.range.to) continue;
    const at = Math.max(
      previous + 2 * MARKER_RADIUS + 3,
      Math.min(Math.max(MARKER_RADIUS, x(marker.t)), plotRight - MARKER_RADIUS),
    );
    previous = at;
    ctx.fillStyle = theme.fg;
    ctx.beginPath();
    ctx.arc(at, y, MARKER_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = theme.ground;
    ctx.fillText(marker.label, at, y + 0.5);
  }
  ctx.restore();
}

/** Clock labels along the bottom, and the playhead's time in a pill while the run is live. */
function drawTimeAxis(
  { ctx, width }: Painter,
  theme: ChartTheme,
  frame: Frame,
  x: Scale,
  y: number,
): void {
  const plotRight = width - GUTTER_PX;
  ctx.save();
  ctx.font = FONT;
  ctx.textBaseline = "middle";

  let pill: { left: number; right: number } | undefined;
  if (frame.live) {
    const text = formatClock(frame.now);
    const pillWidth = ctx.measureText(text).width + 14;
    const left = Math.min(Math.max(0, x(frame.now) - pillWidth / 2), plotRight - pillWidth);
    pill = { left, right: left + pillWidth };
    ctx.fillStyle = theme.fg;
    ctx.beginPath();
    ctx.roundRect(left, y - 10, pillWidth, 20, 5);
    ctx.fill();
    ctx.fillStyle = theme.ground;
    ctx.textAlign = "center";
    ctx.fillText(text, left + pillWidth / 2, y + 1);
  }

  ctx.fillStyle = theme.fgMuted;
  const ticks = timeTicks(frame.range.from, frame.range.to, plotRight);
  for (const t of ticks) {
    const text = formatClock(t);
    const textWidth = ctx.measureText(text).width;
    const left = Math.min(Math.max(0, x(t) - textWidth / 2), plotRight - textWidth);
    if (pill && left < pill.right + 6 && left + textWidth > pill.left - 6) continue;
    ctx.textAlign = "left";
    ctx.fillText(text, left, y + 1);
  }
  ctx.restore();
}

/** Seconds of video ahead of the playhead, with stalls marked. */
export function drawBuffer(painter: Painter, theme: ChartTheme, frame: Frame): void {
  const { ctx, width, height } = painter;
  const { timeline, now } = frame;
  ctx.clearRect(0, 0, width, height);
  const plotRight = width - GUTTER_PX;
  const top = 8;
  const bottom = height - 8;
  const x = timeScale(frame, painter);
  const { t: times, bufferS } = timeline.samples;

  let most = 0;
  let count = 0;
  while (count < times.length && (times[count] ?? Infinity) <= now) {
    most = Math.max(most, bufferS[count] ?? 0);
    count++;
  }
  const topS = bufferTop(most);
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
  drawStalls(painter, theme, frame, x, top, bottom);

  if (count > 0) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const point: [number, number] = [x(times[i] ?? 0), y(bufferS[i] ?? 0)];
      if (i === 0) ctx.moveTo(...point);
      else ctx.lineTo(...point);
    }
    ctx.strokeStyle = theme.buffer;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.lineTo(x(times[count - 1] ?? 0), bottom);
    ctx.lineTo(x(times[0] ?? 0), bottom);
    ctx.closePath();
    ctx.fillStyle = theme.buffer;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.restore();
  }
  drawSelection(painter, theme, frame, x, top, bottom);
  ctx.restore();

  drawPlayhead(painter, theme, frame, x, bottom);
}

/**
 * One bar per video segment download, coloured by quality; abandoned ones are dashed outlines. A download in progress
 * runs up to the playhead.
 */
export function drawDownloads(painter: Painter, theme: ChartTheme, frame: Frame): void {
  const { ctx, width, height } = painter;
  const { timeline, now } = frame;
  ctx.clearRect(0, 0, width, height);
  const x = timeScale(frame, painter);
  const barTop = 8;
  const barHeight = height - 16;
  const shadeOf = new Map(
    timeline.levels.map((level) => [level.index, qualityShade(timeline.levels, level.index)]),
  );

  clipToPlot(painter);
  for (const download of timeline.downloads) {
    if (download.start > now || download.start > frame.range.to) continue;
    if ((download.end ?? now) < frame.range.from) continue;
    const x0 = x(download.start);
    const x1 = x(Math.min(download.end ?? now, now));
    const barWidth = Math.max(2, x1 - x0 - 1);
    const radius = barWidth >= 6 ? 3 : 1;
    ctx.save();
    ctx.beginPath();
    if (download.state === "abandoned") {
      ctx.strokeStyle = theme.errorText;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.roundRect(x0 + 0.75, barTop + 0.75, Math.max(1, barWidth - 1.5), barHeight - 1.5, radius);
      ctx.stroke();
    } else {
      ctx.fillStyle = theme.quality[shadeOf.get(download.level) ?? 0] ?? theme.fgMuted;
      ctx.roundRect(x0, barTop, barWidth, barHeight, radius);
      ctx.fill();
    }
    ctx.restore();
  }
  drawSelection(painter, theme, frame, x, 0, height);
  ctx.restore();

  drawPlayhead(painter, theme, frame, x, height);
}
