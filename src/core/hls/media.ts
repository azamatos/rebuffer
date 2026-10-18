import { type CommonState, readCommonTag, readKey } from "./common";
import { playlistContainer } from "./container";
import type { ParseContext } from "./context";
import type { PlaylistLine, TagLine, UriLine } from "./lines";
import {
  readPart,
  readPartInfo,
  readPreloadHint,
  readRenditionReport,
  readServerControl,
  readSkip,
} from "./low-latency";
import { MULTIVARIANT_TAGS } from "./tags";
import type {
  ByteRange,
  DateRange,
  Key,
  MediaInitialization,
  MediaPlaylist,
  Part,
  PartInfo,
  PreloadHint,
  RenditionReport,
  Segment,
  ServerControl,
  Skip,
} from "./types";
import { parseByteRange, roundSeconds } from "./values";

type SegmentDraft = Omit<Segment, "mediaSequence" | "discontinuitySequence" | "startTime">;

/** Tags that apply to the next URI line, waiting for it. Each keeps the line it came from. */
interface Pending {
  info?: { line: number; duration: number; title: string };
  byteRange?: { line: number; length: number; offset?: number | undefined };
  discontinuity?: number;
  programDateTime?: { line: number; value: string };
  gap?: number;
}

/** Reads the lines after #EXTM3U as a media playlist (RFC 8216 §4.3.2–4.3.3). */
export function parseMedia(lines: PlaylistLine[], context: ParseContext): MediaPlaylist {
  const reader = new MediaReader(context);
  for (const line of lines) {
    if (line.type === "uri") reader.uri(line);
    else reader.tag(line);
  }
  return reader.finish();
}

class MediaReader {
  private readonly common: CommonState = { independentSegments: false };
  private targetDuration: number | undefined;
  private mediaSequence = 0;
  private discontinuitySequence = 0;
  private playlistType: "VOD" | "EVENT" | undefined;
  private endList = false;
  private iFramesOnly = false;
  private firstDecimalDurationLine: number | undefined;
  private readonly segments: SegmentDraft[] = [];
  private readonly keys: Key[] = [];
  private readonly dateRanges: DateRange[] = [];
  private serverControl: ServerControl | undefined;
  private partInfo: PartInfo | undefined;
  private readonly parts: (Omit<Part, "mediaSequence"> & { segmentIndex: number })[] = [];
  private readonly preloadHints: PreloadHint[] = [];
  private readonly renditionReports: RenditionReport[] = [];
  private skip: Skip | undefined;

  /** Keys in force, by KEYFORMAT: one EXT-X-KEY replaces only the key of its own format. */
  private readonly activeKeys = new Map<string, Key>();
  private map: MediaInitialization | undefined;
  private bitrate: number | undefined;
  private pending: Pending = {};
  /** End offset of the last byte range of each resource, for ranges without an offset. */
  private readonly rangeEnds = new Map<string, number>();

  constructor(private readonly context: ParseContext) {}

  uri(line: UriLine): void {
    const pending = this.pending;
    this.pending = {};
    if (pending.info === undefined) {
      this.context.report(line.line, `"${line.uri}" has no EXTINF before it; it's skipped.`);
      return;
    }

    const uri = this.context.substitute(line.uri, line.line);
    const byteRange =
      pending.byteRange === undefined ? undefined : this.byteRange(uri, pending.byteRange);
    this.segments.push({
      line: pending.info.line,
      uri,
      resolvedUri: this.context.resolve(uri, line.line),
      duration: pending.info.duration,
      title: pending.info.title,
      byteRange,
      discontinuity: pending.discontinuity !== undefined,
      key: this.activeKeys.values().next().value,
      map: this.map,
      programDateTime: pending.programDateTime?.value,
      gap: pending.gap !== undefined,
      // EXT-X-BITRATE doesn't apply to byte-range segments (rfc8216bis §4.4.4.8).
      bitrate: byteRange === undefined ? this.bitrate : undefined,
    });
  }

