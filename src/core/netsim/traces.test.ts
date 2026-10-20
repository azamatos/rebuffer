import { describe, expect, it } from "vitest";
import { validateCurve } from "./curve";
import { networkById } from "./networks";
import { presets } from "./presets";
import { recordedTraces, TRACE_CREDIT } from "./traces";

describe("recorded traces", () => {
  it("are networks the simulator accepts, 90 s each", () => {
    expect(recordedTraces.map((trace) => trace.name)).toEqual([
      "Train, 4G",
      "Car, 4G",
      "Bus, 4G",
      "Walking, 4G",
    ]);
    for (const trace of recordedTraces) {
      expect(validateCurve(trace.curve)).toEqual({ ok: true, curve: trace.curve });
      expect(trace.curve.lengthS).toBe(90);
      expect(trace.description).not.toBe("");
    }
  });

  it("carry their credit", () => {
    expect(TRACE_CREDIT).toMatchObject({
      licence: "CC BY 4.0",
      sourceUrl: "https://doi.org/10.5281/zenodo.1219679",
      citation: "Raca et al., ACM MMSys 2018",
    });
  });

  it("are found by id next to the presets, with no id taken twice", () => {
    const ids = [...presets, ...recordedTraces].map((network) => network.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(networkById("irish-4g-car")?.name).toBe("Car, 4G");
    expect(networkById("tunnel")?.name).toBe("Train through a tunnel");
    expect(networkById("nowhere")).toBeUndefined();
  });
});
