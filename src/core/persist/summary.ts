import { computeMetrics, computeScore } from "@/core/metrics";
import type { RunSummary, SavedRun } from "./runs";

/** What the lists show about a run, computed once when it's saved. */
export function summarize(run: SavedRun): RunSummary {
  const metrics = computeMetrics(run.events);
  return {
    id: run.id,
    savedAt: run.savedAt,
    streamName: run.setup.streamName,
    networkName: run.setup.network.name,
    playerName: run.setup.player.name,
    score: computeScore(metrics).score,
    stalls: { count: metrics.stalls.count, totalS: metrics.stalls.totalS },
    averageBitrate: metrics.averageBitrate,
    firstFrameS: metrics.firstFrameS,
    lengthS: metrics.endS,
  };
}
