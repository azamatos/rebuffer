import { describe, expect, it } from "vitest";
import { PLAYER_PRESETS, SETTINGS } from "./settings";

describe("player presets", () => {
  it("have unique ids and only use known settings", () => {
    const ids = PLAYER_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of PLAYER_PRESETS) {
      for (const key of Object.keys(preset.settings)) expect(SETTINGS).toHaveProperty(key);
    }
  });

  it("start with hls.js defaults", () => {
    expect(PLAYER_PRESETS[0]).toMatchObject({ id: "defaults", settings: {} });
  });
});
