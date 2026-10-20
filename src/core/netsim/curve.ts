import { z } from "../zod";
import { CURVE_LIMITS, type NetworkCurve } from "./curve-math";

export * from "./curve-math";

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
