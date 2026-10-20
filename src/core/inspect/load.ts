import {
  parsePlaylist,
  variantName,
  type MediaPlaylist,
  type ParseIssue,
  type Playlist,
} from "@/core/hls";
import { describeReadError, type Reader } from "./read";

/** A media playlist the top playlist points to, read and parsed, or why it couldn't be. */
export interface MediaLoad {
  /** Its absolute address; undefined when a pasted playlist's link can't be resolved. */
  url: string | undefined;
  /** What it's for: "720p", "audio “English”", "subtitles “English”". */
  label: string;
  kind: "variant" | "audio" | "subtitles" | "video";
  playlist?: MediaPlaylist;
  problem?: string;
}

/** What the inspector read: the playlist it was given and every media playlist that one names. */
export interface Inspection {
  /** Where the playlist came from; undefined for pasted text or a file. */
  url: string | undefined;
  /** Its name in findings: "master.m3u8", or "the pasted playlist". */
  file: string;
  top: Playlist;
  media: MediaLoad[];
}

export type LoadResult = { ok: true; inspection: Inspection } | { ok: false; issues: ParseIssue[] };

/** A link made absolute, if it can be: relative links need the playlist's own address. */
function absolute(uri: string, base: string | undefined): string | undefined {
  try {
    return new URL(uri, base).href;
  } catch {
    return undefined;
  }
}

/** The last part of a link's path: "master.m3u8". */
export function fileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "") || url;
  } catch {
    return url;
  }
}

/**
 * Parses the playlist and, for a multivariant one, reads every media playlist it names (variants, then audio, video
 * and subtitle renditions; I-frame playlists aren't read). Media playlists that can't be read carry the reason.
 */
export async function loadInspection(
  source: { url?: string | undefined; text: string; name?: string | undefined },
  reader: Reader,
): Promise<LoadResult> {
  const top = parsePlaylist(source.text, source.url ? { baseUrl: source.url } : {});
  if (top.kind === "invalid") return { ok: false, issues: top.issues };
  const file = source.url ? fileName(source.url) : (source.name ?? "the pasted playlist");
  if (top.kind === "media")
    return { ok: true, inspection: { url: source.url, file, top, media: [] } };

  const wanted: Omit<MediaLoad, "playlist" | "problem">[] = [];
  const seen = new Set<string>();
  const want = (uri: string, label: string, kind: MediaLoad["kind"]) => {
    const url = absolute(uri, source.url);
    if (url !== undefined && seen.has(url)) return;
    if (url !== undefined) seen.add(url);
    wanted.push({ url, label, kind });
  };
  for (const variant of top.variants) want(variant.uri, variantName(variant), "variant");
  for (const rendition of top.renditions) {
    if (rendition.uri === undefined || rendition.type === "CLOSED-CAPTIONS") continue;
    const kind =
      rendition.type === "AUDIO" ? "audio" : rendition.type === "VIDEO" ? "video" : "subtitles";
    want(rendition.uri, `${kind} “${rendition.name}”`, kind);
  }

  const media = await Promise.all(
    wanted.map(async (entry): Promise<MediaLoad> => {
      if (entry.url === undefined) {
        return {
          ...entry,
          problem: "Not read: a pasted playlist has no address to resolve its links against.",
        };
      }
      try {
        const parsed = parsePlaylist(await reader.text(entry.url), { baseUrl: entry.url });
        if (parsed.kind === "media") return { ...entry, playlist: parsed };
        return {
          ...entry,
          problem:
            parsed.kind === "invalid"
              ? `Not a playlist: ${parsed.issues[0]?.message ?? "it couldn't be parsed"}.`
              : "It's a multivariant playlist, where a media playlist was expected.",
        };
      } catch (error) {
        return { ...entry, problem: describeReadError(error) };
      }
    }),
  );
  return { ok: true, inspection: { url: source.url, file, top, media } };
}

/** A media playlist's measured peak: the highest bit rate of its first few segments. */
export interface Measured {
  /** Bits per second; undefined when no segment's size could be read. */
  peakBps: number | undefined;
  /** Segments whose size was read. */
  count: number;
}

/** Segments measured per media playlist. */
export const MEASURED_SEGMENTS = 3;

/**
 * Measures the first segments of a media playlist: each one's size (from its byte range, or the server) over its
 * duration. Init segments and gaps don't count.
 */
export async function measureMedia(
  playlist: MediaPlaylist,
  reader: Reader,
  count = MEASURED_SEGMENTS,
): Promise<Measured> {
  const segments = playlist.segments
    .filter((segment) => !segment.gap && segment.duration > 0)
    .slice(0, count);
  const rates = await Promise.all(
    segments.map(async (segment) => {
      const url = segment.resolvedUri ?? absolute(segment.uri, undefined);
      const bytes =
        segment.byteRange?.length ??
        (url === undefined ? undefined : await reader.size(url).catch(() => undefined));
      return bytes === undefined ? undefined : (bytes * 8) / segment.duration;
    }),
  );
  const known = rates.filter((rate): rate is number => rate !== undefined);
  return { peakBps: known.length > 0 ? Math.max(...known) : undefined, count: known.length };
}
