/** Tags that only make sense in a multivariant playlist (RFC 8216 §4.3.4, rfc8216bis). */
export const MULTIVARIANT_TAGS: ReadonlySet<string> = new Set([
  "EXT-X-STREAM-INF",
  "EXT-X-I-FRAME-STREAM-INF",
  "EXT-X-MEDIA",
  "EXT-X-SESSION-DATA",
  "EXT-X-SESSION-KEY",
  "EXT-X-CONTENT-STEERING",
]);

/** Tags that only make sense in a media playlist (RFC 8216 §4.3.2, §4.3.3, rfc8216bis). */
export const MEDIA_TAGS: ReadonlySet<string> = new Set([
  "EXTINF",
  "EXT-X-TARGETDURATION",
  "EXT-X-MEDIA-SEQUENCE",
  "EXT-X-DISCONTINUITY-SEQUENCE",
  "EXT-X-PLAYLIST-TYPE",
  "EXT-X-ENDLIST",
  "EXT-X-I-FRAMES-ONLY",
  "EXT-X-BYTERANGE",
  "EXT-X-DISCONTINUITY",
  "EXT-X-KEY",
  "EXT-X-MAP",
  "EXT-X-PROGRAM-DATE-TIME",
  "EXT-X-GAP",
  "EXT-X-BITRATE",
  "EXT-X-DATERANGE",
  "EXT-X-SERVER-CONTROL",
  "EXT-X-PART-INF",
  "EXT-X-PART",
  "EXT-X-PRELOAD-HINT",
  "EXT-X-RENDITION-REPORT",
  "EXT-X-SKIP",
]);
