import { describe, expect, it } from "vitest";
import type { Level, RunEvent } from "./events";
import type { Honesty } from "@/core/metrics";
import type { NetworkCurve } from "@/core/netsim/curve";
import {
  describeEvents,
  describeHonesty,
  describeNetworkCheck,
  formatMbps,
  honestyWarning,
  levelLabel,
} from "./describe";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
];

describe("formatMbps", () => {
  it("picks a readable unit", () => {
    expect(formatMbps(400_000)).toBe("400 kbps");
    expect(formatMbps(2_800_000)).toBe("2.8 Mbps");
    expect(formatMbps(6_000_000)).toBe("6 Mbps");
    expect(formatMbps(50_000_000)).toBe("50 Mbps");
  });
});

describe("levelLabel", () => {
  it("names a level with its bitrate", () => {
    expect(levelLabel(levels[1], 1)).toBe("720p (2.8 Mbps)");
    expect(levelLabel(undefined, 3)).toBe("level 4");
  });
});

describe("describeEvents", () => {
  it("tells the story of a run in plain words", () => {
    const events: RunEvent[] = [
      { type: "levels", t: 0.2, levels },
      { type: "level-shown", t: 1.1, level: 1 },
      { type: "first-frame", t: 1.42 },
      { type: "sample", t: 2, bufferS: 3, estimateBps: 3e6, droppedFrames: 0, position: 0.6 },
      { type: "segment-abandoned", t: 26, level: 1, sn: 7, bytesLoaded: 1_400_000 },
      { type: "level-shown", t: 26, level: 0 },
      { type: "stall-start", t: 51.8 },
      { type: "stall-end", t: 55.2 },
      { type: "level-shown", t: 60, level: 1 },
      { type: "end", t: 90, reason: "complete" },
    ];
    expect(describeEvents(events).map((line) => `${line.time} ${line.text}`)).toEqual([
      "0:00.2 Playlist loaded: 2 qualities.",
      "0:01.1 Playing 720p (2.8 Mbps).",
      "0:01.4 First frame on screen.",
      "0:26.0 Gave up on a 720p (2.8 Mbps) segment after 1.4 MB.",
      "0:26.0 Switched down to 240p (400 kbps).",
      "0:51.8 Stall: the buffer ran out.",
      "0:55.2 Playing again after 3.4 s.",
      "1:00.0 Switched up to 720p (2.8 Mbps).",
      "1:30.0 Run finished.",
    ]);
  });

  it("leaves out the player's non-fatal notices", () => {
    const lines = describeEvents([
      { type: "error", t: 1.2, fatal: false, message: "fragment loaded with buffer holes" },
    ]);
    expect(lines).toEqual([]);
  });

  it("reports fatal errors and stops", () => {
    const lines = describeEvents([
      { type: "error", t: 3, fatal: true, message: "The stream couldn't be loaded." },
      { type: "end", t: 3, reason: "error" },
    ]);
    expect(lines.map((line) => line.text)).toEqual([
      "Stopped: The stream couldn't be loaded.",
      "Run ended with an error.",
    ]);
  });
});

describe("describeNetworkCheck", () => {
  const check = (
    latencyMs: number | undefined,
    streamSaved = false,
  ): Extract<RunEvent, { type: "network-check" }> => ({
    type: "network-check",
    t: 0,
    host: "media.azamatos.com",
    latencyMs,
    samplesMs: [],
    streamSaved,
  });

  it("warns when the real latency is above the simulated one", () => {
    expect(describeNetworkCheck(check(85), 40)).toBe(
      "Your real latency to media.azamatos.com is about 85 ms, above the simulated 40 ms, so downloads can't start as soon as this network would start them. The result will say how much that mattered.",
    );
  });

  it("stays quiet within the shaper's own margin, and when there was no answer", () => {
    expect(describeNetworkCheck(check(95), 80)).toBeUndefined();
    expect(describeNetworkCheck(check(undefined), 80)).toBeUndefined();
    expect(describeNetworkCheck(undefined, 80)).toBeUndefined();
  });

  it("still warns when the stream is saved: only the downloads already saved skip the real network", () => {
    expect(describeNetworkCheck(check(85, true), 40)).toBe(
      "Your real latency to media.azamatos.com is about 85 ms, above the simulated 40 ms. Downloads saved by an earlier run don't wait for it, but any this run needs that aren't saved can't start as soon as this network would start them. The result will say how much that mattered.",
    );
  });
});

