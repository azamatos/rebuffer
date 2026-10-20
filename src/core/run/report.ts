import { curveToParam } from "@/core/netsim/url";
import type { SavedRun } from "@/core/persist/runs";
import { SETTINGS, type PlayerSettingKey, type PlayerSettings } from "@/core/player/settings";
import { runSearchFor, type RunLinkSearch } from "./setup";

/**
 * Pure helpers behind the Report screen. The screen's numbers come from the metrics; these turn a saved run into
 * links and words.
 */

/** The Run screen's search params that repeat a saved run's setup: a preset by its id, a drawn network as `curve`. */
export function savedRunSearch(
  run: SavedRun,
  { start = false } = {},
): RunLinkSearch & { curve?: string } {
  const { streamUrl, network, player } = run.setup;
  if (network.id !== undefined) {
    return runSearchFor({ streamUrl, networkId: network.id, playerId: player.presetId }, { start });
  }
  // A drawn network has no id: its curve travels in the link. The network part of runSearchFor is replaced.
  const search = runSearchFor({ streamUrl, networkId: "", playerId: player.presetId }, { start });
  delete search.network;
  return { ...search, curve: curveToParam(network.curve) };
}

function settingValue(key: PlayerSettingKey, value: PlayerSettings[PlayerSettingKey]): string {
  if (value === undefined) return key === "startLevel" ? "auto" : "default";
  if (value === Number.POSITIVE_INFINITY) return "unlimited";
  return String(value);
}

/**
 * Every setting the lab lets you change, with the value this run used: its own, or hls.js's default.
 * `["startLevel auto", "maxBufferLength 30", …]`, in the order of SETTINGS.
 */
export function describeSettings(settings: PlayerSettings): string[] {
  return (Object.keys(SETTINGS) as PlayerSettingKey[]).map((key) => {
    const value = settings[key] ?? SETTINGS[key].hlsjsDefault;
    return `${key} ${settingValue(key, value)}`;
  });
}
