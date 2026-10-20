import { describe, expect, it } from "vitest";
import { validateCurve, type NetworkCurve } from "./curve";
import {
  addPointAfter,
  deletePoint,
  inTimeOrder,
  insertPoint,
  ladderStep,
  moveTime,
  placePoint,
  record,
  redo,
  roundRate,
  setLength,
  setRate,
  setRtt,
  setShape,
  startHistory,
  stepRate,
  timeBounds,
  undo,
} from "./edit";
import { presetById } from "./presets";

const steps = (points: [number, number][], lengthS = 60): NetworkCurve => ({
  shape: "steps",
  rttMs: 50,
  lengthS,
  points: points.map(([t, mbps]) => ({ t, mbps })),
});

const tunnel = presetById("tunnel")?.curve as NetworkCurve;
const times = (curve: NetworkCurve) => curve.points.map((point) => point.t);
const valid = (curve: NetworkCurve) => validateCurve(curve).ok;

describe("timeBounds and moveTime", () => {
  it("keeps a steps point strictly between its neighbours", () => {
    const curve = steps([
      [0, 6],
      [20, 2],
      [40, 6],
    ]);
    expect(timeBounds(curve, 1)).toEqual({ min: 0.1, max: 39.9 });
    expect(times(moveTime(curve, 1, 55))).toEqual([0, 39.9, 40]);
    expect(times(moveTime(curve, 1, -3))).toEqual([0, 0.1, 40]);
    expect(times(moveTime(curve, 2, 99))).toEqual([0, 20, 60]);
  });

  it("lets a slopes point meet a neighbour (a jump), but never make three at one time", () => {
    // In the tunnel, points 1 and 2 are a jump at 0:20 and points 3 and 4 one at 0:30: point 2 may stay at 0:20,
    // but stops short of 0:30.
    expect(timeBounds(tunnel, 2)).toEqual({ min: 20, max: 29.9 });
    expect(timeBounds(tunnel, 0)).toEqual({ min: 0, max: 19.9 });
    const moved = moveTime(tunnel, 7, 50);
    expect(moved.points[7]).toEqual({ t: 50, mbps: 0 });
    expect(valid(moved)).toBe(true);
  });

  it("rounds times to tenths and keeps a point that has no room where it is", () => {
    const curve = steps([
      [0, 1],
      [10, 2],
      [10.1, 3],
      [10.2, 4],
    ]);
    expect(timeBounds(curve, 2)).toEqual({ min: 10.1, max: 10.1 });
    expect(times(moveTime(steps([[0, 1]]), 0, 12.345))).toEqual([12.3]);
  });
});

describe("rates", () => {
  it("rounds bandwidth for people and keeps it within the limits", () => {
    expect(roundRate(2.345)).toBe(2.35);
    expect(roundRate(12.34)).toBe(12.3);
    expect(roundRate(-1)).toBe(0);
    expect(roundRate(5000)).toBe(1000);
  });

  it("steps 10% up and down, through nothing", () => {
    expect(stepRate(0, 1)).toBe(0.1);
    expect(stepRate(0.1, 1)).toBe(0.11);
    expect(stepRate(6, 1)).toBe(6.6);
    expect(stepRate(10, 1)).toBe(11);
    expect(stepRate(6.6, -1)).toBe(6);
    expect(stepRate(0.1, -1)).toBe(0);
    expect(stepRate(0, -1)).toBe(0);
    expect(stepRate(1000, 1)).toBe(1000);
  });

  it("jumps to the next ladder line, to nothing below the lowest", () => {
    const ladder = [469_484, 938_042, 1_918_296, 3_295_352, 5_991_394];
    expect(ladderStep(2, ladder, 1)).toBe(3.3);
    expect(ladderStep(3.3, ladder, 1)).toBe(5.99);
    expect(ladderStep(5.99, ladder, 1)).toBe(5.99);
    expect(ladderStep(3.3, ladder, -1)).toBe(1.92);
    expect(ladderStep(0.47, ladder, -1)).toBe(0);
    expect(ladderStep(0, ladder, 1)).toBe(0.47);
  });

  it("sets a point's bandwidth", () => {
    expect(setRate(steps([[0, 6]]), 0, 2.468).points[0]).toEqual({ t: 0, mbps: 2.47 });
  });
});

