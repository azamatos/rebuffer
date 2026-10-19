import { qualityLabel } from "@/core/hls/format";
import type { Level } from "@/core/run/events";

/** The parts of an hls.js level the lab reads. */
export interface HlsLevelLike {
  bitrate: number;
  width: number;
  height: number;
  name?: string | undefined;
}

/**
 * Levels are named by their 16:9 width class, like the inspector (1280×534 → "720p"), so a wide film doesn't show up
 * as "534p". A level without a size keeps its NAME, or gets a number.
 */
export function levelsFromHls(levels: readonly HlsLevelLike[]): Level[] {
  return levels.map((level, index) => {
    const sized = level.width > 0 && level.height > 0;
    return {
      index,
      bitrate: level.bitrate,
      ...(sized ? { width: level.width, height: level.height } : {}),
      name: sized
        ? qualityLabel({ width: level.width, height: level.height })
        : level.name?.trim() || `Level ${index + 1}`,
    };
  });
}

/** The parts of a `TimeRanges` the lab reads. */
export interface TimeRangesLike {
  readonly length: number;
  start(index: number): number;
  end(index: number): number;
}

/**
 * Seconds of media buffered ahead of `position`. Ranges closer than `maxHole` seconds are treated as one,
 * like the player does when it jumps small gaps.
 */
export function bufferAhead(ranges: TimeRangesLike, position: number, maxHole = 0.5): number {
  let end: number | undefined;
  for (let i = 0; i < ranges.length; i++) {
    const start = ranges.start(i);
    const rangeEnd = ranges.end(i);
    if (end === undefined) {
      if (position >= start - maxHole && position < rangeEnd) end = rangeEnd;
    } else if (start - end <= maxHole) {
      end = Math.max(end, rangeEnd);
    }
  }
  return end === undefined ? 0 : Math.max(0, end - position);
}
