// Low-latency HLS tags (rfc8216bis §4.4.3.7–8, §4.4.4.9, §4.4.5.2–4). Recorded with their
// attributes; the parser doesn't apply their playback rules.
import type { ParseContext } from "./context";
import type { TagLine } from "./lines";
import type { Part, PartInfo, PreloadHint, RenditionReport, ServerControl, Skip } from "./types";
import { parseByteRange } from "./values";

export function readServerControl(tag: TagLine, context: ParseContext): ServerControl {
  const attributes = context.attributes(tag);
  return {
    line: tag.line,
    canSkipUntil: attributes.float("CAN-SKIP-UNTIL"),
    canSkipDateRanges: attributes.yesNo("CAN-SKIP-DATERANGES") ?? false,
    holdBack: attributes.float("HOLD-BACK"),
    partHoldBack: attributes.float("PART-HOLD-BACK"),
    canBlockReload: attributes.yesNo("CAN-BLOCK-RELOAD") ?? false,
    attributes: attributes.record(),
  };
}

export function readPartInfo(tag: TagLine, context: ParseContext): PartInfo {
  const attributes = context.attributes(tag);
  attributes.require("PART-TARGET");
  return {
    line: tag.line,
    partTarget: attributes.float("PART-TARGET"),
    attributes: attributes.record(),
  };
}

/** A part without its media sequence number, which depends on the segments after it. */
export function readPart(
  tag: TagLine,
  context: ParseContext,
): Omit<Part, "mediaSequence"> | undefined {
  const attributes = context.attributes(tag);
  attributes.require("DURATION");
  if (!attributes.require("URI")) return undefined;
  const uri = attributes.quoted("URI") ?? "";
  const rangeText = attributes.quoted("BYTERANGE");
  const byteRange = rangeText === undefined ? undefined : parseByteRange(rangeText);
  if (rangeText !== undefined && byteRange === undefined) {
    context.report(
      tag.line,
      `EXT-X-PART: BYTERANGE should look like 1000@0; found "${rangeText}".`,
    );
  }
  return {
    line: tag.line,
    uri,
    resolvedUri: context.resolve(uri, tag.line),
    duration: attributes.float("DURATION"),
    independent: attributes.yesNo("INDEPENDENT") ?? false,
    byteRange,
    gap: attributes.yesNo("GAP") ?? false,
    attributes: attributes.record(),
  };
}

export function readPreloadHint(tag: TagLine, context: ParseContext): PreloadHint | undefined {
  const attributes = context.attributes(tag);
  attributes.require("TYPE");
  if (!attributes.require("URI")) return undefined;
  const uri = attributes.quoted("URI") ?? "";
  return {
    line: tag.line,
    type: attributes.enumerated("TYPE", ["PART", "MAP"]),
    uri,
    resolvedUri: context.resolve(uri, tag.line),
    byteRangeStart: attributes.integer("BYTERANGE-START"),
    byteRangeLength: attributes.integer("BYTERANGE-LENGTH"),
    attributes: attributes.record(),
  };
}

export function readRenditionReport(tag: TagLine, context: ParseContext): RenditionReport {
  const attributes = context.attributes(tag);
  const uri = attributes.quoted("URI");
  return {
    line: tag.line,
    uri,
    resolvedUri: uri === undefined ? undefined : context.resolve(uri, tag.line),
    lastMsn: attributes.integer("LAST-MSN"),
    lastPart: attributes.integer("LAST-PART"),
    attributes: attributes.record(),
  };
}

export function readSkip(tag: TagLine, context: ParseContext): Skip {
  const attributes = context.attributes(tag);
  attributes.require("SKIPPED-SEGMENTS");
  const removed = attributes.quoted("RECENTLY-REMOVED-DATERANGES");
  return {
    line: tag.line,
    skippedSegments: attributes.integer("SKIPPED-SEGMENTS"),
    recentlyRemovedDateRanges:
      removed === undefined ? [] : removed.split("\t").filter((id) => id !== ""),
    attributes: attributes.record(),
  };
}
