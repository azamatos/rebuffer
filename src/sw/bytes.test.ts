import { describe, expect, it } from "vitest";
import { createByteQueue } from "./bytes";

const bytes = (...values: number[]) => Uint8Array.from(values);
const flat = (chunks: Uint8Array[]) => chunks.flatMap((chunk) => [...chunk]);

describe("createByteQueue", () => {
  it("hands out exact counts across chunk borders, in order", () => {
    const queue = createByteQueue();
    queue.push(bytes(1, 2, 3));
    queue.push(bytes());
    queue.push(bytes(4, 5));
    expect(queue.size).toBe(5);
    expect(flat(queue.take(2))).toEqual([1, 2]);
    expect(flat(queue.take(2))).toEqual([3, 4]);
    expect(queue.size).toBe(1);
    expect(flat(queue.take(10))).toEqual([5]);
    expect(queue.take(1)).toEqual([]);
  });

  it("drains what is left", () => {
    const queue = createByteQueue();
    queue.push(bytes(1, 2, 3));
    queue.take(1);
    expect(flat(queue.drain())).toEqual([2, 3]);
    expect(queue.size).toBe(0);
  });
});
