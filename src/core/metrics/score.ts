import { topLevel, type RunMetrics } from "./metrics";

/** The score and what it's made of, all in points out of 100. */
export interface Score {
  score: number;
  /** Points earned by the bitrate on screen. */
  quality: number;
  /** Points lost to quality switches. */
  switching: number;
  /** Points lost to stalls. */
  stalls: number;
  /** Points lost to the wait for the first frame. */
  startup: number;
}

/** Segment length assumed when no segment was downloaded (Apple's recommended 6 s). */
const DEFAULT_SEGMENT_S = 6;

/**
 * Linear QoE from Yin et al., "A Control-Theoretic Approach for Dynamic Adaptive Video Streaming over HTTP"
 * (SIGCOMM 2015), the model Pensieve and MPC are evaluated with:
 *
 *   QoE = Σ q(R_k) − λ Σ |q(R_k+1) − q(R_k)| − μ · stall seconds − μs · startup seconds
 *
 * with q(R) = bitrate in Mbps, λ = 1, and μ = μs = the top bitrate, as in both papers (one second of stall costs
 * as much as one segment at the best quality). Σ q(R_k) runs over segments, so play time is divided by the segment
 * length. The total is divided by a perfect run of the same length (top quality throughout, no stalls, instant
 * start) and shown out of 100.
 */
export function computeScore(metrics: RunMetrics): Score {
  const top = topLevel(metrics.levels);
  const segmentS = metrics.segmentS ?? DEFAULT_SEGMENT_S;
  if (!top || metrics.playS <= 0 || metrics.averageBitrate === undefined || segmentS <= 0) {
    return { score: 0, quality: 0, switching: 0, stalls: 0, startup: 0 };
  }

  const mbps = (bitsPerSecond: number) => bitsPerSecond / 1e6;
  const segments = metrics.playS / segmentS;
  const ideal = segments * mbps(top.bitrate);
  const penaltyPerSecond = mbps(top.bitrate);

  const bitrateOf = (index: number) =>
    metrics.levels.find((level) => level.index === index)?.bitrate ?? 0;
  let switchCost = 0;
  for (let i = 1; i < metrics.shown.length; i++) {
    const from = metrics.shown[i - 1];
    const to = metrics.shown[i];
    if (from && to) switchCost += Math.abs(mbps(bitrateOf(to.level)) - mbps(bitrateOf(from.level)));
  }

  const points = (value: number) => (100 * value) / ideal;
  const quality = points(segments * mbps(metrics.averageBitrate));
  const switching = points(switchCost);
  const stalls = points(penaltyPerSecond * metrics.stalls.totalS);
  const startup = points(penaltyPerSecond * (metrics.firstFrameS ?? 0));

  return {
    score: Math.min(100, Math.max(0, quality - switching - stalls - startup)),
    quality,
    switching,
    stalls,
    startup,
  };
}
