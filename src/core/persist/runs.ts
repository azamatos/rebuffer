import { createStore, del, get, getMany, keys, set } from "idb-keyval";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import type { PlayerSettings } from "@/core/player/settings";
import type { RunEvent } from "@/core/run/events";

/**
 * Finished runs, saved in this browser (IndexedDB) and exported as JSON. A run keeps its whole event log, so its
 * report is always computed afresh from what happened; a small summary next to it feeds the lists. This module
 * stays light (no metrics), because Home lists runs.
 */

export const RUN_FORMAT = "rebuffer-run";
export const RUN_VERSION = 1;
/** Older runs go once there are more than this many. */
export const MAX_SAVED_RUNS = 50;

export interface SavedRun {
  format: typeof RUN_FORMAT;
  version: typeof RUN_VERSION;
  id: string;
  /** Epoch milliseconds when the run started (run time 0) and when it was saved. */
  startedAt: number;
  savedAt: number;
  setup: {
    streamUrl: string;
    streamName: string;
    network: { id: string | undefined; name: string; curve: NetworkCurve };
    player: { presetId: string; name: string; settings: PlayerSettings };
  };
  player: { name: string; version: string };
  environment: {
    /** "Chrome on macOS" */
    browser: string;
    /** The video element's size on screen at the end, CSS pixels. */
    playerSize: { width: number; height: number } | undefined;
  };
  reason: "complete" | "stopped" | "error";
  events: RunEvent[];
}

/**
 * How summaries are made: 2 since the score is measured against what the run's network could carry (2026-10-21). A
 * summary made otherwise is made again from its run when the list is read.
 */
export const SUMMARY_VERSION = 2;

/** What the lists show about a run, without loading its log. */
export interface RunSummary {
  /** `SUMMARY_VERSION` when it was made; older summaries have none. */
  version?: number;
  id: string;
  savedAt: number;
  streamName: string;
  networkName: string;
  playerName: string;
  /** "defaults · abrEwmaFastVoD 1.5"; older summaries only have `playerName`. */
  playerTitle?: string;
  score: number;
  stalls: { count: number; totalS: number };
  averageBitrate: number | undefined;
  firstFrameS: number | undefined;
  lengthS: number;
}

/** The few key-value calls the run store needs; IndexedDB in the browser, a Map in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  getMany(keys: string[]): Promise<unknown[]>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * An IndexedDB store. Each kind of record gets a database of its own: idb-keyval creates a store only along with its
 * database, so a second store in an existing database would never be created.
 */
export function indexedDbStore(database = "rebuffer", name = "runs"): KeyValueStore {
  const store = createStore(database, name);
  return {
    get: (key) => get(key, store),
    getMany: (list) => getMany(list, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
    keys: async () => (await keys(store)).map(String),
  };
}

const runKey = (id: string) => `run/${id}`;
const summaryKey = (id: string) => `summary/${id}`;

export interface RunStore {
  /** Saves a run with its summary (src/core/persist/summary.ts makes one). */
  save(run: SavedRun, summary: RunSummary): Promise<void>;
  get(id: string): Promise<SavedRun | undefined>;
  /** Summaries, newest first. */
  list(): Promise<RunSummary[]>;
  remove(id: string): Promise<void>;
}

/** `remake` makes a summary afresh from its run (src/core/persist/summary.ts): old summaries are replaced. */
export function createRunStore(
  store: KeyValueStore = indexedDbStore(),
  remake?: (run: SavedRun) => RunSummary | Promise<RunSummary>,
): RunStore {
  async function list(): Promise<RunSummary[]> {
    const ids = (await store.keys()).filter((key) => key.startsWith("summary/"));
    const summaries = (await store.getMany(ids)).filter(
      (value): value is RunSummary => typeof value === "object" && value !== null,
    );
    const current = await Promise.all(
      summaries.map(async (summary) => {
        if (!remake || summary.version === SUMMARY_VERSION) return summary;
        const run = await store.get(runKey(summary.id));
        if (!isSavedRun(run)) return summary;
        const fresh = await remake(run);
        await store.set(summaryKey(run.id), fresh);
        return fresh;
      }),
    );
    return current.sort((a, b) => b.savedAt - a.savedAt);
  }

  async function remove(id: string): Promise<void> {
    await store.del(summaryKey(id));
    await store.del(runKey(id));
  }

  return {
    async save(run, summary) {
      await store.set(runKey(run.id), run);
      await store.set(summaryKey(run.id), summary);
      const old = (await list()).slice(MAX_SAVED_RUNS);
      for (const summary of old) await remove(summary.id);
    },
    async get(id) {
      const run = await store.get(runKey(id));
      return isSavedRun(run) ? run : undefined;
    },
    list,
    remove,
  };
}

function isSavedRun(value: unknown): value is SavedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === RUN_FORMAT &&
    "events" in value &&
    Array.isArray(value.events)
  );
}

let shared: RunStore | undefined;

/** This browser's runs. The database opens on first use, so pages that don't need it never touch it. */
export function savedRuns(): RunStore {
  // The metrics code loads only for summaries made before SUMMARY_VERSION, so Home's lists don't carry it.
  shared ??= createRunStore(indexedDbStore(), async (run) =>
    (await import("./summary")).summarize(run),
  );
  return shared;
}

/** A short random id for a run's address. */
export function newRunId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** The browser and system, briefly: "Chrome on macOS". From the user agent, so best effort. */
export function describeBrowser(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "a browser";
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : undefined;
  return system ? `${browser} on ${system}` : browser;
}
