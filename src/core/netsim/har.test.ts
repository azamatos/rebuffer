import { describe, expect, it } from "vitest";
import { curveFromFile } from "./csv";
import { curveFromHar } from "./har";

const BASE = Date.parse("2026-10-21T10:00:00.000Z");

/** A HAR entry starting `atMs` after BASE; its body arrives over `receive` ms after `wait`. */
function entry(
  atMs: number,
  {
    wait = 0,
    receive = 1000,
    bytes = 500_000,
    connect = -1,
    ssl = -1,
    status = 200,
  }: Partial<Record<"wait" | "receive" | "bytes" | "connect" | "ssl" | "status", number>> = {},
) {
  return {
    startedDateTime: new Date(BASE + atMs).toISOString(),
    time: Math.max(connect, 0) + wait + receive,
    request: { method: "GET", url: `https://media.example/${String(atMs)}.m4s` },
    response: { status, bodySize: bytes, content: { size: bytes } },
    timings: { blocked: 0, dns: -1, connect, ssl, send: 0, wait, receive },
  };
}
const har = (entries: unknown[]) => JSON.stringify({ log: { version: "1.2", entries } });

describe("curveFromHar", () => {
  it("reads the throughput second by second, adding up downloads at once", () => {
    const result = curveFromHar(
      har([
        // 4 Mb over second 0: 4 Mbps.
        entry(0),
        // 4 Mb over seconds 2 and 3, and 2 Mb more in second 2: 4 Mbps, then 2.
        entry(2000, { receive: 2000 }),
        entry(2000, { bytes: 250_000 }),
        // Two small ones that opened connections: 40 and 50 ms of TCP, past TLS.
        entry(0, { bytes: 2_000, receive: 10, connect: 60, ssl: 20 }),
        entry(100, { bytes: 2_000, receive: 10, connect: 80, ssl: 30 }),
      ]),
    );
    if (!result.ok) throw new Error(result.errors.join(" "));
    expect(result.curve).toEqual({
      shape: "steps",
      rttMs: 45,
      lengthS: 4,
      points: [
        { t: 0, mbps: 4 },
        { t: 3, mbps: 2 },
      ],
    });
    expect(result.note).toBe(
      "From 3 of 5 downloads over 0:04: the throughput the page got while it downloaded, which can be less than the line could carry. 1 s without a download keeps the value before it. Latency 45 ms: the median time to open a connection.",
    );
  });

  it("counts only the time something arrived, not the whole second", () => {
    // 1 Mb in a quarter of a second is 4 Mbps, not 1.
    const result = curveFromHar(har([entry(0, { receive: 250, bytes: 125_000 })]));
    expect(result.ok && result.curve.points).toEqual([{ t: 0, mbps: 4 }]);
  });

  it("leaves out small, cached and failed responses, and takes the latency from first bytes without connections", () => {
    const result = curveFromHar(
      har([
        entry(0, { wait: 70 }),
        entry(100, { bytes: 2_000, wait: 90 }),
        entry(200, { receive: 1, wait: 30 }),
        entry(300, { status: 0, bytes: 900_000 }),
      ]),
    );
    if (!result.ok) throw new Error(result.errors.join(" "));
    expect(result.note).toMatch(/^From 1 of 3 downloads over 0:02:/);
    expect(result.note).toContain("Latency 70 ms: the median wait for a first byte");
  });

  it("says so when no request gives a latency", () => {
    const result = curveFromHar(har([entry(0)]));
    expect(result.ok && result.note).toContain(
      "Latency 50 ms, as the file has no connection or wait times.",
    );
  });

  it("explains a file it can't use", () => {
    expect(curveFromHar("{nope")).toEqual({
      ok: false,
      errors: ["This isn't valid JSON, so it can't be a HAR file."],
    });
    expect(curveFromHar('{"format":"rebuffer-network"}')).toEqual({
      ok: false,
      errors: ["This isn't a HAR file: it has no log.entries."],
    });
    expect(curveFromHar(har([entry(0, { bytes: 1_000 })]))).toEqual({
      ok: false,
      errors: [
        "This HAR file has no downloads of 50 KB or more, so there's no bandwidth to read from it.",
      ],
    });
  });

  it("is what an imported .har file, or a JSON file that opens with a log, is read as", () => {
    const text = har([entry(0)]);
    for (const name of ["trip.har", "trip.json"]) {
      const result = curveFromFile(name, text);
      expect(result.ok && "note" in result).toBe(true);
    }
  });
});
