import { describe, expect, it } from "vitest";
import {
  describeRange,
  fitRange,
  isWhole,
  MIN_SPAN_S,
  noteRange,
  panRange,
  rangeFromDrag,
  wholeRange,
  zoomRange,
} from "./range";

describe("fitRange", () => {
  it("keeps a valid range as it is", () => {
    expect(fitRange({ from: 10, to: 30 }, 90)).toEqual({ from: 10, to: 30 });
  });

  it("widens a narrow range around its middle", () => {
    expect(fitRange({ from: 41, to: 42 }, 90)).toEqual({ from: 39.5, to: 39.5 + MIN_SPAN_S });
  });

  it("moves a range back inside the run without changing its width", () => {
    expect(fitRange({ from: -5, to: 15 }, 90)).toEqual({ from: 0, to: 20 });
    expect(fitRange({ from: 80, to: 100 }, 90)).toEqual({ from: 70, to: 90 });
  });

  it("shows all of a run shorter than the narrowest view", () => {
    expect(fitRange({ from: 1, to: 2 }, 3)).toEqual({ from: 0, to: 3 });
    expect(fitRange({ from: 0, to: 10 }, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe("zoomRange", () => {
  it("halves and doubles the view around its middle", () => {
    expect(zoomRange({ from: 0, to: 90 }, 0.5, 90)).toEqual({ from: 22.5, to: 67.5 });
    expect(zoomRange({ from: 40, to: 50 }, 2, 90)).toEqual({ from: 35, to: 55 });
  });

  it("stops at the narrowest view and at the whole run", () => {
    expect(zoomRange({ from: 40, to: 45 }, 0.5, 90)).toEqual({ from: 40.5, to: 44.5 });
    expect(zoomRange({ from: 10, to: 70 }, 2, 90)).toEqual(wholeRange(90));
  });
});

describe("panRange", () => {
  it("moves half a view either way and stops at the ends", () => {
    expect(panRange({ from: 40, to: 60 }, 0.5, 90)).toEqual({ from: 50, to: 70 });
    expect(panRange({ from: 40, to: 60 }, -0.5, 90)).toEqual({ from: 30, to: 50 });
    expect(panRange({ from: 5, to: 25 }, -0.5, 90)).toEqual({ from: 0, to: 20 });
    expect(panRange({ from: 65, to: 85 }, 0.5, 90)).toEqual({ from: 70, to: 90 });
  });
});

describe("noteRange", () => {
  it("leaves room either side of a note", () => {
    expect(noteRange(42, 54, 90)).toEqual({ from: 37, to: 59 });
    expect(noteRange(20, 60, 90)).toEqual({ from: 10, to: 70 });
  });

  it("gives a moment in time a view around it, inside the run", () => {
    expect(noteRange(1.2, 1.2, 90)).toEqual({ from: 0, to: 10 });
  });
});

describe("rangeFromDrag", () => {
  const view = { from: 30, to: 60 };

  it("turns pixels into times in the view, either way round", () => {
    expect(rangeFromDrag(view, 100, 400, 600, 90)).toEqual({ from: 35, to: 50 });
    expect(rangeFromDrag(view, 400, 100, 600, 90)).toEqual({ from: 35, to: 50 });
  });

  it("counts pixels past the plot as its edges and keeps the narrowest view", () => {
    expect(rangeFromDrag(view, -50, 700, 600, 90)).toEqual(view);
    expect(rangeFromDrag(view, 300, 302, 600, 90)).toEqual({ from: 43.05, to: 47.05 });
  });

  it("keeps the view when the plot has no width", () => {
    expect(rangeFromDrag(view, 0, 100, 0, 90)).toEqual(view);
  });
});

describe("isWhole and describeRange", () => {
  it("names the stretch on view", () => {
    expect(isWhole(wholeRange(90), 90)).toBe(true);
    expect(isWhole({ from: 0, to: 80 }, 90)).toBe(false);
    expect(describeRange(wholeRange(90), 90)).toBe("Showing all 1:30");
    expect(describeRange({ from: 42, to: 54 }, 90)).toBe("Showing 0:42–0:54 of 1:30");
  });
});
