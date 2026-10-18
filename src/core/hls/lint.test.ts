import { describe, expect, it } from "vitest";
import { sortFindings } from "./findings";
import apple from "./fixtures/apple-multivariant.m3u8?raw";
import encrypted from "./fixtures/encrypted.m3u8?raw";
import fmp4Vod from "./fixtures/fmp4-vod.m3u8?raw";
import live from "./fixtures/live.m3u8?raw";
import llHls from "./fixtures/ll-hls.m3u8?raw";
import problemsMedia from "./fixtures/problems-media.m3u8?raw";
import problemsMultivariant from "./fixtures/problems-multivariant.m3u8?raw";
import { lintMeasuredBandwidth, lintMedia, lintMultivariant } from "./lint";
import { lineOf, mediaOf, multivariantOf } from "./testing";
import type { Finding } from "./types";

describe("lint: fixtures", () => {
  it("finds nothing in well-made playlists", () => {
    expect(lintMultivariant(multivariantOf(apple))).toEqual([]);
    for (const text of [fmp4Vod, encrypted, live, llHls]) {
      expect(lintMedia(mediaOf(text))).toEqual([]);
    }
  });

  it("finds the problems of our flawed multivariant playlist, sorted", () => {
    const findings = lintMultivariant(multivariantOf(problemsMultivariant));
    expect(findings.map((finding) => [finding.severity, finding.id, finding.line])).toEqual([
      ["warning", "missing-codecs", lineOf(problemsMultivariant, "BANDWIDTH=1600000")],
      ["warning", "missing-codecs", lineOf(problemsMultivariant, "BANDWIDTH=2800000")],
      ["note", "missing-independent-segments", undefined],
      ["note", "no-i-frame-playlists", undefined],
    ]);
    expect(findings[1]?.message).toBe("720p (2.8 Mbps) has no CODECS attribute.");
  });

  it("finds the long segment of our flawed media playlist", () => {
    expect(lintMedia(mediaOf(problemsMedia))).toEqual([
      expect.objectContaining({
        id: "segment-over-target",
        message: "Segment 12 lasts 6.6 s; the target duration is 6 s.",
        line: lineOf(problemsMedia, "#EXTINF:6.6"),
      }),
    ]);
  });

  it("gives the same findings every time", () => {
    const playlist = multivariantOf(problemsMultivariant);
    expect(lintMultivariant(playlist)).toEqual(lintMultivariant(playlist));
  });

  it("explains every finding and links its spec", () => {
    const findings = [
      ...lintMultivariant(multivariantOf(problemsMultivariant)),
      ...lintMedia(mediaOf(problemsMedia)),
    ];
    for (const finding of findings) {
      expect(finding.message).toMatch(/^[A-Z0-9].*\.$/);
      expect(finding.detail.length).toBeGreaterThan(40);
      expect(finding.ref.url).toMatch(/^https:\/\/(www\.rfc-editor\.org|developer\.apple\.com)\//);
    }
  });
});

describe("lintMeasuredBandwidth", () => {
  const variant = multivariantOf(problemsMultivariant).variants[3];
  if (variant === undefined) throw new Error("The fixture has no fourth variant.");

  it("warns when segments peak more than 10% above BANDWIDTH", () => {
    const finding = lintMeasuredBandwidth(variant, 3_400_000);
    expect(finding?.detail).toContain("Players choose a variant by comparing BANDWIDTH");
    expect(finding).toMatchObject({
      id: "bandwidth-under-declared",
      severity: "warning",
      message: "720p declares 2.8 Mbps; its segments peak at 3.4 Mbps.",
      line: lineOf(problemsMultivariant, "BANDWIDTH=2800000"),
      ref: {
        spec: "RFC 8216",
        section: "4.3.4.2",
        url: "https://www.rfc-editor.org/rfc/rfc8216#section-4.3.4.2",
      },
    });
  });

  it("allows up to 10% above BANDWIDTH and anything below", () => {
    expect(lintMeasuredBandwidth(variant, 3_080_000)).toBeUndefined();
    expect(lintMeasuredBandwidth(variant, 2_000_000)).toBeUndefined();
  });

  it("names a variant without RESOLUTION by its line", () => {
    expect(lintMeasuredBandwidth({ line: 9, bandwidth: 128_000 }, 200_000)?.message).toBe(
      "The variant on line 9 declares 128 kbps; its segments peak at 200 kbps.",
    );
  });

  it("returns nothing without a declared BANDWIDTH or a real measurement", () => {
    expect(lintMeasuredBandwidth({ line: 9 }, 3_400_000)).toBeUndefined();
    expect(lintMeasuredBandwidth(variant, Number.NaN)).toBeUndefined();
    expect(lintMeasuredBandwidth(variant, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe("sortFindings", () => {
  const finding = (id: string, severity: Finding["severity"], line?: number): Finding => ({
    id,
    severity,
    message: `${id}.`,
    detail: "",
    line,
    ref: { spec: "RFC 8216", url: "https://www.rfc-editor.org/rfc/rfc8216" },
  });

  it("orders by severity, then line (playlist-wide first), then id", () => {
    const sorted = sortFindings([
      finding("c", "note", 3),
      finding("b", "warning", 9),
      finding("a", "error", 20),
      finding("z", "error", 4),
      finding("y", "error"),
      finding("x", "error", 4),
      finding("w", "note"),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["y", "x", "z", "a", "b", "w", "c"]);
  });
});
