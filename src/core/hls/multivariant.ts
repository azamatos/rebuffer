import type { AttributeReader } from "./attributes";
import { type CommonState, readCommonTag, readKey } from "./common";
import type { ParseContext } from "./context";
import type { PlaylistLine, TagLine } from "./lines";
import { MEDIA_TAGS } from "./tags";
import type {
  ClosedCaptions,
  ContentSteering,
  IFrameVariant,
  Key,
  MultivariantPlaylist,
  Rendition,
  RenditionType,
  SessionData,
  Variant,
  VariantBase,
} from "./types";
import { splitList } from "./values";

const RENDITION_TYPES: readonly RenditionType[] = [
  "AUDIO",
  "VIDEO",
  "SUBTITLES",
  "CLOSED-CAPTIONS",
];

/** Reads the lines after #EXTM3U as a multivariant playlist (RFC 8216 §4.3.4). */
export function parseMultivariant(
  lines: PlaylistLine[],
  context: ParseContext,
): MultivariantPlaylist {
  const common: CommonState = { independentSegments: false };
  const variants: Variant[] = [];
  const iFrameVariants: IFrameVariant[] = [];
  const renditions: Rendition[] = [];
  const sessionData: SessionData[] = [];
  const sessionKeys: Key[] = [];
  let contentSteering: ContentSteering | undefined;
  /** An EXT-X-STREAM-INF waiting for its URI line. */
  let pending: Omit<Variant, "uri" | "resolvedUri"> | undefined;

  for (const line of lines) {
    if (line.type === "uri") {
      if (pending === undefined) {
        context.report(line.line, `"${line.uri}" has no EXT-X-STREAM-INF before it; it's skipped.`);
        continue;
      }
      const uri = context.substitute(line.uri, line.line);
      variants.push({ ...pending, uri, resolvedUri: context.resolve(uri, line.line) });
      pending = undefined;
      continue;
    }

    const tag = line;
    context.noteTag(tag);
    if (readCommonTag(tag, context, common, "multivariant")) continue;

    switch (tag.name) {
      case "EXT-X-STREAM-INF":
        if (pending !== undefined) reportMissingUri(pending.line, context);
        pending = readVariant(tag, context);
        break;
      case "EXT-X-I-FRAME-STREAM-INF": {
        const variant = readIFrameVariant(tag, context);
        if (variant !== undefined) iFrameVariants.push(variant);
        break;
      }
      case "EXT-X-MEDIA": {
        const rendition = readRendition(tag, context);
        if (rendition !== undefined) renditions.push(rendition);
        break;
      }
      case "EXT-X-SESSION-DATA": {
        const data = readSessionData(tag, context);
        if (data !== undefined) sessionData.push(data);
        break;
      }
      case "EXT-X-SESSION-KEY": {
        const key = readKey(tag, context);
        if (key?.method === "NONE") {
          context.report(tag.line, "EXT-X-SESSION-KEY: METHOD must not be NONE.");
        } else if (key !== undefined) {
          sessionKeys.push(key);
        }
        break;
      }
      case "EXT-X-CONTENT-STEERING":
        if (context.once(tag)) contentSteering = readContentSteering(tag, context);
        break;
      default:
        if (MEDIA_TAGS.has(tag.name)) {
          context.reportOncePerTag(
            tag,
            `${tag.name} belongs in media playlists; it's ignored in this multivariant playlist.`,
          );
        } else {
          context.unknown(tag);
        }
    }
  }

  if (pending !== undefined) reportMissingUri(pending.line, context);

  return {
    kind: "multivariant",
    version: common.version,
    independentSegments: common.independentSegments,
    start: common.start,
    defines: context.defines,
    variants,
    iFrameVariants,
    renditions,
    sessionData,
    sessionKeys,
    contentSteering,
    unknownTags: context.unknownTags,
    tagLines: context.tagLines,
    issues: context.sortedIssues(),
  };
}

function reportMissingUri(line: number, context: ParseContext): void {
  context.report(line, "EXT-X-STREAM-INF has no URI line after it; the variant is skipped.");
}

/** Attributes common to EXT-X-STREAM-INF and EXT-X-I-FRAME-STREAM-INF (RFC 8216 §4.3.4.2). */
function readVariantBase(
  tag: TagLine,
  attributes: AttributeReader,
): Omit<VariantBase, "uri" | "resolvedUri"> {
  attributes.require("BANDWIDTH");
  const codecs = attributes.quoted("CODECS");
  const supplementalCodecs = attributes.quoted("SUPPLEMENTAL-CODECS");
  return {
    line: tag.line,
    bandwidth: attributes.integer("BANDWIDTH"),
    averageBandwidth: attributes.integer("AVERAGE-BANDWIDTH"),
    codecs: codecs === undefined ? undefined : splitList(codecs),
    supplementalCodecs:
      supplementalCodecs === undefined ? undefined : splitList(supplementalCodecs),
    resolution: attributes.resolution("RESOLUTION"),
    hdcpLevel: attributes.enumerated("HDCP-LEVEL", ["TYPE-0", "TYPE-1", "NONE"]),
    videoRange: attributes.enumerated("VIDEO-RANGE", ["SDR", "HLG", "PQ"]),
    video: attributes.quoted("VIDEO"),
    score: attributes.float("SCORE"),
    stableVariantId: attributes.quoted("STABLE-VARIANT-ID"),
    pathwayId: attributes.quoted("PATHWAY-ID"),
    attributes: attributes.record(),
  };
}

