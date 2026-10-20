import { parseClock } from "@/core/format/time";
import {
  curveFromJson,
  validateCurve,
  type CurvePoint,
  type CurveResult,
  type NetworkCurve,
} from "./curve";

/**
 * Networks as CSV, for spreadsheets and recorded traces: one `time,bandwidth` row per point. The file the Networks
 * screen exports starts with a comment that keeps the rest of the network, so it reads back the same.
 */

/** Latency for a CSV that doesn't say, ms. */
const DEFAULT_RTT_MS = 50;
/** At most this many line errors are listed. */
const MAX_ERRORS = 3;

const trim = (value: number) => String(Math.round(value * 1000) / 1000);

export function curveToCsv(curve: NetworkCurve): string {
  return [
    `# rebuffer-network shape=${curve.shape} rtt_ms=${trim(curve.rttMs)} length_s=${trim(curve.lengthS)}`,
    "time_s,mbps",
    ...curve.points.map((point) => `${trim(point.t)},${trim(point.mbps)}`),
    "",
  ].join("\n");
}

/**
 * Reads CSV rows of a time (seconds or m:ss) and a bandwidth (Mbps, or kbps when the header says so), with commas,
 * semicolons or tabs between them. A header row is optional. Without the settings comment the network is steps,
 * 50 ms latency, and lasts one interval past its last point.
 */
export function curveFromCsv(text: string): CurveResult {
  const settings = new Map<string, string>();
  const points: CurvePoint[] = [];
  const errors: string[] = [];
  let kbps = false;
  let headerSeen = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "") return;
    if (line.startsWith("#")) {
      for (const [, key = "", value = ""] of line.matchAll(/(\w+)=([\w.]+)/g)) {
        settings.set(key, value);
      }
      return;
    }
    const [time = "", rate = ""] = line.split(/[,;\t]/).map((cell) => cell.trim());
    const t = parseClock(time);
    const value = rate === "" ? Number.NaN : Number(rate);
    if (t !== undefined && Number.isFinite(value)) {
      points.push({ t, mbps: kbps ? Math.round(value) / 1000 : value });
      return;
    }
    if (!headerSeen && points.length === 0 && /[a-z]/i.test(line)) {
      headerSeen = true;
      kbps = /kbps|kbit/i.test(rate);
      return;
    }
    errors.push(`Line ${i + 1}: expected a time and a bandwidth, like “12,3.5”.`);
  });
  if (errors.length > 0) {
    const more = errors.length - MAX_ERRORS;
    return {
      ok: false,
      errors: [
        ...errors.slice(0, MAX_ERRORS),
        ...(more > 0 ? [`…and ${more} more ${more === 1 ? "line" : "lines"} like that.`] : []),
      ],
    };
  }
  if (points.length === 0)
    return { ok: false, errors: ["This file has no rows of time and bandwidth."] };

  const last = points.at(-1) as CurvePoint;
  const interval = points.length > 1 ? last.t - (points.at(-2) as CurvePoint).t : 1;
  const number = (key: string, fallback: number) => {
    const value = settings.get(key);
    return value === undefined ? fallback : Number(value);
  };
  return validateCurve({
    shape: settings.get("shape") ?? "steps",
    rttMs: number("rtt_ms", DEFAULT_RTT_MS),
    lengthS: number("length_s", last.t + Math.max(interval, 1)),
    points,
  });
}

/** Reads an imported file: JSON when it looks like JSON, CSV otherwise. */
export function curveFromFile(name: string, text: string): CurveResult {
  const json = /\.json$/i.test(name) || (!/\.csv$/i.test(name) && text.trimStart().startsWith("{"));
  return json ? curveFromJson(text) : curveFromCsv(text);
}
