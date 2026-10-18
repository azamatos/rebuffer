/** The hls.js settings the lab lets you change. Anything left out keeps hls.js's own default. */
export interface PlayerSettings {
  /** Level index to start at; leave out to let hls.js choose. */
  startLevel?: number;
  maxBufferLength?: number;
  maxMaxBufferLength?: number;
  backBufferLength?: number;
  abrEwmaFastVoD?: number;
  abrEwmaSlowVoD?: number;
  abrEwmaDefaultEstimate?: number;
  abrBandWidthFactor?: number;
  abrBandWidthUpFactor?: number;
  capLevelToPlayerSize?: boolean;
}

export type PlayerSettingKey = keyof PlayerSettings;

export interface SettingInfo {
  label: string;
  /** One line a person can act on. */
  help: string;
  /** hls.js 1.7.3's default, for display; undefined means "hls.js decides". */
  hlsjsDefault: number | boolean | undefined;
  unit?: "s" | "bit/s";
}

/** Labels, help and hls.js 1.7.3 defaults (checked against its sources on 2026-10-18). */
export const SETTINGS: Record<PlayerSettingKey, SettingInfo> = {
  startLevel: {
    label: "Start level",
    help: "The quality to start with. Lower starts faster; higher looks better from the first frame.",
    hlsjsDefault: undefined,
  },
  maxBufferLength: {
    label: "Buffer target",
    help: "How many seconds ahead the player tries to keep. More rides out drops; less saves memory.",
    hlsjsDefault: 30,
    unit: "s",
  },
  maxMaxBufferLength: {
    label: "Buffer ceiling",
    help: "The most seconds the player may buffer when segments are small.",
    hlsjsDefault: 600,
    unit: "s",
  },
  backBufferLength: {
    label: "Back buffer",
    help: "Seconds of already-played video kept in memory.",
    hlsjsDefault: Number.POSITIVE_INFINITY,
    unit: "s",
  },
  abrEwmaFastVoD: {
    label: "Fast estimate half-life",
    help: "Seconds of history the quick bandwidth average weighs. Lower reacts faster to drops.",
    hlsjsDefault: 3,
    unit: "s",
  },
  abrEwmaSlowVoD: {
    label: "Slow estimate half-life",
    help: "Seconds of history the steady bandwidth average weighs. The player uses the lower of the two.",
    hlsjsDefault: 9,
    unit: "s",
  },
  abrEwmaDefaultEstimate: {
    label: "First estimate",
    help: "The bandwidth the player assumes before it has measured anything.",
    hlsjsDefault: 500_000,
    unit: "bit/s",
  },
  abrBandWidthFactor: {
    label: "Headroom when staying or going down",
    help: "Share of the estimate a level may use. Lower keeps more headroom.",
    hlsjsDefault: 0.95,
  },
  abrBandWidthUpFactor: {
    label: "Headroom when going up",
    help: "Share of the estimate a higher level may use. Lower climbs more carefully.",
    hlsjsDefault: 0.7,
  },
  capLevelToPlayerSize: {
    label: "Cap to player size",
    help: "Never load a level bigger than the video element on screen.",
    hlsjsDefault: false,
  },
};

export interface PlayerPreset {
  id: string;
  name: string;
  description: string;
  settings: PlayerSettings;
}

export const PLAYER_PRESETS: readonly PlayerPreset[] = [
  {
    id: "defaults",
    name: "Defaults",
    description: "hls.js out of the box.",
    settings: {},
  },
  {
    id: "low-memory-tv",
    name: "Low-memory TV",
    description: "Small buffers, capped to the player size, like a weak TV.",
    settings: {
      maxBufferLength: 10,
      maxMaxBufferLength: 20,
      backBufferLength: 10,
      capLevelToPlayerSize: true,
    },
  },
  {
    id: "quality-first",
    name: "Quality first",
    description: "Uses more of the measured bandwidth and climbs sooner.",
    settings: { abrBandWidthFactor: 1, abrBandWidthUpFactor: 0.9 },
  },
  {
    id: "fast-start",
    name: "Fast start",
    description: "Starts at the lowest quality to show a picture sooner.",
    settings: { startLevel: 0 },
  },
];
