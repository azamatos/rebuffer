/**
 * Measures the real network before a run: how long the stream's host takes to answer a small request (the
 * playlist), without shaping. The simulation can't make a download start sooner than the real network answers,
 * so when this is above the simulated RTT the run says so.
 */

export interface LatencyCheck {
  /** Each answer's time from request to response, ms, in order. The first one also opened the connection. */
  samplesMs: number[];
  /** The median of the answers after the first; the first alone if it's the only one; undefined if none came. */
  latencyMs: number | undefined;
}

export interface LatencyCheckOptions {
  /** Requests to send, one after another. */
  count?: number;
  /** How long to wait for each answer. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** A clock in milliseconds. */
  now?: () => number;
}

/**
 * Asks `url` for its file `count` times in a row. The first request opens the connection (DNS, TCP, TLS), so the
 * run's first download doesn't pay for that and isn't counted; the median of the others is the latency. Stops at
 * the first failure (unreachable, blocked by CORS, too slow): the run reports the player's own error if it matters.
 */
export async function checkLatency(
  url: string,
  options: LatencyCheckOptions = {},
): Promise<LatencyCheck> {
  const {
    count = 4,
    timeoutMs = 3_000,
    fetch: send = globalThis.fetch.bind(globalThis),
    now = () => performance.now(),
  } = options;
  const samplesMs: number[] = [];
  for (let i = 0; i < count; i++) {
    const startedAt = now();
    try {
      // "no-store" keeps the browser's cache from answering at once; a CDN still answers from its own cache.
      const response = await send(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      samplesMs.push(now() - startedAt);
      // Read to the end: cancelling can close an HTTP/1.1 connection, and the run should reuse it.
      await response.arrayBuffer();
    } catch {
      break;
    }
  }
  return { samplesMs, latencyMs: median(samplesMs.length > 1 ? samplesMs.slice(1) : samplesMs) };
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
