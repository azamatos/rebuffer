// Helpers for the unit tests in this folder.
import { parsePlaylist } from "./parse";
import type { MediaPlaylist, MultivariantPlaylist, ParseOptions } from "./types";

/** Joins playlist lines with "\n", so argument N is line N. */
export function m3u8(...lines: string[]): string {
  return lines.join("\n");
}

export function mediaOf(text: string, options?: ParseOptions): MediaPlaylist {
  const result = parsePlaylist(text, options);
  if (result.kind !== "media") throw new Error(`Expected a media playlist, got ${result.kind}.`);
  return result;
}

export function multivariantOf(text: string, options?: ParseOptions): MultivariantPlaylist {
  const result = parsePlaylist(text, options);
  if (result.kind !== "multivariant") {
    throw new Error(`Expected a multivariant playlist, got ${result.kind}.`);
  }
  return result;
}

/** The 1-based number of the first line that contains `needle`. */
export function lineOf(text: string, needle: string): number {
  const index = text.split(/\r\n|\r|\n/).findIndex((line) => line.includes(needle));
  if (index === -1) throw new Error(`"${needle}" isn't in the text.`);
  return index + 1;
}

/** Issue messages only, for compact assertions. */
export function messages(playlist: { issues: { message: string }[] }): string[] {
  return playlist.issues.map((issue) => issue.message);
}
