import { describe, expect, it } from "vitest";
import { curveToJson } from "./curve";
import { curveFromCsv, curveFromFile, curveToCsv } from "./csv";
import { presetById } from "./presets";

const tunnel = presetById("tunnel")?.curve;

describe("curveToCsv and curveFromCsv", () => {
  it("writes the network with its settings and reads it back the same", () => {
    if (!tunnel) throw new Error("no tunnel");
    const csv = curveToCsv(tunnel);
    expect(csv.split("\n").slice(0, 4)).toEqual([
      "# rebuffer-network shape=slopes rtt_ms=80 length_s=90",
      "time_s,mbps",
      "0,6",
      "20,6",
    ]);
    expect(curveFromCsv(csv)).toEqual({ ok: true, curve: tunnel });
  });

  it("reads a plain table: clock times, semicolons, kbps in the header, Windows line ends", () => {
    expect(curveFromCsv("time;kbps\r\n0:00;4000\r\n0:02;350\r\n0:04;4000\r\n")).toEqual({
      ok: true,
      curve: {
        shape: "steps",
        rttMs: 50,
        lengthS: 6,
        points: [
          { t: 0, mbps: 4 },
          { t: 2, mbps: 0.35 },
          { t: 4, mbps: 4 },
        ],
      },
    });
  });

  it("says which lines it can't read", () => {
    expect(curveFromCsv("t,mbps\n0,5\nten,4\n2,\n3,x\n4,y\n")).toEqual({
      ok: false,
      errors: [
        "Line 3: expected a time and a bandwidth, like “12,3.5”.",
        "Line 4: expected a time and a bandwidth, like “12,3.5”.",
        "Line 5: expected a time and a bandwidth, like “12,3.5”.",
        "…and 1 more line like that.",
      ],
    });
    expect(curveFromCsv("time,mbps\n")).toEqual({
      ok: false,
      errors: ["This file has no rows of time and bandwidth."],
    });
  });

  it("passes on the simulator's own checks", () => {
    expect(curveFromCsv("0,5\n10,2000\n")).toEqual({
      ok: false,
      errors: ["Point 2: bandwidth can't be above 1000 Mbps."],
    });
  });
});

describe("curveFromFile", () => {
  it("reads JSON or CSV by the file's name, or by its first character", () => {
    if (!tunnel) throw new Error("no tunnel");
    expect(curveFromFile("tunnel.json", curveToJson(tunnel))).toEqual({ ok: true, curve: tunnel });
    expect(curveFromFile("tunnel.csv", curveToCsv(tunnel))).toEqual({ ok: true, curve: tunnel });
    expect(curveFromFile("pasted", curveToJson(tunnel))).toEqual({ ok: true, curve: tunnel });
    expect(curveFromFile("trace.txt", "0,5\n")).toMatchObject({ ok: true });
  });
});
