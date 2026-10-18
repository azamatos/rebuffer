// Types for parsed HLS playlists (RFC 8216 and the common parts of rfc8216bis), decoded codec strings
// and lint findings. Optional fields are typed `?: T | undefined` so the parser can build objects
// directly; read them as "absent when undefined".

/** A problem met while reading a playlist. `line` is 1-based; 0 means the input as a whole. */
export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseOptions {
  /** The playlist's own URL. When given, every URI also gets a `resolvedUri`. */
  baseUrl?: string | undefined;
}

export interface Resolution {
  width: number;
  height: number;
}

/** A byte range with its offset worked out (from the tag, or continuing the previous range). */
export interface ByteRange {
  length: number;
  offset: number;
}

/** A tag the parser doesn't know, kept as written. `tag` has no leading "#". */
export interface UnknownTag {
  line: number;
  tag: string;
  value: string;
}

/** One EXT-X-DEFINE. Imported and query-parameter variables are recorded but not resolved. */
export interface Definition {
  line: number;
  name: string;
  source: "value" | "import" | "queryparam";
  value?: string | undefined;
}

/** EXT-X-START. */
export interface StartOffset {
  line: number;
  timeOffset: number;
  precise: boolean;
}

/** EXT-X-KEY or EXT-X-SESSION-KEY. */
export interface Key {
  line: number;
  /** NONE, AES-128, SAMPLE-AES, SAMPLE-AES-CTR, or whatever the playlist says. */
  method: string;
  uri?: string | undefined;
  resolvedUri?: string | undefined;
  /** As written, e.g. "0x0000…01". */
  iv?: string | undefined;
  keyFormat?: string | undefined;
  keyFormatVersions?: string | undefined;
  /** Every attribute as written (quotes removed, variables substituted). */
  attributes: Record<string, string>;
}

/** EXT-X-MAP: the Media Initialization Section that applies to the segments after it. */
export interface MediaInitialization {
  line: number;
  uri: string;
  resolvedUri?: string | undefined;
  byteRange?: ByteRange | undefined;
  attributes: Record<string, string>;
}

export interface Segment {
  /** Line of the segment's EXTINF. */
  line: number;
  uri: string;
  resolvedUri?: string | undefined;
  /** Seconds, from EXTINF. */
  duration: number;
  title: string;
  byteRange?: ByteRange | undefined;
  /** An EXT-X-DISCONTINUITY comes before this segment. */
  discontinuity: boolean;
  /** The key that applies; with several KEYFORMATs at once, the first one declared. */
  key?: Key | undefined;
  map?: MediaInitialization | undefined;
  /** EXT-X-PROGRAM-DATE-TIME as written, only where the playlist has one. */
  programDateTime?: string | undefined;
  gap: boolean;
  /** EXT-X-BITRATE in kilobits per second, as in the tag. */
  bitrate?: number | undefined;
  mediaSequence: number;
  discontinuitySequence: number;
  /** Seconds from the start of the playlist: the sum of the durations before this segment. */
  startTime: number;
}

export interface DateRange {
  line: number;
  id?: string | undefined;
  class?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  duration?: number | undefined;
  plannedDuration?: number | undefined;
  endOnNext: boolean;
  attributes: Record<string, string>;
}

export interface ServerControl {
  line: number;
  canSkipUntil?: number | undefined;
  canSkipDateRanges: boolean;
  holdBack?: number | undefined;
  partHoldBack?: number | undefined;
  canBlockReload: boolean;
  attributes: Record<string, string>;
}

export interface PartInfo {
  line: number;
  partTarget?: number | undefined;
  attributes: Record<string, string>;
}

/** EXT-X-PART (low-latency HLS). */
export interface Part {
  line: number;
  uri: string;
  resolvedUri?: string | undefined;
  duration?: number | undefined;
  independent: boolean;
  /** The offset is absent when the tag leaves it out. */
  byteRange?: { length: number; offset?: number | undefined } | undefined;
  gap: boolean;
  /** Media sequence number of the segment this part belongs to (the next one in the playlist). */
  mediaSequence: number;
  attributes: Record<string, string>;
}

export interface PreloadHint {
  line: number;
  type?: "PART" | "MAP" | undefined;
  uri: string;
  resolvedUri?: string | undefined;
  byteRangeStart?: number | undefined;
  byteRangeLength?: number | undefined;
  attributes: Record<string, string>;
}

export interface RenditionReport {
  line: number;
  uri?: string | undefined;
  resolvedUri?: string | undefined;
  lastMsn?: number | undefined;
  lastPart?: number | undefined;
  attributes: Record<string, string>;
}

export interface Skip {
  line: number;
  skippedSegments?: number | undefined;
  recentlyRemovedDateRanges: string[];
  attributes: Record<string, string>;
}

/** What the media segments are packaged in. */
export type Container = "fmp4" | "ts" | "mixed" | "unknown";

interface PlaylistBase {
  version?: number | undefined;
  independentSegments: boolean;
  start?: StartOffset | undefined;
  defines: Definition[];
  unknownTags: UnknownTag[];
  /** Line of the first occurrence of each tag, by name without "#" (e.g. "EXT-X-VERSION"). */
  tagLines: Record<string, number>;
  issues: ParseIssue[];
}