  tag(tag: TagLine): void {
    const { context } = this;
    context.noteTag(tag);
    if (readCommonTag(tag, context, this.common, "media")) return;

    switch (tag.name) {
      case "EXTINF":
        this.extinf(tag);
        break;
      case "EXT-X-TARGETDURATION":
        if (context.once(tag)) this.targetDuration = context.numberValue(tag);
        break;
      case "EXT-X-MEDIA-SEQUENCE":
        if (context.once(tag)) this.mediaSequence = context.integerValue(tag) ?? 0;
        break;
      case "EXT-X-DISCONTINUITY-SEQUENCE":
        if (context.once(tag)) this.discontinuitySequence = context.integerValue(tag) ?? 0;
        break;
      case "EXT-X-PLAYLIST-TYPE":
        if (context.once(tag)) this.readPlaylistType(tag);
        break;
      case "EXT-X-ENDLIST":
        this.endList = true;
        break;
      case "EXT-X-I-FRAMES-ONLY":
        this.iFramesOnly = true;
        break;
      case "EXT-X-BYTERANGE":
        this.readByteRangeTag(tag);
        break;
      case "EXT-X-DISCONTINUITY":
        this.pending.discontinuity = tag.line;
        break;
      case "EXT-X-GAP":
        this.pending.gap = tag.line;
        break;
      case "EXT-X-PROGRAM-DATE-TIME":
        this.readProgramDateTime(tag);
        break;
      case "EXT-X-KEY":
        this.readKeyTag(tag);
        break;
      case "EXT-X-MAP":
        this.readMap(tag);
        break;
      case "EXT-X-BITRATE":
        this.bitrate = context.integerValue(tag);
        break;
      case "EXT-X-DATERANGE":
        this.dateRanges.push(readDateRange(tag, context));
        break;
      case "EXT-X-SERVER-CONTROL":
        if (context.once(tag)) this.serverControl = readServerControl(tag, context);
        break;
      case "EXT-X-PART-INF":
        if (context.once(tag)) this.partInfo = readPartInfo(tag, context);
        break;
      case "EXT-X-PART": {
        const part = readPart(tag, context);
        if (part !== undefined) this.parts.push({ ...part, segmentIndex: this.segments.length });
        break;
      }
      case "EXT-X-PRELOAD-HINT": {
        const hint = readPreloadHint(tag, context);
        if (hint !== undefined) this.preloadHints.push(hint);
        break;
      }
      case "EXT-X-RENDITION-REPORT":
        this.renditionReports.push(readRenditionReport(tag, context));
        break;
      case "EXT-X-SKIP":
        if (context.once(tag)) this.skip = readSkip(tag, context);
        break;
      default:
        if (MULTIVARIANT_TAGS.has(tag.name)) {
          context.reportOncePerTag(
            tag,
            `${tag.name} belongs in multivariant playlists; it's ignored in this media playlist.`,
          );
        } else {
          context.unknown(tag);
        }
    }
  }

  finish(): MediaPlaylist {
    this.reportOrphans();

    const firstSequence = this.mediaSequence + (this.skip?.skippedSegments ?? 0);
    let elapsed = 0;
    let discontinuitySequence = this.discontinuitySequence;
    const segments = this.segments.map((draft, index): Segment => {
      // The first segment's number is EXT-X-DISCONTINUITY-SEQUENCE itself (RFC 8216 §4.3.3.3).
      if (draft.discontinuity && index > 0) discontinuitySequence += 1;
      const segment = {
        ...draft,
        mediaSequence: firstSequence + index,
        discontinuitySequence,
        startTime: elapsed,
      };
      elapsed = roundSeconds(elapsed + draft.duration);
      return segment;
    });

    return {
      kind: "media",
      version: this.common.version,
      independentSegments: this.common.independentSegments,
      start: this.common.start,
      defines: this.context.defines,
      targetDuration: this.targetDuration,
      mediaSequence: this.mediaSequence,
      discontinuitySequence: this.discontinuitySequence,
      playlistType: this.playlistType,
      endList: this.endList,
      iFramesOnly: this.iFramesOnly,
      segments,
      keys: this.keys,
      dateRanges: this.dateRanges,
      serverControl: this.serverControl,
      partInfo: this.partInfo,
      parts: this.parts.map(({ segmentIndex, ...part }) => ({
        ...part,
        mediaSequence: firstSequence + segmentIndex,
      })),
      preloadHints: this.preloadHints,
      renditionReports: this.renditionReports,
      skip: this.skip,
      totalDuration: elapsed,
      container: playlistContainer(segments),
      firstDecimalDurationLine: this.firstDecimalDurationLine,
      unknownTags: this.context.unknownTags,
      tagLines: this.context.tagLines,
      issues: this.context.sortedIssues(),
    };
  }

  private extinf(tag: TagLine): void {
    if (this.pending.info !== undefined) {
      this.context.report(this.pending.info.line, "EXTINF has no URI line after it.");
    }
    const value = tag.value ?? "";
    const comma = value.indexOf(",");
    if (comma === -1) this.context.report(tag.line, "EXTINF: a comma should follow the duration.");
    const durationText = (comma === -1 ? value : value.slice(0, comma)).trim();
    const title = comma === -1 ? "" : value.slice(comma + 1).trim();

    const match = /^(\d+(?:\.\d*)?|\.\d+)(.*)$/.exec(durationText);
    const number = match?.[1];
    const rest = match?.[2]?.trim() ?? "";
    if (number === undefined) {
      this.context.report(
        tag.line,
        `EXTINF: the duration should be a number of seconds; found "${durationText}".`,
      );
    } else if (rest !== "") {
      this.context.report(tag.line, `EXTINF: unexpected text after the duration: ${rest}`);
    }
    if (number?.includes(".")) this.firstDecimalDurationLine ??= tag.line;

    this.pending.info = { line: tag.line, duration: Number(number ?? 0), title };
  }

