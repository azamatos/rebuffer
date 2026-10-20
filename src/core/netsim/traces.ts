import irish4g from "../../../content/traces/irish-4g.json";
import type { NetworkCurve } from "./curve-math";
import type { NetworkPreset } from "./presets";

/**
 * Recorded networks: excerpts of real 4G recordings (content/traces/, made by scripts/traces/convert-irish4g.mjs).
 * They're used like presets, by id, and always shown with their credit (AGENTS.md rule 5).
 */
export interface RecordedTrace extends NetworkPreset {
  /** Where in the dataset the excerpt starts. */
  source: { file: string; fromS: number };
}

/** The credit the dataset's licence (CC BY 4.0) asks for. */
export const TRACE_CREDIT = {
  citation: irish4g.citation,
  authors: irish4g.authors,
  dataset: irish4g.dataset,
  licence: irish4g.licence,
  licenceUrl: irish4g.licenceUrl,
  sourceUrl: irish4g.sourceUrl,
  changes: irish4g.changes,
};

// The JSON's shape is checked by src/core/netsim/traces.test.ts, so the cast is safe.
export const recordedTraces: readonly RecordedTrace[] = irish4g.traces.map((trace) => ({
  ...trace,
  curve: trace.curve as NetworkCurve,
}));
