import {
  isPlaylist,
  markUsed,
  mayKeep,
  planSaving,
  playlistIsFinal,
  SAVED_CACHE,
  type SavedEntry,
} from "@/core/netsim/saved";

/** The copy of downloaded media, from the Service Worker's side (src/core/netsim/saved.ts explains it). */
export interface SavedCopy {
  /** The saved response for `url`, if there is one. */
  find(url: string): Promise<Response | undefined>;
  /**
   * Saves `response` for `url` once its body has fully arrived, if it may be kept. Call it before reading the body:
   * it takes its own copy. A download that's aborted or fails is never saved.
   */
  keep(url: string, response: Response): void;
}

/** The index lives in the cache too, under a URL of our own that no page ever fetches. */
const indexKey = () => new URL("/saved-copy-index.json", self.location.origin).href;

export function openSavedCopy(): SavedCopy {
  // Index updates run one at a time, so two downloads finishing together can't lose each other's entry.
  let queue: Promise<void> = Promise.resolve();
  const later = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => undefined);
  };

  async function readIndex(cache: Cache): Promise<SavedEntry[]> {
    const stored = await cache.match(indexKey());
    return stored ? ((await stored.json()) as SavedEntry[]) : [];
  }

  async function writeIndex(cache: Cache, index: SavedEntry[]): Promise<void> {
    await cache.put(
      indexKey(),
      new Response(JSON.stringify(index), { headers: { "content-type": "application/json" } }),
    );
  }

  // Downloads answered from the copy since the index was last written; one write moves them all to its end.
  let used: string[] = [];
  async function markAllUsed(): Promise<void> {
    const urls = used;
    used = [];
    if (urls.length === 0 || !(await caches.has(SAVED_CACHE))) return;
    const cache = await caches.open(SAVED_CACHE);
    await writeIndex(cache, markUsed(await readIndex(cache), urls));
  }

  async function store(url: string, body: Blob | string, original: Response): Promise<void> {
    const cache = await caches.open(SAVED_CACHE);
    const bytes = typeof body === "string" ? new Blob([body]).size : body.size;
    await cache.put(
      url,
      new Response(body, {
        status: original.status,
        statusText: original.statusText,
        headers: original.headers,
      }),
    );
    const plan = planSaving(await readIndex(cache), { url, bytes });
    await Promise.all(plan.drop.map((dropped) => cache.delete(dropped, { ignoreVary: true })));
    await writeIndex(cache, plan.index);
  }

  return {
    async find(url) {
      try {
        if (!(await caches.has(SAVED_CACHE))) return undefined;
        const cache = await caches.open(SAVED_CACHE);
        const saved = await cache.match(url, { ignoreVary: true });
        if (saved) {
          // What repeat runs read stays longest. Uses that come together share one index write.
          if (used.length === 0) later(markAllUsed);
          used.push(url);
        }
        return saved;
      } catch {
        return undefined;
      }
    },
    keep(url, response) {
      if (!mayKeep(response)) return;
      const copy = response.clone();
      const playlist = isPlaylist(url, response.headers.get("content-type"));
      // Read the copy straight away, so it doesn't pile up behind the original.
      const body: Promise<Blob | string> = playlist ? copy.text() : copy.blob();
      body
        .then((content) => {
          if (typeof content === "string" && !playlistIsFinal(content)) return;
          later(() => store(url, content, copy));
        })
        .catch(() => undefined);
    },
  };
}
