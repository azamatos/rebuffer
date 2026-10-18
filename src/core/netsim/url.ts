import { validateCurve, type CurveResult, type NetworkCurve } from "./curve";

/**
 * A network curve as a short, readable URL value, so a setup can be shared as a link:
 * `steps,80,90,0:6|20:2.5|42:0` is shape, RTT (ms), length (s), then `time:Mbps` points.
 */
export function curveToParam(curve: NetworkCurve): string {
  const points = curve.points.map((point) => `${trim(point.t)}:${trim(point.mbps)}`).join("|");
  return `${curve.shape},${trim(curve.rttMs)},${trim(curve.lengthS)},${points}`;
}

/** Reads a value written by `curveToParam`; errors say what to fix. */
export function curveFromParam(value: string): CurveResult {
  const [shape, rtt, length, points = "", ...rest] = value.split(",");
  if (rest.length > 0 || length === undefined) {
    return { ok: false, errors: ["A network link needs shape, latency, length and points."] };
  }
  const parsed = points.split("|").map((pair) => {
    const [t, mbps] = pair.split(":");
    return { t: Number(t), mbps: Number(mbps) };
  });
  return validateCurve({
    shape,
    rttMs: Number(rtt),
    lengthS: Number(length),
    points: parsed,
  });
}

/** Up to three decimals, without trailing zeros. */
function trim(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
