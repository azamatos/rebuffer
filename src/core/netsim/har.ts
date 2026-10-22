import { formatClock } from "@/core/format/time";
import { validateCurve, type CurvePoint, type NetworkCurve } from "./curve";
import { CURVE_LIMITS } from "./curve-math";
import { roundRate } from "./edit";

/**
 * A network curve from a HAR file, the "Export HAR" of a browser's developer tools: the throughput the page got,
 * second by second, and a latency. A HAR records what a page downloaded, not what the line could carry: a second
 * without a download says nothing about the network, so it keeps the value before it, and the import says how many
 * there were (AGENTS.md rule 2). The file is read here and only the curve is kept: HAR files can hold cookies and
 * tokens.
 */

/** Smaller responses say more about latency than bandwidth: they're over before the connection gets up to speed. */
export const MIN_MEASURED_BYTES = 50_000;
/** Latency when no request says how long it took, ms (as for a CSV without one). */
const DEFAULT_RTT_MS = 50;
/** A receive phase shorter than this is a cache or a local server, not a network. */
const MIN_RECEIVE_MS = 5;

export type HarResult =
  { ok: true; curve: NetworkCurve; note: string } | { ok: false; errors: string[] };

interface Download {
  /** When its body started and finished arriving, ms since the first request. */
  from: number;
  to: number;
  bytes: number;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
/** A HAR time or size: -1 (or anything not a number) means "doesn't apply". */
const amount = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The seconds of [from, to) that `intervals` cover, each interval counted once where they overlap. */
function covered(intervals: readonly [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [from, to] of sorted) {
    if (to <= end) continue;
    total += to - Math.max(from, end);
    end = to;
  }
  return total;
}

export function curveFromHar(text: string): HarResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This isn't valid JSON, so it can't be a HAR file."] };
  }
  const entries = record(record(parsed).log).entries;
  if (!Array.isArray(entries)) {
    return { ok: false, errors: ["This isn't a HAR file: it has no log.entries."] };
  }

  const starts: number[] = [];
  const raw: { start: number; end: number; receiveFrom: number; receive: number; bytes: number }[] =
    [];
  const tcpMs: number[] = [];
  const waitMs: number[] = [];
  for (const value of entries) {
    const entry = record(value);
    const start = Date.parse(String(entry.startedDateTime));
    if (!Number.isFinite(start)) continue;
    const timings = record(entry.timings);
    const response = record(entry.response);
    const content = record(response.content);
    const before =
      amount(timings.blocked) +
      amount(timings.dns) +
      amount(timings.connect) +
      amount(timings.send) +
      amount(timings.wait);
    const receive = amount(timings.receive);
    starts.push(start);
    if (amount(response.status) === 0) continue;
    // A connection's TCP handshake is about one round trip; HAR counts TLS inside `connect`.
    const tcp = amount(timings.connect) - amount(timings.ssl);
    if (tcp > 0) tcpMs.push(tcp);
    if (amount(timings.wait) > 0) waitMs.push(amount(timings.wait));
    const bytes =
      amount(response._transferSize) || amount(response.bodySize) || amount(content.size);
    raw.push({
      start,
      end: start + Math.max(amount(entry.time), before + receive),
      receiveFrom: start + before,
      receive,
      bytes,
    });
  }
  if (starts.length === 0) {
    return { ok: false, errors: ["This HAR file has no requests with a start time."] };
  }

  const origin = Math.min(...starts);
  const lastEnd = Math.max(...raw.map((entry) => entry.end), origin);
  const fullS = Math.max(1, Math.ceil((lastEnd - origin) / 1000));
  const lengthS = Math.min(fullS, CURVE_LIMITS.maxLengthS);
  const downloads: Download[] = raw
    .filter((entry) => entry.bytes >= MIN_MEASURED_BYTES && entry.receive >= MIN_RECEIVE_MS)
    .map((entry) => ({
      from: (entry.receiveFrom - origin) / 1000,
      to: (entry.receiveFrom + entry.receive - origin) / 1000,
      bytes: entry.bytes,
    }));
  if (downloads.length === 0) {
    return {
      ok: false,
      errors: [
        `This HAR file has no downloads of ${String(MIN_MEASURED_BYTES / 1000)} KB or more, so there's no bandwidth to read from it.`,
      ],
    };
  }

  // Each second: the bits that arrived in it over the time something was arriving, so two downloads at once add up.
  const mbps: (number | undefined)[] = [];
  for (let second = 0; second < lengthS; second++) {
    const intervals: [number, number][] = [];
    let bits = 0;
    for (const download of downloads) {
      const from = Math.max(download.from, second);
      const to = Math.min(download.to, second + 1);
      if (to <= from) continue;
      intervals.push([from, to]);
      bits += (download.bytes * 8 * (to - from)) / (download.to - download.from);
    }
    const busyS = covered(intervals);
    mbps.push(busyS > 0 ? roundRate(bits / busyS / 1e6) : undefined);
  }
  const idleS = mbps.filter((value) => value === undefined).length;
  const firstKnown = mbps.find((value) => value !== undefined) ?? 0;
  const points: CurvePoint[] = [];
  let held = firstKnown;
  mbps.forEach((value, t) => {
    held = value ?? held;
    if (points.at(-1)?.mbps !== held) points.push({ t, mbps: held });
  });

  const tcp = median(tcpMs);
  const wait = median(waitMs);
  const latency = tcp ?? wait ?? DEFAULT_RTT_MS;
  const result = validateCurve({
    shape: "steps",
    rttMs: Math.min(Math.round(latency), CURVE_LIMITS.maxRttMs),
    lengthS,
    points,
  });
  if (!result.ok) return result;

  const sentences = [
    `From ${String(downloads.length)} of ${String(raw.length)} downloads over ${formatClock(lengthS)}: the throughput the page got while it downloaded, which can be less than the line could carry.`,
    idleS === 0
      ? "Something was downloading every second."
      : idleS === 1
        ? "1 s without a download keeps the value before it."
        : `${String(idleS)} s without a download keep the value before them.`,
    tcp !== undefined
      ? `Latency ${String(result.curve.rttMs)} ms: the median time to open a connection.`
      : wait !== undefined
        ? `Latency ${String(result.curve.rttMs)} ms: the median wait for a first byte, which includes the server's own time.`
        : `Latency ${String(result.curve.rttMs)} ms, as the file has no connection or wait times.`,
  ];
  if (fullS > lengthS) sentences.push(`Only its first hour: the editor's limit.`);
  return { ok: true, curve: result.curve, note: sentences.join(" ") };
}
