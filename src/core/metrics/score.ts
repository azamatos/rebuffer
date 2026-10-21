import { bitsBetween } from "@/core/netsim/curve-math";
import type { NetworkCurve } from "@/core/netsim/curve";
import type { Level } from "@/core/run/events";
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
  /** The quality the run is measured against (see `scoreTarget`); undefined when nothing played. */
  against: Level | undefined;
  /** The simulated network's mean bandwidth over the run, bits per second; undefined without a curve. */
  networkBps: number | undefined;
}

/**
 * The quality a run is measured against: the best the simulated network could carry, the highest rendition at or
 * under its mean bandwidth over the run (the lowest when none fits). A stream whose top is far above the network
 * (Apple's example tops at 40 Mbps) would otherwise score 0 on a 6 Mbps network however well its player did.
 * Without a curve, the ladder's top, as in the papers.
 */
export function scoreTarget(
  metrics: RunMetrics,
  curve?: NetworkCurve,
): { level: Level | undefined; networkBps: number | undefined } {
  const top = topLevel(metrics.levels);
  const spanS = curve ? Math.min(metrics.endS, curve.lengthS) : 0;
  if (!curve || !top || spanS <= 0) return { level: top, networkBps: undefined };
  const networkBps = bitsBetween(curve, 0, spanS) / spanS;
  const fitting = metrics.levels.filter((level) => level.bitrate <= networkBps);
  const lowest = metrics.levels.reduce(
    (low, level) => (level.bitrate < low.bitrate ? level : low),
    top,
  );
  return { level: topLevel(fitting) ?? lowest, networkBps };
}

/** Segment length assumed when no segment was downloaded (Apple's recommended 6 s). */
const DEFAULT_SEGMENT_S = 6;

/**
 * Linear QoE from Yin et al., "A Control-Theoretic Approach for Dynamic Adaptive Video Streaming over HTTP"
 * (SIGCOMM 2015), the model Pensieve and MPC are evaluated with:
 *
 *   QoE = Σ q(R_k) − λ Σ |q(R_k+1) − q(R_k)| − μ · stall seconds − μs · startup seconds
 *
 * with q(R) = bitrate in Mbps, λ = 1, and μ = μs = the bitrate the run is measured against: in the papers the top
 * one; here, given the network's curve, the best the network could carry (`scoreTarget`). One second of stall
 * costs as much as one segment at that quality. Σ q(R_k) runs over segments, so play time is divided by the segment
 * length. The total is divided by a perfect run of the same length (that quality throughout, no stalls, instant
 * start) and shown out of 100.
 */
export function computeScore(metrics: RunMetrics, curve?: NetworkCurve): Score {
  const { level: target, networkBps } = scoreTarget(metrics, curve);
  const segmentS = metrics.segmentS ?? DEFAULT_SEGMENT_S;
  if (!target || metrics.playS <= 0 || metrics.averageBitrate === undefined || segmentS <= 0) {
    return {
      score: 0,
      quality: 0,
      switching: 0,
      stalls: 0,
      startup: 0,
      against: target,
      networkBps,
    };
  }

  const mbps = (bitsPerSecond: number) => bitsPerSecond / 1e6;
  const segments = metrics.playS / segmentS;
  const ideal = segments * mbps(target.bitrate);
  const penaltyPerSecond = mbps(target.bitrate);

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
    against: target,
    networkBps,
  };
}
