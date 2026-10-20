import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/core/run/events";
import {
  createRunStore,
  describeBrowser,
  MAX_SAVED_RUNS,
  RUN_FORMAT,
  RUN_VERSION,
  type SavedRun,
} from "./runs";
import { summarize } from "./summary";
import { memoryStore } from "./testing";

const events: RunEvent[] = [
  { type: "levels", t: 0.1, levels: [{ index: 0, bitrate: 2_000_000, name: "720p" }] },
  { type: "level-shown", t: 0.9, level: 0 },
  { type: "first-frame", t: 1 },
  {
    type: "segment",
    t: 1,
    level: 0,
    sn: 0,
    bytes: 1_000_000,
    mediaDuration: 4,
    requestedAt: 0.2,
    firstByteAt: 0.3,
    loadedAt: 0.9,
  },
  { type: "stall-start", t: 5 },
  { type: "stall-end", t: 6 },
  { type: "end", t: 11, reason: "complete" },
];

const run = (id: string, savedAt: number): SavedRun => ({
  format: RUN_FORMAT,
  version: RUN_VERSION,
  id,
  startedAt: savedAt - 11_000,
  savedAt,
  setup: {
    streamUrl: "https://media.example/master.m3u8",
    streamName: "Tears of Steel",
    network: {
      id: "lift",
      name: "Lift",
      curve: { shape: "steps", rttMs: 40, lengthS: 11, points: [{ t: 0, mbps: 8 }] },
    },
    player: { presetId: "defaults", name: "Defaults", settings: {} },
  },
  player: { name: "hls.js", version: "1.7.3" },
  environment: { browser: "Chrome on macOS", playerSize: { width: 640, height: 360 } },
  reason: "complete",
  events,
});

describe("summarize", () => {
  it("keeps what the lists show", () => {
    expect(summarize(run("a", 1000))).toMatchObject({
      id: "a",
      savedAt: 1000,
      streamName: "Tears of Steel",
      networkName: "Lift",
      playerName: "Defaults",
      stalls: { count: 1, totalS: 1 },
      averageBitrate: 2_000_000,
      firstFrameS: 1,
      lengthS: 11,
    });
  });
});

describe("the run store", () => {
  it("saves a run, lists it and gives it back", async () => {
    const runs = createRunStore(memoryStore());
    await runs.save(run("a", 1000), summarize(run("a", 1000)));
    await runs.save(run("b", 2000), summarize(run("b", 2000)));
    expect((await runs.list()).map((summary) => summary.id)).toEqual(["b", "a"]);
    expect((await runs.get("a"))?.events).toEqual(events);
    expect(await runs.get("missing")).toBeUndefined();
  });

  it("removes a run with its summary", async () => {
    const store = memoryStore();
    const runs = createRunStore(store);
    await runs.save(run("a", 1000), summarize(run("a", 1000)));
    await runs.remove("a");
    expect(await runs.list()).toEqual([]);
    expect(store.size()).toBe(0);
  });

  it(`keeps the ${MAX_SAVED_RUNS} newest runs`, async () => {
    const runs = createRunStore(memoryStore());
    for (let i = 0; i <= MAX_SAVED_RUNS; i++) {
      const saved = run(`r${i}`, 1000 + i);
      await runs.save(saved, summarize(saved));
    }
    const list = await runs.list();
    expect(list).toHaveLength(MAX_SAVED_RUNS);
    expect(list.at(-1)?.id).toBe("r1");
    expect(await runs.get("r0")).toBeUndefined();
  });

  it("ignores something that isn't a run", async () => {
    const store = memoryStore();
    await store.set("run/x", { format: "other" });
    expect(await createRunStore(store).get("x")).toBeUndefined();
  });
});

describe("describeBrowser", () => {
  it("names common browsers and systems", () => {
    expect(
      describeBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      describeBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(
      describeBrowser(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      ),
    ).toBe("Firefox on Windows");
    expect(
      describeBrowser(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(
      describeBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari on iOS");
    expect(describeBrowser("curl/8")).toBe("a browser");
  });
});