/** The attributes EXT-X-STREAM-INF and EXT-X-I-FRAME-STREAM-INF share. */
export interface VariantBase {
  /** Line of the EXT-X-STREAM-INF or EXT-X-I-FRAME-STREAM-INF tag. */
  line: number;
  uri: string;
  resolvedUri?: string | undefined;
  /** Peak segment bit rate, bits per second. Required by the spec, so absent only in broken playlists. */
  bandwidth?: number | undefined;
  averageBandwidth?: number | undefined;
  /** CODECS split into single codec strings; absent when the attribute is missing. */
  codecs?: string[] | undefined;
  supplementalCodecs?: string[] | undefined;
  resolution?: Resolution | undefined;
  hdcpLevel?: "TYPE-0" | "TYPE-1" | "NONE" | undefined;
  videoRange?: "SDR" | "HLG" | "PQ" | undefined;
  video?: string | undefined;
  score?: number | undefined;
  stableVariantId?: string | undefined;
  pathwayId?: string | undefined;
  attributes: Record<string, string>;
}

export type ClosedCaptions = { type: "group"; groupId: string } | { type: "none" };

export interface Variant extends VariantBase {
  frameRate?: number | undefined;
  audio?: string | undefined;
  subtitles?: string | undefined;
  closedCaptions?: ClosedCaptions | undefined;
}

export type IFrameVariant = VariantBase;

export type RenditionType = "AUDIO" | "VIDEO" | "SUBTITLES" | "CLOSED-CAPTIONS";

/** EXT-X-MEDIA. */
export interface Rendition {
  line: number;
  type: RenditionType;
  groupId: string;
  name: string;
  language?: string | undefined;
  assocLanguage?: string | undefined;
  default: boolean;
  autoselect: boolean;
  forced: boolean;
  instreamId?: string | undefined;
  /** As written, e.g. "2", "6" or "16/JOC". */
  channels?: string | undefined;
  characteristics?: string[] | undefined;
  uri?: string | undefined;
  resolvedUri?: string | undefined;
  stableRenditionId?: string | undefined;
  attributes: Record<string, string>;
}

export interface SessionData {
  line: number;
  dataId: string;
  value?: string | undefined;
  uri?: string | undefined;
  resolvedUri?: string | undefined;
  format?: "JSON" | "RAW" | undefined;
  language?: string | undefined;
  attributes: Record<string, string>;
}

export interface ContentSteering {
  line: number;
  serverUri: string;
  resolvedUri?: string | undefined;
  pathwayId?: string | undefined;
  attributes: Record<string, string>;
}

export interface MultivariantPlaylist extends PlaylistBase {
  kind: "multivariant";
  variants: Variant[];
  iFrameVariants: IFrameVariant[];
  renditions: Rendition[];
  sessionData: SessionData[];
  sessionKeys: Key[];
  contentSteering?: ContentSteering | undefined;
}

export interface MediaPlaylist extends PlaylistBase {
  kind: "media";
  targetDuration?: number | undefined;
  /** EXT-X-MEDIA-SEQUENCE, 0 when absent. */
  mediaSequence: number;
  /** EXT-X-DISCONTINUITY-SEQUENCE, 0 when absent. */
  discontinuitySequence: number;
  playlistType?: "VOD" | "EVENT" | undefined;
  endList: boolean;
  iFramesOnly: boolean;
  segments: Segment[];
  /** Every EXT-X-KEY tag, in order. */
  keys: Key[];
  dateRanges: DateRange[];
  serverControl?: ServerControl | undefined;
  partInfo?: PartInfo | undefined;
  parts: Part[];
  preloadHints: PreloadHint[];
  renditionReports: RenditionReport[];
  skip?: Skip | undefined;
  /** Sum of the segment durations, seconds. */
  totalDuration: number;
  container: Container;
  /** Line of the first EXTINF written with a decimal point (RFC 8216 §7: needs version 3). */
  firstDecimalDurationLine?: number | undefined;
}

export interface InvalidPlaylist {
  kind: "invalid";
  issues: ParseIssue[];
}

export type Playlist = MultivariantPlaylist | MediaPlaylist;

export type ParseResult = Playlist | InvalidPlaylist;

export type CodecKind = "video" | "audio" | "text" | "unknown";

/** A codec string decoded for people. `label` is what the UI shows, e.g. "H.264 High 4.0". */
export interface CodecInfo {
  codec: string;
  kind: CodecKind;
  name: string;
  profile?: string | undefined;
  level?: string | undefined;
  label: string;
}

export type Severity = "error" | "warning" | "note";

export interface FindingRef {
  spec: "RFC 8216" | "Apple HLS authoring spec";
  section?: string | undefined;
  url: string;
}

/** A lint result: `message` states the fact with numbers, `detail` says why a player cares. */
export interface Finding {
  id: string;
  severity: Severity;
  message: string;
  detail: string;
  line?: number | undefined;
  ref: FindingRef;
}
