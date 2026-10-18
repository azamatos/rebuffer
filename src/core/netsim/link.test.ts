import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "./curve";
import {
  abortRequest,
  addRequest,
  advance,
  createLink,
  finishSupply,
  supplyBytes,
  type Link,
} from "./link";

/** 8 Mbps is one million bytes a second, which keeps the expected schedules readable. */
const steady = (rttMs = 0): NetworkCurve => ({
  shape: "steps",
  rttMs,
  lengthS: 60,
  points: [{ t: 0, mbps: 8 }],
});

function start(link: Link, id: string, bytes: number | undefined, startedAt = 0): void {
  addRequest(link, { id, startedAt });
  if (bytes === undefined) return;
  supplyBytes(link, id, bytes);
  finishSupply(link, id, bytes);
}

describe("one request", () => {
  it("releases bytes at the curve's rate", () => {
    const link = createLink(steady());
    start(link, "a", 1_000_000);
    expect(advance(link, 0.25)).toEqual([
      { id: "a", bytes: 250_000, released: 250_000, lateMs: 0, firstByteAt: 0 },
    ]);
    expect(advance(link, 0.5)).toEqual([{ id: "a", bytes: 250_000, released: 500_000, lateMs: 0 }]);
    expect(advance(link, 1)).toEqual([
      { id: "a", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 1 },
    ]);
    expect(link.requests.size).toBe(0);
  });

  it("waits one RTT before the first byte", () => {
    const link = createLink(steady(100));
    start(link, "a", 1_000_000);
    expect(advance(link, 0.05)).toEqual([]);
    expect(advance(link, 0.1)).toEqual([
      { id: "a", bytes: 0, released: 0, lateMs: 0, firstByteAt: 0.1 },
    ]);
    expect(advance(link, 0.6)).toEqual([{ id: "a", bytes: 500_000, released: 500_000, lateMs: 0 }]);
    const [last] = advance(link, 1.2);
    expect(last).toMatchObject({ id: "a", bytes: 500_000, released: 1_000_000, lateMs: 0 });
    expect(last?.doneAt).toBeCloseTo(1.1, 12);
  });

  it("follows a slope", () => {
    const link = createLink({
      shape: "slopes",
      rttMs: 0,
      lengthS: 10,
      points: [
        { t: 0, mbps: 0 },
        { t: 1, mbps: 16 },
      ],
    });
    start(link, "a", 1_000_000);
    expect(advance(link, 0.5)).toEqual([
      { id: "a", bytes: 250_000, released: 250_000, lateMs: 0, firstByteAt: 0 },
    ]);
    expect(advance(link, 2)).toEqual([
      { id: "a", bytes: 750_000, released: 1_000_000, lateMs: 0, doneAt: 1 },
    ]);
  });

  it("never finishes when the curve ends in an outage", () => {
    const link = createLink({
      ...steady(),
      points: [
        { t: 0, mbps: 8 },
        { t: 1, mbps: 0 },
      ],
    });
    start(link, "a", 2_000_000);
    expect(advance(link, 10)).toEqual([
      { id: "a", bytes: 1_000_000, released: 1_000_000, lateMs: 0, firstByteAt: 0 },
    ]);
    expect(advance(link, 100)).toEqual([]);
    expect(link.requests.has("a")).toBe(true);
  });

  it("finishes an empty response one RTT after it starts", () => {
    const link = createLink(steady(100));
    start(link, "a", 0);
    expect(advance(link, 0.2)).toEqual([
      { id: "a", bytes: 0, released: 0, lateMs: 0, firstByteAt: 0.1, doneAt: 0.1 },
    ]);
  });
});

describe("sharing", () => {
  it("splits the bandwidth equally between two requests", () => {
    const link = createLink(steady());
    start(link, "a", 1_000_000);
    start(link, "b", 1_000_000);
    expect(advance(link, 1)).toEqual([
      { id: "a", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0 },
      { id: "b", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0 },
    ]);
    expect(advance(link, 2)).toEqual([
      { id: "a", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 2 },
      { id: "b", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 2 },
    ]);
  });

  it("splits the bandwidth equally between three requests", () => {
    const link = createLink(steady());
    for (const id of ["a", "b", "c"]) start(link, id, 1_500_000);
    expect(advance(link, 1.5).map(({ bytes }) => bytes)).toEqual([500_000, 500_000, 500_000]);
    expect(advance(link, 4.5)).toEqual(
      ["a", "b", "c"].map((id) => ({
        id,
        bytes: 1_000_000,
        released: 1_500_000,
        lateMs: 0,
        doneAt: 4.5,
      })),
    );
  });

  it("gives a finished request's share to the others", () => {
    const link = createLink(steady());
    start(link, "a", 500_000);
    start(link, "b", 1_500_000);
    expect(advance(link, 1)).toEqual([
      { id: "a", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0, doneAt: 1 },
      { id: "b", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0 },
    ]);
    expect(advance(link, 2)).toEqual([
      { id: "b", bytes: 1_000_000, released: 1_500_000, lateMs: 0, doneAt: 2 },
    ]);
  });

  it("doesn't share with a request that is still waiting for its RTT", () => {
    const link = createLink(steady(500));
    start(link, "a", 1_000_000, 0);
    start(link, "b", 1_000_000, 0.5);
    expect(advance(link, 1)).toEqual([
      { id: "a", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0.5 },
      { id: "b", bytes: 0, released: 0, lateMs: 0, firstByteAt: 1 },
    ]);
    expect(advance(link, 2)).toEqual([
      { id: "a", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 2 },
      { id: "b", bytes: 500_000, released: 500_000, lateMs: 0 },
    ]);
    expect(advance(link, 2.5)).toEqual([
      { id: "b", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 2.5 },
    ]);
  });

  it("gives up an aborted request's share", () => {
    const link = createLink(steady());
    start(link, "a", 1_000_000);
    start(link, "b", 1_000_000);
    advance(link, 1);
    expect(abortRequest(link, "a")).toMatchObject({ id: "a", released: 500_000, lateMs: 0 });
    expect(abortRequest(link, "a")).toBeUndefined();
    expect(advance(link, 1.5)).toEqual([
      { id: "b", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 1.5 },
    ]);
  });

  it("hands out whole bytes and loses none", () => {
    const link = createLink(steady());
    const total = 1_000_003;
    for (const id of ["a", "b", "c"]) start(link, id, total);
    const released = new Map<string, number>();
    for (let tick = 1; tick <= 400; tick++) {
      for (const delivery of advance(link, tick / 100)) {
        expect(Number.isInteger(delivery.bytes)).toBe(true);
        released.set(delivery.id, (released.get(delivery.id) ?? 0) + delivery.bytes);
      }
    }
    expect([...released.values()]).toEqual([total, total, total]);
    expect(link.requests.size).toBe(0);
  });
});

