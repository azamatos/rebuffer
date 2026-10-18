/** A first-in, first-out queue of byte chunks that hands out exact byte counts without copying. */
export interface ByteQueue {
  readonly size: number;
  push(chunk: Uint8Array): void;
  /** Takes up to `count` bytes as views on the queued chunks. */
  take(count: number): Uint8Array[];
  /** Takes everything left. */
  drain(): Uint8Array[];
}

export function createByteQueue(): ByteQueue {
  const chunks: Uint8Array[] = [];
  let size = 0;

  function take(count: number): Uint8Array[] {
    const taken: Uint8Array[] = [];
    let left = Math.min(count, size);
    while (left > 0) {
      const head = chunks[0];
      if (!head) break;
      if (head.byteLength <= left) {
        chunks.shift();
        taken.push(head);
        left -= head.byteLength;
        size -= head.byteLength;
      } else {
        taken.push(head.subarray(0, left));
        chunks[0] = head.subarray(left);
        size -= left;
        left = 0;
      }
    }
    return taken;
  }

  return {
    get size() {
      return size;
    },
    push(chunk) {
      if (chunk.byteLength === 0) return;
      chunks.push(chunk);
      size += chunk.byteLength;
    },
    take,
    drain: () => take(size),
  };
}
