import { formatMbps } from "@/core/format/bitrate";
import { formatClock } from "@/core/format/time";
import { curveOutline, type NetworkCurve } from "@/core/netsim/curve-math";
import { GUTTER_PX, type ChartTheme, type Painter } from "./draw";
import {
  axisMbps,
  linearScale,
  logScale,
  spreadLabels,
  timeTicks,
  type AxisLabel,
  type Scale,
} from "./scale";

/**
 * The Networks screen's curve editor: its scales and hit-testing (pure, unit-tested) and its drawing. The editing
 * itself is in src/core/netsim/edit.ts; the keyboard and pointer handling in src/ui/networks/CurveEditor.tsx.
 */

/** A quality of the stream drawn over the curve. */
export interface LadderLine {
  name: string;
  bitrate: number;
}

/** Bandwidth this low sits on the bottom edge, with nothing (bits/s). */
const FLOOR_BPS = 50_000;
const FONT = '12px "Space Mono", ui-monospace, monospace';

/**
 * The editor's bandwidth range in bits/s: from 50 kbps to a margin over the highest of the curve, the ladder and
 * 10 Mbps. `previous` keeps the top from shrinking while a point is being edited.
 */
export function editorDomain(
  curve: NetworkCurve,
  ladder: readonly LadderLine[],
  previous?: readonly [number, number],
): [number, number] {
  const highest = Math.max(
    10e6,
    ...curve.points.map((point) => point.mbps * 1e6),
    ...ladder.map((line) => line.bitrate),
  );
  return [FLOOR_BPS, Math.max(highest * 1.3, previous?.[1] ?? 0)];
}

export interface EditorLayout {
  x: Scale;
  y: Scale;
  /** Run seconds at a horizontal pixel, kept inside the network. */
  time(px: number): number;
  /** Mbps at a vertical pixel; nothing at the bottom edge. */
  rate(py: number): number;
  plotRight: number;
  top: number;
  bottom: number;
}

export function editorLayout(
  width: number,
  height: number,
  lengthS: number,
  domain: readonly [number, number],
): EditorLayout {
  const plotRight = Math.max(1, width - GUTTER_PX);
  const top = 14;
  const bottom = Math.max(top + 1, height - 30);
  const [l0, l1] = [Math.log10(domain[0]), Math.log10(domain[1])];
  return {
    x: linearScale([0, lengthS], [0, plotRight]),
    y: logScale(domain, [bottom, top]),
    time: (px) => (Math.min(Math.max(px, 0), plotRight) / plotRight) * lengthS,
    rate: (py) => {
      if (py >= bottom - 3) return 0;
      const share = (bottom - Math.max(py, top)) / (bottom - top);
      return 10 ** (l0 + share * (l1 - l0)) / 1e6;
    },
    plotRight,
    top,
    bottom,
  };
}

/** The point nearest to a pixel, within `radiusPx`; the selected point wins a tie. */
export function nearestPoint(
  layout: EditorLayout,
  curve: NetworkCurve,
  px: number,
  py: number,
  radiusPx = 12,
): number | undefined {
  let found: number | undefined;
  let best = radiusPx;
  curve.points.forEach((point, index) => {
    const distance = Math.hypot(layout.x(point.t) - px, layout.y(point.mbps * 1e6) - py);
    if (distance <= best) {
      best = distance;
      found = index;
    }
  });
  return found;
}

/** How big points are drawn: smaller when they crowd, as in a recorded trace with a point a second. */
export function pointRadius(layout: EditorLayout, count: number): number {
  return Math.min(5, Math.max(2.5, layout.plotRight / Math.max(1, count) / 3));
}

export interface EditorView {
  curve: NetworkCurve;
  ladder: readonly LadderLine[];
  domain: readonly [number, number];
  selected: number;
  /** Whether the editor has keyboard focus: the selected point is marked only then and while dragging. */
  active: boolean;
}

