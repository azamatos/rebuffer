import { z } from "zod";

/** One point of a network curve: from `t` seconds on, the link carries `mbps` megabits per second. */
export interface CurvePoint {
  t: number;
  mbps: number;
}

/**
 * How bandwidth moves between points. "steps": each point holds until the next one.
 * "slopes": a straight line from point to point; two points at the same time make a jump.
 */
export type CurveShape = "steps" | "slopes";

/** A network: bandwidth over time plus latency. Times in seconds, bandwidth in Mbps. */
export interface NetworkCurve {
  points: readonly CurvePoint[];
  shape: CurveShape;
  rttMs: number;
  lengthS: number;
}

export const CURVE_LIMITS = {
  maxPoints: 10_000,
  maxMbps: 1_000,
  maxRttMs: 5_000,
  maxLengthS: 3_600,
} as const;

const BITS_PER_MEGABIT = 1_000_000;

/** A stretch of the curve where bandwidth is a straight line from `from` to `to` (bits/s). */
interface Segment {
  start: number;
  end: number;
  from: number;
  to: number;
}

/** Index of the last point at or before `t`, or -1 if `t` is before the first point. */
function lastPointAtOrBefore(points: readonly CurvePoint[], t: number): number {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((points[middle]?.t ?? Infinity) <= t) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function pointAt(points: readonly CurvePoint[], index: number): CurvePoint {
  const point = points[index];
  if (!point) throw new RangeError("A network needs at least one point.");
  return point;
}

/** The segment that contains `t`; segments are closed at the start and open at the end. */
function segmentAt(curve: NetworkCurve, t: number): Segment {
  const { points } = curve;
  const first = pointAt(points, 0);
  const index = lastPointAtOrBefore(points, t);
  if (index < 0) {
    const rate = first.mbps * BITS_PER_MEGABIT;
    return { start: -Infinity, end: first.t, from: rate, to: rate };
  }
  const point = pointAt(points, index);
  const next = points[index + 1];
  const from = point.mbps * BITS_PER_MEGABIT;
  if (!next) return { start: point.t, end: Infinity, from, to: from };
  const to = curve.shape === "slopes" ? next.mbps * BITS_PER_MEGABIT : from;
  return { start: point.t, end: next.t, from, to };
}

function rateIn(segment: Segment, t: number): number {
  if (segment.from === segment.to) return segment.from;
  const share = (t - segment.start) / (segment.end - segment.start);
  return segment.from + (segment.to - segment.from) * share;
}

/** Bandwidth at time `t`, in bits per second. Holds the first value before the first point and the last after the last. */
export function bandwidthAt(curve: NetworkCurve, t: number): number {
  return rateIn(segmentAt(curve, t), t);
}

/** Bits the link carries between `t0` and `t1` (the exact integral of the curve). */
export function bitsBetween(curve: NetworkCurve, t0: number, t1: number): number {
  let total = 0;
  let t = t0;
  while (t < t1) {
    const segment = segmentAt(curve, t);
    const end = Math.min(segment.end, t1);
    total += ((rateIn(segment, t) + rateIn(segment, end)) / 2) * (end - t);
    t = end;
  }
  return total;
}

/** Seconds between `t0` and `t1` during which the link carries anything (bandwidth above zero). */
export function upTimeBetween(curve: NetworkCurve, t0: number, t1: number): number {
  let total = 0;
  let t = t0;
  while (t < t1) {
    const segment = segmentAt(curve, t);
    const end = Math.min(segment.end, t1);
    if (segment.from > 0 || segment.to > 0) total += end - t;
    t = end;
  }
  return total;
}

/**
 * The time at which `bits` have gone through the link, starting at `from`: the inverse of
 * `bitsBetween`. Returns `Infinity` if the curve ends at zero before they all get through.
 */
export function timeToDeliver(curve: NetworkCurve, from: number, bits: number): number {
  if (bits <= 0) return from;
  let remaining = bits;
  let t = from;
  for (;;) {
    const segment = segmentAt(curve, t);
    const rate = rateIn(segment, t);
    if (segment.end === Infinity) return rate > 0 ? t + remaining / rate : Infinity;

    const duration = segment.end - t;
    const available = ((rate + segment.to) / 2) * duration;
    // Float sums can fall a hair short of an exact match; don't spill that hair into an outage.
    if (remaining - available <= 1e-9 * Math.max(1, remaining)) {
      const slope = (segment.to - segment.from) / (segment.end - segment.start);
      // Solves rate·d + slope·d²/2 = remaining in a form that stays stable when slope is 0 or negative.
      const root = Math.sqrt(Math.max(0, rate * rate + 2 * slope * remaining));
      const d = rate + root > 0 ? (2 * remaining) / (rate + root) : duration;
      return t + Math.min(d, duration);
    }
    remaining -= available;
    t = segment.end;
  }
}

const finiteNumber = (missing: string, wrong: string) =>
  z.number({ error: (issue) => (issue.input === undefined ? missing : wrong) });

const pointSchema = z.object({
  t: finiteNumber("needs a time in seconds", "time must be a number of seconds").min(0, {
    error: "time can't be negative",
  }),
  mbps: finiteNumber("needs a bandwidth in Mbps", "bandwidth must be a number of Mbps")
    .min(0, { error: "bandwidth can't be negative" })
    .max(CURVE_LIMITS.maxMbps, {
      error: `bandwidth can't be above ${CURVE_LIMITS.maxMbps} Mbps`,
    }),
});

const curveFieldsSchema = z.object(
  {
    points: z
      .array(pointSchema, { error: "A network needs a list of points." })
      .min(1, { error: "A network needs at least one point." })
      .max(CURVE_LIMITS.maxPoints, {
        error: `A network can have at most ${CURVE_LIMITS.maxPoints} points.`,
      }),
    shape: z.enum(["steps", "slopes"], { error: 'The shape must be "steps" or "slopes".' }),
    rttMs: finiteNumber(
      "A network needs a latency (rttMs).",
      "The latency (rttMs) must be a number of milliseconds.",
    )
      .min(0, { error: "The latency (rttMs) can't be negative." })
      .max(CURVE_LIMITS.maxRttMs, {
        error: `The latency (rttMs) can't be above ${CURVE_LIMITS.maxRttMs} ms.`,
      }),
    lengthS: finiteNumber(
      "A network needs a length in seconds (lengthS).",
      "The length (lengthS) must be a number of seconds.",
    )
      .gt(0, { error: "The length (lengthS) must be above zero." })
      .max(CURVE_LIMITS.maxLengthS, {
        error: `The length (lengthS) can't be above ${CURVE_LIMITS.maxLengthS} s.`,
      }),
  },
  { error: "A network must be an object with points, shape, rttMs and lengthS." },
);

/** Rules that span several fields: time order, jumps, and points past the end. */
function orderProblems(curve: z.infer<typeof curveFieldsSchema>): string[] {
  const problems: string[] = [];
  curve.points.forEach((point, index) => {
    const number = index + 1;
    if (point.t > curve.lengthS) {
      problems.push(
        `Point ${number} is at ${point.t} s, after the end of the network (${curve.lengthS} s).`,
      );
    }
    const previous = curve.points[index - 1];
    if (!previous) return;
    if (point.t < previous.t) {
      problems.push(
        `Point ${number} (${point.t} s) comes before point ${index} (${previous.t} s); points must be in time order.`,
      );
    } else if (point.t === previous.t && curve.shape === "steps") {
      problems.push(
        `Points ${index} and ${number} are both at ${point.t} s; in a steps network each point needs its own time.`,
      );
    } else if (point.t === previous.t && curve.points[index - 2]?.t === point.t) {
      problems.push(
        `Points ${index - 1}, ${index} and ${number} are all at ${point.t} s; only two points can share a time (a jump).`,
      );
    }
  });
  return problems;
}

/** The zod schema for a valid network curve, including time order. */
export const curveSchema = curveFieldsSchema.check((context) => {
  for (const message of orderProblems(context.value)) {
    context.issues.push({ code: "custom", message, input: context.value, path: ["points"] });
  }
});

export type CurveResult = { ok: true; curve: NetworkCurve } | { ok: false; errors: string[] };

/** Turns zod's issues into sentences a visitor can act on. */
export function describeIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => {
    const { path } = issue;
    const index = path[path.indexOf("points") + 1];
    if (path.includes("points") && typeof index === "number") {
      return `Point ${index + 1}: ${issue.message}.`;
    }
    return issue.message;
  });
}

