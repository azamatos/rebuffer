import type { Container, Segment } from "./types";

export type SegmentContainer = "ts" | "fmp4" | "other";

/**
 * How one segment is packaged: MPEG-TS when its URI ends in .ts, fMP4 when an EXT-X-MAP applies
 * (fMP4 segments need one, RFC 8216 §3.3), otherwise something else (packed audio, WebVTT…).
 */
export function segmentContainer(segment: Pick<Segment, "uri" | "map">): SegmentContainer {
  const path = (segment.uri.split(/[?#]/, 1)[0] ?? "").toLowerCase();
  if (path.endsWith(".ts")) return "ts";
  if (segment.map !== undefined) return "fmp4";
  return "other";
}

/** One container for the whole playlist: "mixed" when segments disagree. */
export function playlistContainer(segments: Pick<Segment, "uri" | "map">[]): Container {
  const kinds = new Set(segments.map(segmentContainer));
  if (kinds.size === 0) return "unknown";
  if (kinds.size > 1) return "mixed";
  const [only] = kinds;
  return only === "other" || only === undefined ? "unknown" : only;
}
