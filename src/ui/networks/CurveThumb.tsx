import { linearScale, logScale } from "@/charts/scale";
import { curveOutline, type NetworkCurve } from "@/core/netsim/curve-math";

/** Every network's thumbnail shares one log scale, 0.1–60 Mbps, so they compare at a glance. */
const THUMB_RANGE: [number, number] = [1e5, 6e7];

/** A network's curve in miniature, for lists of networks. */
export function CurveThumb({ curve, className }: { curve: NetworkCurve; className: string }) {
  const x = linearScale([0, curve.lengthS], [0, 100]);
  const y = logScale(THUMB_RANGE, [30, 1]);
  const corners = curveOutline(curve, 0, curve.lengthS)
    .map((corner) => `L${x(corner.t).toFixed(1)},${y(corner.bps).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" className={className}>
      <path d={`M0,30 ${corners} L100,30 Z`} className="fill-net/45" />
    </svg>
  );
}
