import { describe, expect, it } from "vitest";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import type { RunEvent } from "./events";
import { runToHar } from "./har";

const MEDIA = "https://media.example/tos";

type Phase = Extract<RunEvent, { type: "request" }>["phase"];

/** One download's events: `start`, then optional first byte, then how it ended. */
function request(
  id: string,
  url: string,
  steps: [Phase, number][],
  { bytes = 0, status, saved }: { bytes?: number; status?: number; saved?: boolean } = {},
): RunEvent[] {
  return steps.map(([phase, t]) => ({
    type: "request",
    t,
    id,
    url,
    phase,
    bytes: phase === "start" || phase === "first-byte" ? 0 : bytes,
    ...(status === undefined || phase === "start" ? {} : { status }),
    firstByteLateMs: 0,
    bodyLateMs: 0,
    ...(saved ? { saved } : {}),
  }));
}

const run: SavedRun = {
  format: RUN_FORMAT,
  version: RUN_VERSION,
  id: "a1b2c3d4",
  startedAt: Date.parse("2026-10-22T10:00:00.000Z"),
  savedAt: 0,
  setup: {
    streamUrl: `${MEDIA}/master.m3u8`,
    streamName: "Tears of Steel",
    network: {
      id: "lift",
      name: "Lift",
      curve: { shape: "steps", rttMs: 80, lengthS: 10, points: [{ t: 0, mbps: 6 }] },
    },
    player: { presetId: "defaults", name: "hls.js defaults", settings: {} },
  },
  player: { name: "hls.js", version: "1.7.3" },
  environment: { browser: "Chrome on macOS", playerSize: undefined },
  reason: "stopped",
  events: [
    ...request(
      "1",
      `${MEDIA}/master.m3u8`,
      [
        ["start", 0.5],
        ["first-byte", 0.6],
        ["end", 0.7],
      ],
      {
        bytes: 2_000,
        status: 200,
      },
    ),
    // Saved before 2026-10-22: no status.
    ...request(
      "0",
      `${MEDIA}/720p.m3u8`,
      [
        ["start", 0.2],
        ["first-byte", 0.3],
        ["end", 0.4],
      ],
      {
        bytes: 900,
      },
    ),
    ...request(
      "2",
      `${MEDIA}/720p/seg-1.m4s?token=a`,
      [
        ["start", 1],
        ["first-byte", 1.25],
        ["end", 3],
      ],
      { bytes: 1_000_000, status: 200, saved: true },
    ),
    ...request(
      "3",
      `${MEDIA}/720p/seg-2.m4s`,
      [
        ["start", 2],
        ["first-byte", 2.1],
        ["abort", 2.5],
      ],
      {
        bytes: 300_000,
        status: 200,
      },
    ),
    ...request("4", `${MEDIA}/720p/seg-3.m4s`, [
      ["start", 2.2],
      ["error", 2.4],
    ]),
    ...request(
      "5",
      `${MEDIA}/720p/seg-4.m4s`,
      [
        ["start", 3.5],
        ["first-byte", 3.6],
      ],
      {
        status: 200,
      },
    ),
    { type: "end", t: 4, reason: "stopped" },
  ],
};

describe("runToHar", () => {
  const { log } = runToHar(run);
  const byUrl = (end: string) => log.entries.find((entry) => entry.request.url.endsWith(end));

  it("lists every download in the order they started, on one page for the run", () => {
    expect(log.entries.map((entry) => entry.request.url.replace(`${MEDIA}/`, ""))).toEqual([
      "720p.m3u8",
      "master.m3u8",
      "720p/seg-1.m4s?token=a",
      "720p/seg-2.m4s",
      "720p/seg-3.m4s",
      "720p/seg-4.m4s",
    ]);
    expect(log.pages).toEqual([
      {
        startedDateTime: "2026-10-22T10:00:00.000Z",
        id: "run",
        title: "Tears of Steel on Lift, hls.js defaults",
        pageTimings: { onContentLoad: -1, onLoad: -1 },
      },
    ]);
    expect(log.entries.every((entry) => entry.pageref === "run")).toBe(true);
  });

  it("times a download from the simulation: waiting for its first byte, then receiving", () => {
    expect(byUrl("seg-1.m4s?token=a")).toEqual({
      pageref: "run",
      startedDateTime: "2026-10-22T10:00:01.000Z",
      time: 2000,
      request: {
        method: "GET",
        url: `${MEDIA}/720p/seg-1.m4s?token=a`,
        httpVersion: "",
        cookies: [],
        headers: [],
        queryString: [{ name: "token", value: "a" }],
        headersSize: -1,
        bodySize: 0,
      },
      response: {
        status: 200,
        statusText: "",
        httpVersion: "",
        cookies: [],
        headers: [],
        content: { size: 1_000_000, mimeType: "video/iso.segment" },
        redirectURL: "",
        headersSize: -1,
        bodySize: 1_000_000,
        _transferSize: 1_000_000,
      },
      cache: {},
      timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: 250, receive: 1750 },
      comment:
        "Answered from the copy this browser saved in an earlier run; the simulated network still timed it.",
    });
    expect(byUrl("master.m3u8")?.response.content.mimeType).toBe("application/vnd.apple.mpegurl");
  });

  it("marks what was given up, what failed and what the run's end cut short", () => {
    const aborted = byUrl("seg-2.m4s");
    expect(aborted?.response).toMatchObject({
      status: 0,
      bodySize: 300_000,
      _error: "net::ERR_ABORTED",
    });
    expect(aborted?.timings).toMatchObject({ wait: 100, receive: 400 });

    const failed = byUrl("seg-3.m4s");
    expect(failed?.response).toMatchObject({ status: 0, _error: "net::ERR_FAILED" });
    expect(failed?.timings).toMatchObject({ wait: 200, receive: 0 });

    const cut = byUrl("seg-4.m4s");
    expect(cut?.response).toMatchObject({ status: 0, _error: "net::ERR_ABORTED" });
    expect(cut?.timings).toMatchObject({ wait: 100, receive: 400 });
    expect(cut?.comment).toBe("Still downloading when the run ended.");
  });

  it("says when a status is assumed, and that the times are simulated", () => {
    const old = byUrl("720p.m3u8");
    expect(old?.response.status).toBe(200);
    expect(old?.comment).toBe("Runs before 2026-10-22 didn't record the status: 200 is assumed.");
    expect(log.comment).toBe(
      "A Rebuffer run (https://rebuffer.azamatos.com): hls.js 1.7.3 played Tears of Steel through a simulated network, Lift. The times are what the simulation gave the player, not a measurement of a real network.",
    );
    expect(log.browser).toEqual({ name: "Chrome on macOS", version: "" });
  });
});
