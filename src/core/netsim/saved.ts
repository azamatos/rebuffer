/**
 * The copy of downloaded media this browser keeps, so a repeat run of a setup gives the same result: its downloads
 * come from here instead of the real network, still at the pace the simulated network allows. It lives in Cache
 * Storage. The Service Worker saves to it and reads from it (src/sw/saved.ts); the page checks it and forgets it.
 */

export const SAVED_CACHE = "rebuffer-saved-v1";
/** The most the copy keeps; the oldest downloads go first. */
export const MAX_SAVED_BYTES = 300 * 1024 * 1024;

/** One saved download, as the copy's index lists it (oldest first). */
export interface SavedEntry {
  url: string;
  bytes: number;
}

/**
 * Adds `added` to the index and drops the oldest entries until the total fits in `maxBytes`. A download saved again
 * moves to the end. Returns the new index and the URLs to delete.
 */
export function planSaving(
  index: readonly SavedEntry[],
  added: SavedEntry,
  maxBytes = MAX_SAVED_BYTES,
): { index: SavedEntry[]; drop: string[] } {
  const next = [...index.filter((entry) => entry.url !== added.url), added];
  let total = next.reduce((sum, entry) => sum + entry.bytes, 0);
  const drop: string[] = [];
  while (total > maxBytes) {
    const oldest = next.shift();
    if (!oldest) break;
    total -= oldest.bytes;
    drop.push(oldest.url);
  }
  return { index: next, drop };
}

/** Whether a request can be answered from the copy, or saved to it: a plain GET of a whole file. */
export function isPlainGet(request: Pick<Request, "method" | "headers">): boolean {
  return request.method === "GET" && !request.headers.has("range");
}

/** Whether the server lets the copy keep this response: a complete 200 it didn't mark `no-store`. */
export function mayKeep(response: Pick<Response, "status" | "headers" | "redirected">): boolean {
  if (response.status !== 200 || response.redirected) return false;
  return !/(^|,)\s*no-store\s*(,|$)/i.test(response.headers.get("cache-control") ?? "");
}

export function isPlaylist(url: string, contentType: string | null): boolean {
  return /mpegurl/i.test(contentType ?? "") || /\.m3u8?$/i.test(new URL(url).pathname);
}

/**
 * Whether a playlist stays the same, so a saved copy is safe to reuse: a multivariant playlist, or a media playlist
 * with its end (video on demand). A live media playlist changes every few seconds, so it's never saved.
 */
export function playlistIsFinal(text: string): boolean {
  return /^#EXT-X-(ENDLIST|STREAM-INF)/m.test(text);
}

/** Whether this browser has `url` saved from an earlier run. */
export async function hasSavedCopy(url: string): Promise<boolean> {
  try {
    if (!(await caches.has(SAVED_CACHE))) return false;
    const cache = await caches.open(SAVED_CACHE);
    return (await cache.match(url, { ignoreVary: true })) !== undefined;
  } catch {
    // No Cache Storage here (some private modes): nothing is saved.
    return false;
  }
}

/** Forgets every saved download. */
export async function forgetSavedCopy(): Promise<void> {
  await caches.delete(SAVED_CACHE);
}