describe("describeHonesty", () => {
  const network = (rttMs: number, topMbps: number): NetworkCurve => ({
    shape: "steps",
    rttMs,
    lengthS: 90,
    points: [
      { t: 0, mbps: topMbps },
      { t: 20, mbps: 1.2 },
    ],
  });
  const honesty = (overrides: {
    latency?: Partial<Honesty["latency"]>;
    bandwidth?: Partial<Honesty["bandwidth"]>;
    hiddenS?: number;
    saved?: number;
  }): Honesty => ({
    requests: 94,
    saved: overrides.saved ?? 0,
    latency: {
      host: "media.azamatos.com",
      realMs: 97,
      late: 0,
      typicalLateMs: 0,
      worstLateMs: 12,
      ...overrides.latency,
    },
    bandwidth: {
      late: 0,
      typicalLateMs: 0,
      worstLateMs: 0,
      realBps: 24_000_000,
      ...overrides.bandwidth,
    },
    hiddenS: overrides.hiddenS ?? 0,
  });

  it("says when every download came from the saved copy", () => {
    expect(describeHonesty(honesty({ saved: 94 }), network(80, 6))).toEqual([
      "All 94 downloads came from the copy saved in this browser by an earlier run, so your real network played no part.",
    ]);
  });

  it("says how many downloads came from the saved copy and how the rest went", () => {
    expect(describeHonesty(honesty({ saved: 90 }), network(80, 6))).toEqual([
      "90 of 94 downloads came from the copy saved in this browser by an earlier run; the other 4 went over your real network.",
      "Your connection kept up: all 94 downloads arrived before the simulation needed them.",
    ]);
  });

  it("says the connection kept up when nothing was late", () => {
    expect(describeHonesty(honesty({}), network(80, 6))).toEqual([
      "Your connection kept up: all 94 downloads arrived before the simulation needed them.",
    ]);
  });

  it("reports late starts without blaming them on the latency measured before the run", () => {
    expect(
      describeHonesty(
        honesty({ latency: { late: 75, typicalLateMs: 128, worstLateMs: 390 } }),
        network(80, 6),
      ),
    ).toEqual([
      "75 of 94 downloads started late, typically by 128 ms and at most 390 ms: the real network took longer to answer than the simulated 80 ms latency.",
      "Measured before the run, media.azamatos.com answered in about 97 ms.",
      "Once downloads started, your connection kept up.",
    ]);
  });

  it("leaves out the measured latency when the check got no answer", () => {
    expect(
      describeHonesty(
        honesty({ latency: { realMs: undefined, late: 2, typicalLateMs: 40, worstLateMs: 60 } }),
        network(200, 1.5),
      ),
    ).toEqual([
      "2 of 94 downloads started late, typically by 40 ms and at most 60 ms: the real network took longer to answer than the simulated 200 ms latency.",
      "Once downloads started, your connection kept up.",
    ]);
  });

  it("puts late bytes down to the bandwidth when the real network was slower than the simulation's top speed", () => {
    expect(
      describeHonesty(
        honesty({
          bandwidth: { late: 7, typicalLateMs: 300, worstLateMs: 1240, realBps: 18_000_000 },
        }),
        network(15, 50),
      ),
    ).toEqual([
      "7 of 94 downloads arrived late, typically by 300 ms and at most 1.2 s: the real network couldn't keep up with the simulated bandwidth (it delivered about 18 Mbps while downloading; the simulation goes up to 50 Mbps).",
      "This run is slower than the simulated network alone.",
    ]);
  });

  it("calls late bytes pauses when the real network was faster on average", () => {
    expect(
      describeHonesty(
        honesty({ bandwidth: { late: 8, typicalLateMs: 57, worstLateMs: 262 } }),
        network(80, 6),
      )[0],
    ).toBe(
      "8 of 94 downloads arrived late, typically by 57 ms and at most 262 ms: the real network paused partway through them, though on average it delivered about 24 Mbps, more than the simulated top speed of 6 Mbps.",
    );
  });

  it("names both, and a background tab", () => {
    expect(
      describeHonesty(
        honesty({
          latency: { late: 3, typicalLateMs: 90, worstLateMs: 120 },
          bandwidth: { late: 1, typicalLateMs: 268, worstLateMs: 268, realBps: undefined },
          hiddenS: 12,
        }),
        network(40, 6),
      ),
    ).toEqual([
      "3 of 94 downloads started late, typically by 90 ms and at most 120 ms: the real network took longer to answer than the simulated 40 ms latency.",
      "Measured before the run, media.azamatos.com answered in about 97 ms.",
      "1 of 94 downloads arrived late, typically by 268 ms and at most 268 ms: the real network didn't deliver them as fast as the simulation could send them.",
      "This run is slower than the simulated network alone.",
      "The tab was in the background for 12 s, where browsers slow down timers, so the player may have behaved differently than in a visible tab.",
    ]);
  });

  it("says nothing about downloads when there were none", () => {
    expect(describeHonesty({ ...honesty({}), requests: 0 }, network(80, 6))).toEqual([]);
  });

  describe("honestyWarning", () => {
    it("is quiet when the simulated network alone shaped the run", () => {
      expect(honestyWarning(honesty({}))).toBeUndefined();
      expect(honestyWarning(honesty({ saved: 94 }))).toBeUndefined();
    });

    it("leads with late bytes, which slow the run itself", () => {
      expect(
        honestyWarning(
          honesty({
            latency: { late: 3, typicalLateMs: 90, worstLateMs: 120 },
            bandwidth: { late: 7, typicalLateMs: 300, worstLateMs: 1240 },
            hiddenS: 12,
          }),
        ),
      ).toBe(
        "Your real network held downloads back at times: 7 of 94 downloads arrived late, so this run is slower than the simulated network alone.",
      );
    });

    it("names late first bytes when the bytes themselves kept up", () => {
      expect(
        honestyWarning(honesty({ latency: { late: 78, typicalLateMs: 101, worstLateMs: 300 } })),
      ).toBe(
        "Your real network took longer to answer than the simulated latency at times: 78 of 94 downloads started late, typically by 101 ms.",
      );
    });

    it("names a background tab on its own", () => {
      expect(honestyWarning(honesty({ hiddenS: 20 }))).toBe(
        "The tab was in the background for 20 s, where browsers slow down timers.",
      );
    });
  });
});
