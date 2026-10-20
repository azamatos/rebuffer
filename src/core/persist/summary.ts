import { computeMetrics, computeScore } from "@/core/metrics";
import { playerTitle } from "@/core/player/settings";
import { playerChanges } from "@/core/run/report";
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
    playerTitle: playerTitle(run.setup.player.name, playerChanges(run)),
    score: computeScore(metrics).score,
    stalls: { count: metrics.stalls.count, totalS: metrics.stalls.totalS },
    averageBitrate: metrics.averageBitrate,
    firstFrameS: metrics.firstFrameS,
    lengthS: metrics.endS,
  };
}
