import type { KeyValueStore } from "./runs";

/** A key-value store in memory for tests; values are copied as IndexedDB would. */
export function memoryStore(): KeyValueStore & { size: () => number } {
  const map = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(structuredClone(map.get(key))),
    getMany: (list) => Promise.resolve(list.map((key) => structuredClone(map.get(key)))),
    set: (key, value) => {
      map.set(key, structuredClone(value));
      return Promise.resolve();
    },
    del: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...map.keys()]),
    size: () => map.size,
  };
}
