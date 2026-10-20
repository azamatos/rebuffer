import { describe, expect, it } from "vitest";
import {
  PLAYER_PRESETS,
  playerTitle,
  settingChanges,
  SETTINGS,
  settingsFromParam,
  settingsToParam,
} from "./settings";

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

describe("settings in a link", () => {
  it("writes and reads back changed settings", () => {
    const settings = {
      abrEwmaFastVoD: 1.5,
      backBufferLength: Number.POSITIVE_INFINITY,
      capLevelToPlayerSize: true,
      startLevel: 0,
    };
    const param = settingsToParam(settings);
    expect(param).toBe(
      "abrEwmaFastVoD:1.5,backBufferLength:unlimited,capLevelToPlayerSize:true,startLevel:0",
    );
    expect(settingsFromParam(param)).toEqual({ ok: true, settings });
    expect(settingsFromParam("")).toEqual({ ok: true, settings: {} });
  });

  it("refuses unknown settings and values out of range", () => {
    expect(settingsFromParam("turbo:1")).toEqual({
      ok: false,
      error: "“turbo” isn't a setting the lab knows.",
    });
    expect(settingsFromParam("abrBandWidthFactor:2")).toEqual({
      ok: false,
      error: "abrBandWidthFactor must be a number from 0.05 to 1.",
    });
    expect(settingsFromParam("startLevel:1.5")).toMatchObject({ ok: false });
    expect(settingsFromParam("capLevelToPlayerSize:yes")).toMatchObject({ ok: false });
  });

  it("refuses names every object inherits", () => {
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(settingsFromParam(`${key}:5`)).toEqual({
        ok: false,
        error: `“${key}” isn't a setting the lab knows.`,
      });
    }
  });

  it("finds the changes from a preset and titles them", () => {
    const changes = settingChanges(
      { maxBufferLength: 10, capLevelToPlayerSize: true },
      { maxBufferLength: 10, capLevelToPlayerSize: true, abrEwmaFastVoD: 1.5 },
    );
    expect(changes).toEqual({ abrEwmaFastVoD: 1.5 });
    expect(playerTitle("Low-memory TV", changes)).toBe("low-memory tv · abrEwmaFastVoD 1.5");
    expect(playerTitle("Defaults", {})).toBe("defaults");
  });
});
