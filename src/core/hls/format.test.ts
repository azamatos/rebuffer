import { describe, expect, it } from "vitest";
import {
  formatBitrate,
  formatInteger,
  formatSeconds,
  qualityLabel,
  variantName,
  variantNameWithBitrate,
} from "./format";

describe("formatBitrate", () => {
  it("uses Mbps with one decimal below 10 Mbps", () => {
    expect(formatBitrate(2_800_000)).toBe("2.8 Mbps");
    expect(formatBitrate(5_000_000)).toBe("5 Mbps");
    expect(formatBitrate(3_440_000)).toBe("3.4 Mbps");
  });

  it("uses whole Mbps from 10 Mbps up", () => {
    expect(formatBitrate(12_345_678)).toBe("12 Mbps");
  });

  it("uses kbps below 1 Mbps, rounding up to Mbps at the edge", () => {
    expect(formatBitrate(128_000)).toBe("128 kbps");
    expect(formatBitrate(999_600)).toBe("1 Mbps");
    expect(formatBitrate(640)).toBe("640 bps");
  });

  it("returns zero for empty input", () => {
    expect(formatBitrate(0)).toBe("0 kbps");
    expect(formatBitrate(Number.NaN)).toBe("0 kbps");
  });
});

describe("formatSeconds and formatInteger", () => {
  it("keeps the precision a playlist uses, up to milliseconds", () => {
    expect(formatSeconds(6.6)).toBe("6.6 s");
    expect(formatSeconds(6)).toBe("6 s");
    expect(formatSeconds(6.006)).toBe("6.006 s");
    expect(formatSeconds(4.00008)).toBe("4 s");
  });

  it("groups thousands", () => {
    expect(formatInteger(2_800_000)).toBe("2,800,000");
    expect(formatInteger(999)).toBe("999");
  });
});

describe("qualityLabel", () => {
  it("names the quality class from the short side, widened to 16:9", () => {
    expect(qualityLabel({ width: 1920, height: 1080 })).toBe("1080p");
    expect(qualityLabel({ width: 1920, height: 800 })).toBe("1080p");
    expect(qualityLabel({ width: 1280, height: 534 })).toBe("720p");
    expect(qualityLabel({ width: 426, height: 178 })).toBe("240p");
    expect(qualityLabel({ width: 640, height: 480 })).toBe("480p");
    expect(qualityLabel({ width: 1080, height: 1920 })).toBe("1080p");
    expect(qualityLabel({ width: 3840, height: 2160 })).toBe("2160p");
  });
});

describe("variant names", () => {
  it("prefers the quality class and falls back to the line", () => {
    expect(variantName({ line: 5, resolution: { width: 1280, height: 720 } })).toBe("720p");
    expect(variantName({ line: 5 })).toBe("the variant on line 5");
  });

  it("adds the declared bandwidth", () => {
    const resolution = { width: 1280, height: 720 };
    expect(variantNameWithBitrate({ line: 5, resolution, bandwidth: 2_800_000 })).toBe(
      "720p (2.8 Mbps)",
    );
    expect(variantNameWithBitrate({ line: 5, bandwidth: 128_000 })).toBe(
      "the 128 kbps variant on line 5",
    );
    expect(variantNameWithBitrate({ line: 5 })).toBe("the variant on line 5");
  });
});
