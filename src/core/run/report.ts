import { curveToParam } from "@/core/netsim/url";
import type { SavedRun } from "@/core/persist/runs";
import {
  formatSetting,
  PLAYER_PRESETS,
  settingChanges,
  SETTINGS,
  settingsToParam,
  type PlayerSettingKey,
  type PlayerSettings,
} from "@/core/player/settings";
import type { Idea } from "./ideas";
import { DEFAULT_NETWORK_ID, DEFAULT_PLAYER_ID, runSearchFor, type RunLinkSearch } from "./setup";

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
  const changes = playerChanges(run);
  const set = Object.keys(changes).length > 0 ? { set: settingsToParam(changes) } : {};
  if (network.id !== undefined) {
    return {
      ...runSearchFor({ streamUrl, networkId: network.id, playerId: player.presetId }, { start }),
      ...set,
    };
  }
  // A drawn network has no id: its curve travels in the link. The network part of runSearchFor is replaced.
  const search = runSearchFor({ streamUrl, networkId: "", playerId: player.presetId }, { start });
  delete search.network;
  return { ...search, curve: curveToParam(network.curve), ...set };
}

/** The settings a saved run changed from its preset's. */
export function playerChanges(run: SavedRun): PlayerSettings {
  const preset = PLAYER_PRESETS.find((candidate) => candidate.id === run.setup.player.presetId);
  return settingChanges(preset?.settings ?? {}, run.setup.player.settings);
}

/**
 * Every setting the lab lets you change, with the value this run used: its own, or hls.js's default.
 * `["startLevel auto", "maxBufferLength 30", …]`, in the order of SETTINGS.
 */
export function describeSettings(settings: PlayerSettings): string[] {
  return (Object.keys(SETTINGS) as PlayerSettingKey[]).map((key) => {
    const value = settings[key] ?? SETTINGS[key].hlsjsDefault;
    return `${key} ${formatSetting(key, value)}`;
  });
}

/** The Run screen's search params for `idea`: this run's setup with the one change, started at once. */
export function ideaSearch(run: SavedRun, idea: Idea): RunLinkSearch & { curve?: string } {
  const next = savedRunSearch(run, { start: true });
  const { apply } = idea;
  if (apply.kind === "settings") {
    return { ...next, set: settingsToParam({ ...playerChanges(run), ...apply.settings }) };
  }
  if (apply.kind === "player") {
    delete next.set;
    if (apply.presetId === DEFAULT_PLAYER_ID) delete next.player;
    else next.player = apply.presetId;
    return next;
  }
  delete next.curve;
  if (apply.networkId === DEFAULT_NETWORK_ID) delete next.network;
  else next.network = apply.networkId;
  return next;
}
