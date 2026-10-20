import { describe, expect, it } from "vitest";
import { RUN_FORMAT, RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import { DEFAULT_STREAM } from "@/core/samples";
import { describeSettings, savedRunSearch } from "./report";

const saved = (network: SavedRun["setup"]["network"], presetId = "defaults"): SavedRun => ({
  format: RUN_FORMAT,
  version: RUN_VERSION,
  id: "a1b2c3d4",
  startedAt: 0,
  savedAt: 0,
  setup: {
    streamUrl: DEFAULT_STREAM.url,
    streamName: DEFAULT_STREAM.name,
    network,
    player: { presetId, name: "Defaults", settings: {} },
  },
  player: { name: "hls.js", version: "1.7.3" },
  environment: { browser: "Chrome on macOS", playerSize: undefined },
  reason: "complete",
  events: [],
});

const curve = { shape: "steps" as const, rttMs: 50, lengthS: 12, points: [{ t: 0, mbps: 4 }] };

describe("savedRunSearch", () => {
  it("repeats a preset network by its id", () => {
    expect(savedRunSearch(saved({ id: "lift", name: "Lift", curve }, "fast-start"))).toEqual({
      network: "lift",
      player: "fast-start",
    });
    expect(savedRunSearch(saved({ id: "tunnel", name: "Tunnel", curve }), { start: true })).toEqual(
      {
        start: "now",
      },
    );
  });

  it("carries a drawn network in the link", () => {
    expect(savedRunSearch(saved({ id: undefined, name: "Custom network", curve }))).toEqual({
      curve: "steps,50,12,0:4",
    });
  });
});

describe("describeSettings", () => {
  it("lists every setting with the run's value or hls.js's default", () => {
    const lines = describeSettings({ maxBufferLength: 10, capLevelToPlayerSize: true });
    expect(lines).toContain("startLevel auto");
    expect(lines).toContain("maxBufferLength 10");
    expect(lines).toContain("backBufferLength unlimited");
    expect(lines).toContain("abrEwmaFastVoD 3");
    expect(lines).toContain("capLevelToPlayerSize true");
    expect(lines).toHaveLength(10);
  });
});