/** Checks anything (an import, a URL parameter, a message) and returns a curve or plain-English errors. */
export function validateCurve(input: unknown): CurveResult {
  const result = curveSchema.safeParse(input);
  if (result.success) return { ok: true, curve: result.data };
  return { ok: false, errors: describeIssues(result.error.issues) };
}

const FILE_FORMAT = "rebuffer-network";
const FILE_VERSION = 1;

/** Serialises a curve as the JSON file the Networks screen exports. */
export function curveToJson(curve: NetworkCurve): string {
  const { points, shape, rttMs, lengthS } = curve;
  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, shape, rttMs, lengthS, points },
    null,
    2,
  );
}

/** Reads a curve from JSON text; the `format` and `version` fields are optional but must match if present. */
export function curveFromJson(text: string): CurveResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This isn't valid JSON."] };
  }
  if (typeof data === "object" && data !== null) {
    const { format, version } = data as { format?: unknown; version?: unknown };
    if (format !== undefined && format !== FILE_FORMAT) {
      return {
        ok: false,
        errors: [`This file isn't a Rebuffer network (its format is ${JSON.stringify(format)}).`],
      };
    }
    if (version !== undefined && version !== FILE_VERSION) {
      return {
        ok: false,
        errors: [
          `This network file is version ${JSON.stringify(version)}; Rebuffer reads version ${FILE_VERSION}.`,
        ],
      };
    }
  }
  return validateCurve(data);
}