describe("late real network", () => {
  it("gives a waiting request's share to the others and counts how late it was", () => {
    const link = createLink(steady());
    start(link, "a", undefined);
    start(link, "b", 1_000_000);
    expect(advance(link, 0.5)).toEqual([
      { id: "b", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 0 },
    ]);
    supplyBytes(link, "a", 1_000_000);
    finishSupply(link, "a", 1_000_000);
    expect(advance(link, 1.5)).toEqual([
      { id: "a", bytes: 500_000, released: 500_000, lateMs: 500, firstByteAt: 0.5 },
      { id: "b", bytes: 500_000, released: 1_000_000, lateMs: 0, doneAt: 1.5 },
    ]);
    expect(advance(link, 2)).toEqual([
      { id: "a", bytes: 500_000, released: 1_000_000, lateMs: 500, doneAt: 2 },
    ]);
  });

  it("counts a gap in the middle of a response", () => {
    const link = createLink(steady());
    start(link, "a", undefined);
    supplyBytes(link, "a", 250_000);
    advance(link, 0.5);
    supplyBytes(link, "a", 250_000);
    finishSupply(link, "a", 500_000);
    expect(advance(link, 1)).toEqual([
      { id: "a", bytes: 250_000, released: 500_000, lateMs: 250, doneAt: 0.75 },
    ]);
  });

  it("doesn't count time when the simulated link is down anyway", () => {
    const link = createLink({
      ...steady(),
      points: [
        { t: 0, mbps: 0 },
        { t: 1, mbps: 8 },
      ],
    });
    start(link, "a", undefined);
    advance(link, 1);
    supplyBytes(link, "a", 500_000);
    finishSupply(link, "a", 500_000);
    expect(advance(link, 1.5)).toEqual([
      { id: "a", bytes: 500_000, released: 500_000, lateMs: 0, firstByteAt: 1, doneAt: 1.5 },
    ]);
  });

  it("doesn't count waiting for the end of a response whose bytes all went through", () => {
    const link = createLink(steady());
    start(link, "a", undefined);
    supplyBytes(link, "a", 500_000);
    advance(link, 1);
    finishSupply(link, "a", 500_000);
    expect(advance(link, 1.25)).toEqual([
      { id: "a", bytes: 0, released: 500_000, lateMs: 0, doneAt: 0.5 },
    ]);
  });

  it("counts the wait when a request is aborted while starving", () => {
    const link = createLink(steady());
    start(link, "a", undefined);
    advance(link, 0.3);
    expect(abortRequest(link, "a")?.lateMs).toBeCloseTo(300, 9);
  });
});

describe("misuse", () => {
  it("rejects inconsistent calls", () => {
    const link = createLink(steady());
    start(link, "a", 10);
    expect(() => {
      addRequest(link, { id: "a", startedAt: 0 });
    }).toThrow("Request a is already on the link.");
    expect(() => {
      supplyBytes(link, "a", 1);
    }).toThrow("Request a already finished; it can't take more bytes.");
    expect(() => {
      supplyBytes(link, "nope", 1);
    }).toThrow("Request nope isn't on the link.");
    addRequest(link, { id: "b", startedAt: 0 });
    supplyBytes(link, "b", 5);
    expect(() => {
      finishSupply(link, "b", 6);
    }).toThrow("Request b received 5 bytes but finished with 6.");
    expect(() => advance(link, Infinity)).toThrow(RangeError);
  });

  it("ignores time going backwards", () => {
    const link = createLink(steady());
    start(link, "a", 1_000_000);
    advance(link, 0.5);
    expect(advance(link, 0.25)).toEqual([]);
    expect(link.now).toBe(0.5);
  });
});
