import { rfc8216, sortFindings } from "./findings";
import { capitalize, formatBitrate, variantName } from "./format";
import {
  keyNoneWithAttributes,
  longTargetDuration,
  type MediaRule,
  mediaVersionTooLow,
  missingTargetDuration,
  mixedContainers,
  noSegments,
  segmentOverTarget,
  unevenSegmentDurations,
  vodWithoutEndList,
} from "./rules-media";
import {
  averageBandwidthOverPeak,
  duplicateVariantUri,
  ladderGap,
  missingCodecs,
  missingFrameRate,
  missingIndependentSegments,
  missingMediaGroup,
  missingResolution,
  type MultivariantRule,
  multivariantVersionTooLow,
  noIFramePlaylists,
  noVariants,
} from "./rules-multivariant";
import type { Finding, MediaPlaylist, MultivariantPlaylist, VariantBase } from "./types";

const MULTIVARIANT_RULES: MultivariantRule[] = [
  noVariants,
  missingCodecs,
  missingResolution,
  missingFrameRate,
  averageBandwidthOverPeak,
  missingMediaGroup,
  noIFramePlaylists,
  missingIndependentSegments,
  ladderGap,
  duplicateVariantUri,
  multivariantVersionTooLow,
];

const MEDIA_RULES: MediaRule[] = [
  missingTargetDuration,
  segmentOverTarget,
  vodWithoutEndList,
  noSegments,
  longTargetDuration,
  mixedContainers,
  unevenSegmentDurations,
  keyNoneWithAttributes,
  mediaVersionTooLow,
];

/** Checks a multivariant playlist; findings come sorted by severity, then line. */
export function lintMultivariant(playlist: MultivariantPlaylist): Finding[] {
  return sortFindings(MULTIVARIANT_RULES.flatMap((rule) => rule(playlist)));
}

/** Checks a media playlist; findings come sorted by severity, then line. */
export function lintMedia(playlist: MediaPlaylist): Finding[] {
  return sortFindings(MEDIA_RULES.flatMap((rule) => rule(playlist)));
}

/** Measured peaks within this margin of BANDWIDTH are measurement noise, not a finding. */
const BANDWIDTH_TOLERANCE = 1.1;

/**
 * Compares a variant's declared BANDWIDTH with the peak segment bit rate measured from its
 * segments. Returns a warning when the peak is more than 10% higher, otherwise undefined.
 */
export function lintMeasuredBandwidth(
  variant: Pick<VariantBase, "line" | "resolution" | "bandwidth">,
  measuredPeakBps: number,
): Finding | undefined {
  const declared = variant.bandwidth;
  if (declared === undefined || !Number.isFinite(measuredPeakBps)) return undefined;
  if (measuredPeakBps <= declared * BANDWIDTH_TOLERANCE) return undefined;
  return {
    id: "bandwidth-under-declared",
    severity: "warning",
    message: `${capitalize(variantName(variant))} declares ${formatBitrate(declared)}; its segments peak at ${formatBitrate(measuredPeakBps)}.`,
    detail:
      "Players choose a variant by comparing BANDWIDTH with the measured network speed. When the real segments are bigger than declared, the player picks a variant the network can't sustain, and playback stalls.",
    line: variant.line,
    ref: rfc8216("4.3.4.2"),
  };
}