function readVariant(tag: TagLine, context: ParseContext): Omit<Variant, "uri" | "resolvedUri"> {
  const attributes = context.attributes(tag);
  return {
    ...readVariantBase(tag, attributes),
    frameRate: attributes.float("FRAME-RATE"),
    audio: attributes.quoted("AUDIO"),
    subtitles: attributes.quoted("SUBTITLES"),
    closedCaptions: readClosedCaptions(attributes, tag, context),
  };
}

/** CLOSED-CAPTIONS is a quoted group id or the enumerated string NONE. */
function readClosedCaptions(
  attributes: AttributeReader,
  tag: TagLine,
  context: ParseContext,
): ClosedCaptions | undefined {
  const value = attributes.raw("CLOSED-CAPTIONS");
  if (value === undefined) return undefined;
  if (value.type === "quoted-string") return { type: "group", groupId: value.text };
  if (value.text === "NONE") return { type: "none" };
  context.report(tag.line, `${tag.name}: CLOSED-CAPTIONS should be a quoted group id or NONE.`);
  return { type: "group", groupId: value.text };
}

function readIFrameVariant(tag: TagLine, context: ParseContext): IFrameVariant | undefined {
  const attributes = context.attributes(tag);
  const base = readVariantBase(tag, attributes);
  if (!attributes.require("URI")) return undefined;
  const uri = attributes.quoted("URI") ?? "";
  return { ...base, uri, resolvedUri: context.resolve(uri, tag.line) };
}

/** EXT-X-MEDIA (RFC 8216 §4.3.4.1). Skipped when TYPE or GROUP-ID is missing or invalid. */
function readRendition(tag: TagLine, context: ParseContext): Rendition | undefined {
  const attributes = context.attributes(tag);
  const hasType = attributes.require("TYPE");
  const hasGroup = attributes.require("GROUP-ID");
  attributes.require("NAME");
  const type = attributes.enumerated("TYPE", RENDITION_TYPES);
  const groupId = attributes.quoted("GROUP-ID");
  if (!hasType || !hasGroup || type === undefined || groupId === undefined) return undefined;

  const uri = attributes.quoted("URI");
  const instreamId = attributes.quoted("INSTREAM-ID");
  if (type === "CLOSED-CAPTIONS") {
    if (instreamId === undefined) {
      context.report(tag.line, "EXT-X-MEDIA: INSTREAM-ID is required for CLOSED-CAPTIONS.");
    }
    if (uri !== undefined) {
      context.report(tag.line, "EXT-X-MEDIA: CLOSED-CAPTIONS renditions must not have a URI.");
    }
  }
  const characteristics = attributes.quoted("CHARACTERISTICS");

  return {
    line: tag.line,
    type,
    groupId,
    name: attributes.quoted("NAME") ?? "",
    language: attributes.quoted("LANGUAGE"),
    assocLanguage: attributes.quoted("ASSOC-LANGUAGE"),
    default: attributes.yesNo("DEFAULT") ?? false,
    autoselect: attributes.yesNo("AUTOSELECT") ?? false,
    forced: attributes.yesNo("FORCED") ?? false,
    instreamId,
    channels: attributes.quoted("CHANNELS"),
    characteristics: characteristics === undefined ? undefined : splitList(characteristics),
    uri,
    resolvedUri: uri === undefined ? undefined : context.resolve(uri, tag.line),
    stableRenditionId: attributes.quoted("STABLE-RENDITION-ID"),
    attributes: attributes.record(),
  };
}

function readSessionData(tag: TagLine, context: ParseContext): SessionData | undefined {
  const attributes = context.attributes(tag);
  if (!attributes.require("DATA-ID")) return undefined;
  const value = attributes.quoted("VALUE");
  const uri = attributes.quoted("URI");
  if ((value === undefined) === (uri === undefined)) {
    context.report(tag.line, "EXT-X-SESSION-DATA: use either VALUE or URI, not both or neither.");
  }
  return {
    line: tag.line,
    dataId: attributes.quoted("DATA-ID") ?? "",
    value,
    uri,
    resolvedUri: uri === undefined ? undefined : context.resolve(uri, tag.line),
    format: attributes.enumerated("FORMAT", ["JSON", "RAW"]),
    language: attributes.quoted("LANGUAGE"),
    attributes: attributes.record(),
  };
}

function readContentSteering(tag: TagLine, context: ParseContext): ContentSteering | undefined {
  const attributes = context.attributes(tag);
  if (!attributes.require("SERVER-URI")) return undefined;
  const serverUri = attributes.quoted("SERVER-URI") ?? "";
  return {
    line: tag.line,
    serverUri,
    resolvedUri: context.resolve(serverUri, tag.line),
    pathwayId: attributes.quoted("PATHWAY-ID"),
    attributes: attributes.record(),
  };
}