export function drawEditor(painter: Painter, theme: ChartTheme, view: EditorView): void {
  const { ctx, width, height } = painter;
  const { curve, ladder, domain } = view;
  const layout = editorLayout(width, height, curve.lengthS, domain);
  const { x, y, plotRight, bottom } = layout;
  ctx.clearRect(0, 0, width, height);
  ctx.font = FONT;

  // The ladder: a dashed line and a label per quality; powers of ten and nothing label the rest.
  ctx.save();
  ctx.strokeStyle = theme.lineStrong;
  ctx.setLineDash([3, 5]);
  for (const line of ladder) {
    const at = Math.round(y(line.bitrate)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, at);
    ctx.lineTo(plotRight, at);
    ctx.stroke();
  }
  ctx.restore();
  const fits = (text: string) => ctx.measureText(text).width <= GUTTER_PX - 10;
  const labels: AxisLabel[] = [...ladder]
    .sort((a, b) => b.bitrate - a.bitrate)
    .map((line) => {
      const named = `${line.name} ${axisMbps(line.bitrate)}`;
      return { y: y(line.bitrate), text: fits(named) ? named : axisMbps(line.bitrate) };
    });
  for (let bps = 1e5; bps <= domain[1]; bps *= 10) {
    if (bps >= domain[0]) labels.push({ y: y(bps), text: formatMbps(bps) });
  }
  labels.push({ y: bottom, text: "0" });
  ctx.save();
  ctx.fillStyle = theme.fgMuted;
  ctx.textBaseline = "middle";
  for (const label of spreadLabels(labels, 14)) ctx.fillText(label.text, plotRight + 8, label.y);
  ctx.restore();

  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(bottom) + 0.5);
  ctx.lineTo(plotRight, Math.round(bottom) + 0.5);
  ctx.stroke();

  // The curve, as an area.
  const corners = curveOutline(curve, 0, curve.lengthS);
  const first = corners[0];
  const last = corners.at(-1);
  if (first && last) {
    ctx.save();
    ctx.beginPath();
    corners.forEach((corner, i) => {
      if (i === 0) ctx.moveTo(x(corner.t), y(corner.bps));
      else ctx.lineTo(x(corner.t), y(corner.bps));
    });
    ctx.strokeStyle = theme.net;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(x(last.t), bottom);
    ctx.lineTo(x(first.t), bottom);
    ctx.closePath();
    ctx.fillStyle = theme.net;
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.restore();
  }

  // The points; the selected one ringed, with its time and bandwidth.
  const radius = pointRadius(layout, curve.points.length);
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = theme.ground;
  ctx.strokeStyle = theme.fg;
  curve.points.forEach((point, index) => {
    if (index === view.selected) return;
    ctx.beginPath();
    ctx.arc(x(point.t), y(point.mbps * 1e6), radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
  const chosen = curve.points[view.selected];
  if (chosen) {
    const cx = x(chosen.t);
    const cy = y(chosen.mbps * 1e6);
    ctx.save();
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fill();
    if (view.active) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const text = `${formatClock(chosen.t, chosen.t % 1 === 0 ? 0 : 1)} · ${chosen.mbps} Mbps`;
    const pillWidth = ctx.measureText(text).width + 16;
    const left = Math.min(Math.max(0, cx - pillWidth / 2), plotRight - pillWidth);
    // Above the point, or below it when there's no room above.
    const pillTop = cy - 44 >= 0 ? cy - 44 : Math.min(cy + 18, bottom - 26);
    ctx.fillStyle = theme.fg;
    ctx.beginPath();
    ctx.roundRect(left, pillTop, pillWidth, 24, 6);
    ctx.fill();
    ctx.fillStyle = theme.ground;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, left + pillWidth / 2, pillTop + 12.5);
    ctx.restore();
  }

  // Time along the bottom.
  ctx.save();
  ctx.fillStyle = theme.fgMuted;
  ctx.textBaseline = "middle";
  for (const t of timeTicks(0, curve.lengthS, plotRight)) {
    const text = formatClock(t);
    const textWidth = ctx.measureText(text).width;
    ctx.fillText(
      text,
      Math.min(Math.max(0, x(t) - textWidth / 2), plotRight - textWidth),
      height - 11,
    );
  }
  ctx.restore();
}
