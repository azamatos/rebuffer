import { presetById, type NetworkPreset } from "./presets";
import { recordedTraces } from "./traces";

/**
 * Every network a link can name by id: the presets and the recorded traces. Kept apart from presets.ts, so Home's
 * setup doesn't load the recordings.
 */
export function networkById(id: string): NetworkPreset | undefined {
  return presetById(id) ?? recordedTraces.find((trace) => trace.id === id);
}
