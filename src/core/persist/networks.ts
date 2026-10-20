import type { NetworkCurve } from "@/core/netsim/curve-math";
import { indexedDbStore, type KeyValueStore } from "./runs";

/** Networks drawn on the Networks screen and saved in this browser (IndexedDB), under "Yours". */

export const NETWORK_FORMAT = "rebuffer-saved-network";

export interface SavedNetwork {
  format: typeof NETWORK_FORMAT;
  id: string;
  name: string;
  /** Epoch milliseconds of the last save. */
  savedAt: number;
  curve: NetworkCurve;
  /** The preset or recorded trace it started from, if any. */
  basedOn?: string;
}

export interface NetworkStore {
  /** Newest first. */
  list(): Promise<SavedNetwork[]>;
  get(id: string): Promise<SavedNetwork | undefined>;
  /** Saves a new network or replaces the one with its id. */
  save(network: SavedNetwork): Promise<void>;
  remove(id: string): Promise<void>;
}

const key = (id: string) => `network/${id}`;

export function createNetworkStore(
  store: KeyValueStore = indexedDbStore("rebuffer-networks", "networks"),
): NetworkStore {
  return {
    async list() {
      const keys = (await store.keys()).filter((name) => name.startsWith("network/"));
      return (await store.getMany(keys))
        .filter(isSavedNetwork)
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    async get(id) {
      const network = await store.get(key(id));
      return isSavedNetwork(network) ? network : undefined;
    },
    save: (network) => store.set(key(network.id), network),
    remove: (id) => store.del(key(id)),
  };
}

function isSavedNetwork(value: unknown): value is SavedNetwork {
  return (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === NETWORK_FORMAT &&
    "curve" in value &&
    typeof value.curve === "object" &&
    value.curve !== null
  );
}

let shared: NetworkStore | undefined;

/** This browser's networks. The database opens on first use. */
export function savedNetworks(): NetworkStore {
  shared ??= createNetworkStore();
  return shared;
}

/**
 * A short random id for a saved network. It starts with a letter: the router quotes a search value that reads as a
 * number ("12345678", "1234e567"), and the address should stay plain.
 */
export function newNetworkId(): string {
  return `n${crypto.randomUUID().slice(0, 7)}`;
}
