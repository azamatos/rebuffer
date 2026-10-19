import { describe, expect, it, vi } from "vitest";
import { checkLatency } from "./latency";

/** A fake network: each answer takes the next of `delaysMs` on a fake clock; `undefined` fails the request. */
function network(delaysMs: (number | undefined)[]) {
  let clock = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const delay = delaysMs.shift();
    if (delay === undefined) return Promise.reject(new TypeError("Failed to fetch"));
    clock += delay;
    return Promise.resolve(new Response("#EXTM3U\n"));
  });
  return { fetch, now: () => clock };
}

describe("checkLatency", () => {
  it("leaves out the first answer, which opened the connection, and takes the median of the rest", async () => {
    const { fetch, now } = network([300, 90, 120, 80]);
    expect(await checkLatency("https://media.example/master.m3u8", { fetch, now })).toEqual({
      samplesMs: [300, 90, 120, 80],
      latencyMs: 90,
    });
  });

  it("averages the middle two of an even count", async () => {
    const { fetch, now } = network([300, 90, 120]);
    expect(
      await checkLatency("https://media.example/master.m3u8", { count: 3, fetch, now }),
    ).toEqual({ samplesMs: [300, 90, 120], latencyMs: 105 });
  });

  it("goes past the browser's cache", async () => {
    const { fetch, now } = network([300, 90]);
    await checkLatency("https://media.example/master.m3u8", { count: 2, fetch, now });
    expect(fetch).toHaveBeenCalledWith(
      "https://media.example/master.m3u8",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("stops at the first failure and keeps what it has", async () => {
    const { fetch, now } = network([300, undefined, 90]);
    expect(await checkLatency("https://media.example/master.m3u8", { fetch, now })).toEqual({
      samplesMs: [300],
      latencyMs: 300,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("has no latency when the host never answers", async () => {
    const { fetch, now } = network([]);
    expect(await checkLatency("https://blocked.example/master.m3u8", { fetch, now })).toEqual({
      samplesMs: [],
      latencyMs: undefined,
    });
  });
});
