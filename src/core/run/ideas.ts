import type { RunMetrics } from "@/core/metrics";
import { bitsBetween, type NetworkCurve } from "@/core/netsim/curve-math";
import { presetById } from "@/core/netsim/presets";
import {
  formatSetting,
  PLAYER_PRESETS,
  SETTINGS,
  type PlayerSettingKey,
  type PlayerSettings,
} from "@/core/player/settings";
import type { Timeline } from "./timeline";

/** One change to try next: a setting, another player preset or another network. */
export type IdeaChange =
  | { kind: "settings"; settings: PlayerSettings }
  | { kind: "player"; presetId: string }
  | { kind: "network"; networkId: string };

export interface Idea {
  title: string;
  /** What changes, briefly: "abrBandWidthFactor 0.95 → 0.8". */
  change: string;
  apply: IdeaChange;
}

export interface IdeaInput {
  metrics: RunMetrics;
  timeline: Timeline;
  curve: NetworkCurve;
  /** The settings the run used. */
  settings: PlayerSettings;
  presetId: string;
  networkId: string | undefined;
}

const MAX_IDEAS = 3;

/** A setting's value in the run: its own, or hls.js's default. */
function effective(settings: PlayerSettings, key: PlayerSettingKey) {
  return settings[key] ?? SETTINGS[key].hlsjsDefault;
}

/**
 * Up to three things to try next, each one change to this run's setup, from what the run shows: stalls suggest
 * headroom, a longer buffer or faster reactions; many switches, a slower climb; a slow start, the lowest quality
 * first; a smooth run, a smaller buffer or a harder network. Ideas, not promises: the run says whether they help.
 */
export function tryNext(input: IdeaInput): Idea[] {
  const { metrics, timeline, curve, settings } = input;
  const ideas: Idea[] = [];
  const setting = (title: string, key: PlayerSettingKey, value: number) => {
    const current = effective(settings, key);
    ideas.push({
      title,
      change: `${key} ${formatSetting(key, current)} → ${formatSetting(key, value)}`,
      apply: { kind: "settings", settings: { [key]: value } },
    });
  };
  const number = (key: PlayerSettingKey) => {
    const value = effective(settings, key);
    return typeof value === "number" ? value : undefined;
  };

  if (metrics.stalls.count > 0) {
    const factor = number("abrBandWidthFactor");
    if (factor !== undefined && factor > 0.8)
      setting("Keep more headroom", "abrBandWidthFactor", 0.8);
    const target = number("maxBufferLength");
    const most = Math.max(0, ...timeline.samples.bufferS);
    if (target !== undefined && target < 60 && most >= 0.8 * target) {
      setting("Buffer further ahead", "maxBufferLength", target * 2);
    }
    const fast = number("abrEwmaFastVoD");
    if (fast !== undefined && fast > 1.5) setting("React faster to drops", "abrEwmaFastVoD", 1.5);
  }

  if (metrics.switches.total >= 6) {
    const up = number("abrBandWidthUpFactor");
    if (up !== undefined && up > 0.5) setting("Climb more carefully", "abrBandWidthUpFactor", 0.5);
  }

  if ((metrics.firstFrameS ?? 0) > 2 && settings.startLevel === undefined) {
    ideas.push({
      title: "Start at the lowest quality",
      change: "startLevel auto → 0",
      apply: { kind: "settings", settings: { startLevel: 0 } },
    });
  }

  const top = Math.max(0, ...metrics.levels.map((level) => level.bitrate));
  const averageNetwork = metrics.endS > 0 ? bitsBetween(curve, 0, metrics.endS) / metrics.endS : 0;
  if (metrics.stalls.count === 0) {
    const up = number("abrBandWidthUpFactor");
    if (
      metrics.topQualityShare < 0.5 &&
      averageNetwork >= 1.2 * top &&
      up !== undefined &&
      up < 0.9
    ) {
      setting("Use more of the bandwidth", "abrBandWidthUpFactor", 0.9);
    }
    if (input.presetId !== "low-memory-tv") {
      ideas.push({
        title: "See the cost of a small buffer",
        change: `${PLAYER_PRESETS.find((preset) => preset.id === "low-memory-tv")?.name ?? "Low-memory TV"} preset`,
        apply: { kind: "player", presetId: "low-memory-tv" },
      });
    }
  }

  if (input.networkId !== "tunnel") {
    ideas.push({
      title: "Same player, a harder network",
      change: presetById("tunnel")?.name ?? "Train through a tunnel",
      apply: { kind: "network", networkId: "tunnel" },
    });
  }

  return ideas.slice(0, MAX_IDEAS);
}
