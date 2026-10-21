import { computeMetrics, computeScore } from "@/core/metrics";
import { playerTitle } from "@/core/player/settings";
import { playerChanges } from "@/core/run/report";
import { SUMMARY_VERSION, type RunSummary, type SavedRun } from "./runs";

/** What the lists show about a run, computed once when it's saved. */
export function summarize(run: SavedRun): RunSummary {
  const metrics = computeMetrics(run.events);
  return {
    version: SUMMARY_VERSION,
    id: run.id,
    savedAt: run.savedAt,
    streamName: run.setup.streamName,
    networkName: run.setup.network.name,
    playerName: run.setup.player.name,
    playerTitle: playerTitle(run.setup.player.name, playerChanges(run)),
    score: computeScore(metrics, run.setup.network.curve).score,
    stalls: { count: metrics.stalls.count, totalS: metrics.stalls.totalS },
    averageBitrate: metrics.averageBitrate,
    firstFrameS: metrics.firstFrameS,
    lengthS: metrics.endS,
  };
}
