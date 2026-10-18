import { describe, expect, it } from "vitest";
import { presetById } from "./presets";
import { curveFromParam, curveToParam } from "./url";

describe("curve URL values", () => {
  it("writes a short, readable value", () => {
    expect(
      curveToParam({
        shape: "steps",
        rttMs: 80,
        lengthS: 90,
        points: [
          { t: 0, mbps: 6 },
          { t: 20, mbps: 2.5 },
          { t: 42, mbps: 0 },
        ],
      }),
    ).toBe("steps,80,90,0:6|20:2.5|42:0");
  });

  it("round-trips every preset", () => {
    for (const id of ["tunnel", "cafe-wifi", "lift"]) {
      const curve = presetById(id)?.curve;
      if (!curve) throw new Error(`No preset ${id}`);
      const result = curveFromParam(curveToParam(curve));
      expect(result.ok).toBe(true);
      if (result.ok) expect(curveToParam(result.curve)).toBe(curveToParam(curve));
    }
  });

  it("explains a broken value", () => {
    const missing = curveFromParam("steps,80");
    expect(missing.ok).toBe(false);
    const bad = curveFromParam("steps,80,20,0:abc");
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.errors.length).toBeGreaterThan(0);
  });
});
