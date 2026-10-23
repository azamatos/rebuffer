import { describe, expect, it } from "vitest";
import { parsePlaylist, type MediaPlaylist } from "@/core/hls";
import { segmentChart } from "./segments";

const playlist = parsePlaylist(
  [
    "#EXTM3U",
    "#EXT-X-TARGETDURATION:4",
    "#EXTINF:4,",
    "a.mp4",
    "#EXTINF:4,",
    "b.mp4",
    "#EXTINF:4,",
    "c.mp4",
    "#EXTINF:2,",
    "d.mp4",
    "#EXT-X-ENDLIST",
    "",
  ].join("\n"),
) as MediaPlaylist;

const measured = (rates: (number | undefined)[]) => ({
  peakBps: Math.max(...rates.filter((rate) => rate !== undefined)),
  count: rates.length,
  rates,
});

describe("segmentChart", () => {
  it("charts each segment's bit rate, with its stats", () => {
    const chart = segmentChart(playlist, measured([2e6, 3e6, 1e6, 2e6]), {
      declaredBps: 4e6,
    });
    expect(chart.bars.map((bar) => [bar.start, bar.bps])).toEqual([
      [0, 2e6],
      [4, 3e6],
      [8, 1e6],
      [12, 2e6],
    ]);
    expect(chart.averageBps).toBeCloseTo(2e6, -2);
    expect(chart.stats).toBe("4 segments · 4 s each · 0:14 · average 2 Mbps");
    expect(chart.takeaway).toBe(
      "Every segment fits under the declared 4 Mbps. The busiest, at 0:04, needs 3 Mbps.",
    );
  });

  it("says how far the busiest segment is over what's declared", () => {
    expect(
      segmentChart(playlist, measured([2e6, 4.6e6, 1e6, 2e6]), {
        declaredBps: 4e6,
        separateAudio: true,
      }).takeaway,
    ).toBe(
      "The busiest segment, at 0:04, needs 4.6 Mbps: 15% more than the 4 Mbps declared. The declared bandwidth counts its audio too; the bars are the video alone.",
    );
    expect(segmentChart(playlist, measured([1e5, 1.3e5, 1e5, 1e5])).takeaway).toBe(
      "The busiest segment, at 0:04, needs 130 kbps; on average 109 kbps.",
    );
  });

  it("says when no size could be read", () => {
    const chart = segmentChart(playlist, undefined, { declaredBps: 4e6 });
    expect(chart.bars.every((bar) => bar.bps === undefined)).toBe(true);
    expect(chart.stats).toBe("4 segments · 4 s each · 0:14");
    expect(chart.takeaway).toBe(
      "The segments' sizes couldn't be read, so there's no bit rate to chart.",
    );
  });
});
