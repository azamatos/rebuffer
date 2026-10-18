import { describe, expect, it } from "vitest";
import { formatClock, formatDuration } from "./time";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(58)).toBe("0:58");
    expect(formatClock(90)).toBe("1:30");
  });

  it("adds hours when needed", () => {
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("keeps the requested decimals", () => {
    expect(formatClock(51.8, 1)).toBe("0:51.8");
    expect(formatClock(55.24, 1)).toBe("0:55.2");
    expect(formatClock(1.426, 2)).toBe("0:01.43");
    expect(formatClock(60, 1)).toBe("1:00.0");
  });

  it("carries rounding into the next second", () => {
    expect(formatClock(59.96, 1)).toBe("1:00.0");
    expect(formatClock(59.6)).toBe("1:00");
  });

  it("treats negative and non-finite input as zero", () => {
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(Number.NaN)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY, 1)).toBe("0:00.0");
  });
});

describe("formatDuration", () => {
  it("uses milliseconds below a second", () => {
    expect(formatDuration(0.25)).toBe("250 ms");
  });

  it("uses one decimal below ten seconds", () => {
    expect(formatDuration(3.4)).toBe("3.4 s");
    expect(formatDuration(3)).toBe("3 s");
  });

  it("rounds whole seconds up to a minute", () => {
    expect(formatDuration(42.4)).toBe("42 s");
  });

  it("uses minutes from a minute up", () => {
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(125)).toBe("2 min 5 s");
  });

  it("returns zero for empty input", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(-1)).toBe("0 s");
  });
});
