import { ParseContext } from "./context";
import { type PlaylistLine, readLines } from "./lines";
import { parseMedia } from "./media";
import { parseMultivariant } from "./multivariant";
import { MEDIA_TAGS, MULTIVARIANT_TAGS } from "./tags";
import type { ParseOptions, ParseResult } from "./types";

/**
 * Parses an HLS playlist (RFC 8216, plus the common parts of rfc8216bis). Never throws: input that
 * doesn't start with #EXTM3U gives `{ kind: "invalid" }`, and every other problem becomes an issue
 * with its line number while parsing goes on.
 */
export function parsePlaylist(text: string, options: ParseOptions = {}): ParseResult {
  const lines = readLines(text);
  const [first] = lines;

  if (first === undefined) {
    return { kind: "invalid", issues: [{ line: 1, message: "The playlist is empty." }] };
  }
  if (first.type !== "tag" || first.name !== "EXTM3U") {
    return {
      kind: "invalid",
      issues: [
        {
          line: first.line,
          message: "The text doesn't start with #EXTM3U, so it isn't an HLS playlist.",
        },
      ],
    };
  }

  const context = new ParseContext(options);
  if (first.line > 1) {
    context.report(first.line, `#EXTM3U should be on line 1; here it's on line ${first.line}.`);
  }
  if (first.value !== undefined) {
    context.report(first.line, "#EXTM3U should be alone on its line.");
  }

  const body = lines.slice(1);
  return detectKind(body, context) === "multivariant"
    ? parseMultivariant(body, context)
    : parseMedia(body, context);
}

/**
 * Like hls.js, a playlist with EXTINF or EXT-X-TARGETDURATION is a media playlist; otherwise one
 * with multivariant tags is a multivariant playlist. Mixing both kinds is reported.
 */
function detectKind(lines: PlaylistLine[], context: ParseContext): "multivariant" | "media" {
  let media = false;
  let multivariant = false;
  for (const line of lines) {
    if (line.type !== "tag") continue;
    if (MEDIA_TAGS.has(line.name)) media = true;
    if (MULTIVARIANT_TAGS.has(line.name)) multivariant = true;
  }
  const isMedia = lines.some(
    (line) =>
      line.type === "tag" && (line.name === "EXTINF" || line.name === "EXT-X-TARGETDURATION"),
  );
  const kind = isMedia || !multivariant ? "media" : "multivariant";
  if (media && multivariant) {
    context.report(
      0,
      `The playlist mixes multivariant and media tags; it's read as a ${kind} playlist.`,
    );
  }
  return kind;
}