describe("adding and deleting points", () => {
  const curve = steps([
    [0, 6],
    [20, 2],
  ]);

  it("adds halfway to the next point, or a few seconds after the last, at the curve's bandwidth", () => {
    expect(addPointAfter(curve, 0)).toEqual({
      curve: steps([
        [0, 6],
        [10, 6],
        [20, 2],
      ]),
      index: 1,
    });
    expect(addPointAfter(curve, 1)?.curve.points.at(-1)).toEqual({ t: 25, mbps: 2 });
    expect(addPointAfter(steps([[60, 1]]), 0)).toBeUndefined();
  });

  it("inserts a point in time order, and refuses one where the order doesn't allow it", () => {
    expect(insertPoint(curve, 30.04, 1.234)).toEqual({
      curve: steps([
        [0, 6],
        [20, 2],
        [30, 1.23],
      ]),
      index: 2,
    });
    expect(insertPoint(curve, 20, 3)).toBeUndefined();
    const jump = insertPoint({ ...curve, shape: "slopes" }, 20, 3);
    expect(jump?.index).toBe(2);
    expect(jump && valid(jump.curve)).toBe(true);
  });

  it("deletes a point but always keeps one", () => {
    expect(times(deletePoint(curve, 0))).toEqual([20]);
    const single = steps([[0, 6]]);
    expect(deletePoint(single, 0)).toBe(single);
  });
});

describe("whole-network settings", () => {
  it("turns slopes into steps by keeping the later point of each jump", () => {
    const stepped = setShape(tunnel, "steps");
    expect(times(stepped)).toEqual([0, 20, 30, 42, 54, 60, 63]);
    expect(stepped.points[1]).toEqual({ t: 20, mbps: 2.5 });
    expect(valid(stepped)).toBe(true);
    expect(setShape(stepped, "slopes").shape).toBe("slopes");
  });

  it("drops points past a shorter length and keeps one at the start", () => {
    expect(times(setLength(tunnel, 45))).toEqual([0, 20, 20, 30, 30, 42, 42]);
    expect(setLength(steps([[10, 3]]), 5).points).toEqual([{ t: 0, mbps: 3 }]);
    expect(setLength(tunnel, 0).lengthS).toBe(1);
  });

  it("keeps the latency in whole milliseconds within the limits", () => {
    expect(setRtt(tunnel, 79.6).rttMs).toBe(80);
    expect(setRtt(tunnel, -5).rttMs).toBe(0);
  });

  it("checks the order the simulator needs", () => {
    expect(inTimeOrder(tunnel)).toBe(true);
    expect(inTimeOrder({ ...tunnel, shape: "steps" })).toBe(false);
    expect(inTimeOrder(steps([[70, 1]]))).toBe(false);
  });
});

describe("placePoint", () => {
  const curve = steps([
    [0, 6],
    [20, 2],
    [40, 6],
  ]);

  it("places a point where someone typed it", () => {
    expect(placePoint(curve, 1, 25, 0.5)).toEqual({
      ok: true,
      curve: steps([
        [0, 6],
        [25, 0.5],
        [40, 6],
      ]),
    });
  });

  it("says what's wrong instead of moving it elsewhere", () => {
    expect(placePoint(curve, 1, 45, 1)).toEqual({
      ok: false,
      error: "Time must be from 0:00.1 to 0:39.9, between this point's neighbours.",
    });
    expect(placePoint(curve, 1, 25, 2000)).toEqual({
      ok: false,
      error: "Bandwidth must be from 0 to 1000 Mbps.",
    });
  });
});

describe("history", () => {
  it("undoes and redoes whole curves, and a new edit clears what could be redone", () => {
    const a = steps([[0, 1]]);
    const b = steps([[0, 2]]);
    const c = steps([[0, 3]]);
    let history = record(record(startHistory(a), b), c);
    history = undo(history);
    expect(history.present).toBe(b);
    history = undo(history);
    expect(history.present).toBe(a);
    expect(undo(history)).toBe(history);
    history = redo(history);
    expect(history.present).toBe(b);
    history = record(history, c);
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
    expect(record(history, history.present)).toBe(history);
  });
});
