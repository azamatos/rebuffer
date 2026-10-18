export interface TagLine {
  type: "tag";
  line: number;
  /** Tag name without "#", e.g. "EXT-X-STREAM-INF". */
  name: string;
  /** Text after the first colon; undefined for tags without one, like EXT-X-ENDLIST. */
  value: string | undefined;
}

export interface UriLine {
  type: "uri";
  line: number;
  uri: string;
}

export type PlaylistLine = TagLine | UriLine;

/**
 * Splits playlist text into tag and URI lines with 1-based line numbers. Drops a UTF-8 byte order
 * mark, blank lines and comments, accepts LF, CRLF and CR, and trims surrounding whitespace.
 * Tags are case-sensitive (RFC 8216 §4.1): "#ext-x-version" is a comment.
 */
export function readLines(text: string): PlaylistLine[] {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const result: PlaylistLine[] = [];

  source.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const content = raw.trim();
    const line = index + 1;
    if (content === "") return;

    if (content.startsWith("#EXT")) {
      const colon = content.indexOf(":");
      result.push(
        colon === -1
          ? { type: "tag", line, name: content.slice(1), value: undefined }
          : { type: "tag", line, name: content.slice(1, colon), value: content.slice(colon + 1) },
      );
    } else if (!content.startsWith("#")) {
      result.push({ type: "uri", line, uri: content });
    }
  });

  return result;
}
