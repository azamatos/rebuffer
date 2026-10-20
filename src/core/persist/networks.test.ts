import { describe, expect, it } from "vitest";
import { createNetworkStore, NETWORK_FORMAT, type SavedNetwork } from "./networks";
import { memoryStore } from "./testing";

const network = (id: string, savedAt: number, name = `Network ${id}`): SavedNetwork => ({
  format: NETWORK_FORMAT,
  id,
  name,
  savedAt,
  curve: { shape: "steps", rttMs: 50, lengthS: 60, points: [{ t: 0, mbps: 5 }] },
});

describe("createNetworkStore", () => {
  it("saves, lists newest first, replaces by id and removes", async () => {
    const store = createNetworkStore(memoryStore());
    await store.save(network("a", 1));
    await store.save({ ...network("b", 2), basedOn: "tunnel" });
    expect((await store.list()).map((saved) => saved.id)).toEqual(["b", "a"]);
    expect((await store.get("b"))?.basedOn).toBe("tunnel");

    await store.save(network("a", 3, "Renamed"));
    expect((await store.list()).map((saved) => saved.name)).toEqual(["Renamed", "Network b"]);

    await store.remove("a");
    expect((await store.list()).map((saved) => saved.id)).toEqual(["b"]);
    expect(await store.get("a")).toBeUndefined();
  });

  it("ignores what isn't a saved network", async () => {
    const memory = memoryStore();
    await memory.set("network/x", { name: "not one" });
    const store = createNetworkStore(memory);
    expect(await store.list()).toEqual([]);
    expect(await store.get("x")).toBeUndefined();
  });
});