  private readPlaylistType(tag: TagLine): void {
    const value = tag.value?.trim();
    if (value === "VOD" || value === "EVENT") this.playlistType = value;
    else {
      this.context.report(
        tag.line,
        `EXT-X-PLAYLIST-TYPE should be VOD or EVENT; found "${value ?? ""}".`,
      );
    }
  }

  private readByteRangeTag(tag: TagLine): void {
    const range = parseByteRange(tag.value ?? "");
    if (range === undefined) {
      this.context.report(
        tag.line,
        `EXT-X-BYTERANGE should look like 1000@0 (length@offset); found "${tag.value ?? ""}".`,
      );
      return;
    }
    this.pending.byteRange = { line: tag.line, ...range };
  }

  /** Works out the offset when the tag leaves it out (RFC 8216 §4.3.2.2). */
  private byteRange(uri: string, range: NonNullable<Pending["byteRange"]>): ByteRange {
    let offset = range.offset;
    if (offset === undefined) {
      const previous = this.segments.at(-1);
      if (previous?.byteRange !== undefined && previous.uri === uri) {
        offset = previous.byteRange.offset + previous.byteRange.length;
      } else {
        const end = this.rangeEnds.get(uri);
        offset = end ?? 0;
        this.context.report(
          range.line,
          end === undefined
            ? `EXT-X-BYTERANGE has no offset and there's no earlier range of "${uri}" to continue; offset 0 is assumed.`
            : `EXT-X-BYTERANGE has no offset, but the previous segment isn't a range of "${uri}"; it continues from byte ${end}.`,
        );
      }
    }
    this.rangeEnds.set(uri, offset + range.length);
    return { length: range.length, offset };
  }

  private readProgramDateTime(tag: TagLine): void {
    const value = tag.value?.trim() ?? "";
    if (Number.isNaN(Date.parse(value))) {
      this.context.report(
        tag.line,
        `EXT-X-PROGRAM-DATE-TIME should be an ISO 8601 date and time; found "${value}".`,
      );
    }
    this.pending.programDateTime = { line: tag.line, value };
  }

  private readKeyTag(tag: TagLine): void {
    const key = readKey(tag, this.context);
    if (key === undefined) return;
    this.keys.push(key);
    if (key.method === "NONE") this.activeKeys.clear();
    else this.activeKeys.set(key.keyFormat ?? "identity", key);
  }

  private readMap(tag: TagLine): void {
    const attributes = this.context.attributes(tag);
    if (!attributes.require("URI")) return;
    const uri = attributes.quoted("URI") ?? "";
    const rangeText = attributes.quoted("BYTERANGE");
    const range = rangeText === undefined ? undefined : parseByteRange(rangeText);
    if (rangeText !== undefined && range === undefined) {
      this.context.report(
        tag.line,
        `EXT-X-MAP: BYTERANGE should look like 1000@0; found "${rangeText}".`,
      );
    }
    this.map = {
      line: tag.line,
      uri,
      resolvedUri: this.context.resolve(uri, tag.line),
      byteRange:
        range === undefined ? undefined : { length: range.length, offset: range.offset ?? 0 },
      attributes: attributes.record(),
    };
  }

  private reportOrphans(): void {
    const { info, byteRange, discontinuity, programDateTime, gap } = this.pending;
    const orphans: [string, number | undefined][] = [
      ["EXT-X-BYTERANGE", byteRange?.line],
      ["EXT-X-DISCONTINUITY", discontinuity],
      ["EXT-X-PROGRAM-DATE-TIME", programDateTime?.line],
      ["EXT-X-GAP", gap],
    ];
    if (info !== undefined) this.context.report(info.line, "EXTINF has no URI line after it.");
    for (const [name, line] of orphans) {
      if (line !== undefined) this.context.report(line, `${name} isn't followed by a segment.`);
    }
  }
}

function readDateRange(tag: TagLine, context: ParseContext): DateRange {
  const attributes = context.attributes(tag);
  attributes.require("ID");
  return {
    line: tag.line,
    id: attributes.quoted("ID"),
    class: attributes.quoted("CLASS"),
    startDate: attributes.quoted("START-DATE"),
    endDate: attributes.quoted("END-DATE"),
    duration: attributes.float("DURATION"),
    plannedDuration: attributes.float("PLANNED-DURATION"),
    endOnNext: attributes.yesNo("END-ON-NEXT") ?? false,
    attributes: attributes.record(),
  };
}
