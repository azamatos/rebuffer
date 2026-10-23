import { formatMbps } from "@/core/format/bitrate";
import { formatClock } from "@/core/format/time";
import type { MediaPlaylist } from "@/core/hls";
import type { Measured } from "./load";

/** Segments the Segments panel measures in one playlist; a longer one is charted this far. */
export const MAX_CHARTED_SEGMENTS = 400;

/** One segment as the Segments panel charts it. */
export interface SegmentBar {
  index: number;
  start: number;
  duration: number;
  /** Its size over its duration; undefined when the size couldn't be read. */
  bps: number | undefined;
  /** Longer than the target duration, rounded as the rule reads it. */
  overTarget: boolean;
}

export interface SegmentChart {
  bars: SegmentBar[];
  /** Over the segments whose size was read, weighted by duration. */
  averageBps: number | undefined;
  peak: SegmentBar | undefined;
  /** "184 segments · 4 s each · 12:14 · average 2.3 Mbps" */
  stats: string;
  /** What the chart shows, in a sentence. */
  takeaway: string;
}

const seconds = (value: number) => `${Number(value.toFixed(2))} s`;

/**
 * A media playlist's segments with each one's bit rate (`measured`, from `measureMedia`), against what its variants
 * declare (`declaredBps`, video only). `separateAudio`: the declared bandwidth counts audio the bars don't.
 */
export function segmentChart(
  playlist: MediaPlaylist,
  measured: Measured | undefined,
  { declaredBps, separateAudio = false }: { declaredBps?: number; separateAudio?: boolean } = {},
): SegmentChart {
  const target = playlist.targetDuration;
  // `measured.rates` follow the segments that have media, in order.
  const charted = playlist.segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => !segment.gap && segment.duration > 0);
  const bars = charted.slice(0, MAX_CHARTED_SEGMENTS).map(({ segment, index }, i): SegmentBar => ({
    index,
    start: segment.startTime,
    duration: segment.duration,
    bps: measured?.rates[i],
    overTarget: target !== undefined && Math.round(segment.duration) > target,
  }));

  const known = bars.filter((bar) => bar.bps !== undefined);
  const knownS = known.reduce((total, bar) => total + bar.duration, 0);
  const averageBps =
    knownS > 0
      ? known.reduce((total, bar) => total + (bar.bps ?? 0) * bar.duration, 0) / knownS
      : undefined;
  const peak = known.reduce<SegmentBar | undefined>(
    (best, bar) => (best === undefined || (bar.bps ?? 0) > (best.bps ?? 0) ? bar : best),
    undefined,
  );

  // The usual length: all but the last segment, which may be short.
  const lengths = bars.slice(0, -1).map((bar) => bar.duration);
  const usual = lengths.length > 0 ? lengths : bars.map((bar) => bar.duration);
  const low = Math.min(...usual);
  const high = Math.max(...usual);
  const each =
    usual.length === 0
      ? undefined
      : high - low <= 0.05 * high
        ? `${seconds(high)} each`
        : `${seconds(low)}–${seconds(high)}`;
  const counted =
    charted.length > bars.length
      ? `the first ${String(bars.length)} of ${String(charted.length)} segments`
      : `${String(bars.length)} ${bars.length === 1 ? "segment" : "segments"}`;
  const stats = [
    counted,
    each,
    formatClock(playlist.totalDuration),
    averageBps === undefined ? undefined : `average ${formatMbps(averageBps)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  let takeaway: string;
  if (peak?.bps === undefined) {
    takeaway =
      bars.length === 0
        ? "No segments to chart."
        : "The segments' sizes couldn't be read, so there's no bit rate to chart.";
  } else if (declaredBps === undefined) {
    takeaway = `The busiest segment, at ${formatClock(peak.start)}, needs ${formatMbps(peak.bps)}; on average ${formatMbps(averageBps ?? 0)}.`;
  } else if (peak.bps > declaredBps) {
    const over = Math.round((peak.bps / declaredBps - 1) * 100);
    takeaway = `The busiest segment, at ${formatClock(peak.start)}, needs ${formatMbps(peak.bps)}: ${over > 0 ? `${String(over)}% more than` : "more than"} the ${formatMbps(declaredBps)} declared.`;
  } else {
    takeaway = `Every segment fits under the declared ${formatMbps(declaredBps)}. The busiest, at ${formatClock(peak.start)}, needs ${formatMbps(peak.bps)}.`;
  }
  if (peak?.bps !== undefined && declaredBps !== undefined && separateAudio) {
    takeaway += " The declared bandwidth counts its audio too; the bars are the video alone.";
  }
  return { bars, averageBps, peak, stats, takeaway };
}
