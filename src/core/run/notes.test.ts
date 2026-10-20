import { describe, expect, it } from "vitest";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import type { Level, RunEvent } from "./events";
import { whatHappened } from "./notes";
import { buildTimeline } from "./timeline";

const levels: Level[] = [
  { index: 0, bitrate: 400_000, name: "240p" },
  { index: 1, bitrate: 2_800_000, name: "720p" },
  { index: 2, bitrate: 5_000_000, name: "1080p" },
];

const steps = (points: [number, number][], lengthS = 60): NetworkCurve => ({
  shape: "steps",
  rttMs: 80,
  lengthS,
  points: points.map(([t, mbps]) => ({ t, mbps })),
});

const sample = (t: number, bufferS: number, estimateBps?: number): RunEvent => ({
  type: "sample",
  t,
  bufferS,
  estimateBps,
  droppedFrames: 0,
  position: 0,
});

const shown = (t: number, level: number): RunEvent => ({ type: "level-shown", t, level });
const end = (t: number): RunEvent => ({ type: "end", t, reason: "complete" });
const start: RunEvent[] = [
  { type: "levels", t: 0.1, levels },
  shown(0.9, 2),
  { type: "first-frame", t: 1 },
];

const notes = (events: RunEvent[], curve: NetworkCurve) =>
  whatHappened(buildTimeline(events), curve).map(({ start: from, end: to, text }) => ({
    from,
    to,
    text,
  }));

describe("whatHappened", () => {
  it("tells a tunnel: the step down, the abandon, the stall in the outage and the climb back", () => {
    const tunnel = steps([
      [0, 6],
      [20, 1.2],
      [30, 0],
      [40, 6],
    ]);
    expect(
      notes(
        [
          ...start,
          sample(10, 8),
          sample(20, 10),
          { type: "segment-loading", t: 20, level: 2, sn: 5 },
          { type: "segment-abandoned", t: 22, level: 2, sn: 5, bytesLoaded: 1_400_000 },
          shown(24, 1),
          shown(28, 0),
          sample(30, 4),
          sample(35, 0),
          { type: "stall-start", t: 35 },
          { type: "stall-end", t: 41 },
          shown(45, 1),
          shown(50, 2),
          end(60),
        ],
        tunnel,
      ),
    ).toEqual([
      { from: 0, to: 1, text: "The first frame appeared at 1 s, at 1080p (5 Mbps)." },
      {
        from: 24,
        to: 28,
        text:
          "The player stepped down from 1080p (5 Mbps) to 240p (400 kbps) in 2 switches. The network had fallen to " +
          "1.2 Mbps, below the 5 Mbps that 1080p needs. It gave up on a 1080p download on the way, wasting 1.4 MB.",
      },
      {
        from: 30,
        to: 41,
        text:
          "No signal from 0:30 to 0:40 (10 s). The buffer ran down from 4 s, and playback stalled at 0:35.0 " +
          "for 6 s.",
      },
      {
        from: 45,
        to: 50,
        text: "The player climbed from 240p (400 kbps) to 1080p (5 Mbps) in 2 switches, with the network at 6 Mbps.",
      },
    ]);
  });

  it("says when the buffer carried playback through a stretch with no signal", () => {
    const [, outage] = notes(
      [...start, sample(20, 26), sample(26, 18), sample(32, 14), sample(34, 16), end(60)],
      steps([
        [0, 6],
        [20, 0],
        [32, 6],
      ]),
    );
    expect(outage).toEqual({
      from: 20,
      to: 32,
      text:
        "No signal from 0:20 to 0:32 (12 s). The buffer ran down from 26 s to 14 s, and playback carried on " +
        "without a stall.",
    });
  });

  it("says so when nothing went wrong", () => {
    expect(notes([...start, end(60)], steps([[0, 50]]))).toEqual([
      { from: 0, to: 1, text: "The first frame appeared at 1 s, at 1080p (5 Mbps)." },
      {
        from: 1,
        to: 60,
        text: "No stalls and no quality changes: 1080p (5 Mbps) the whole way, with the network at 50 Mbps.",
      },
    ]);
  });

  it("says when the picture never appeared", () => {
    expect(notes([{ type: "levels", t: 0.1, levels }, end(20)], steps([[0, 0]], 20))).toEqual([
      {
        from: 0,
        to: 20,
        text: "The picture never appeared. The network stayed at 0 Mbps (no signal) over the run.",
      },
    ]);
  });

  it("doesn't blame the network when it carried enough, and gives the player's estimate", () => {
    const [, down] = notes(
      [...start, sample(9, 12, 2_500_000), shown(10, 1), end(30)],
      steps([[0, 6]], 30),
    );
    expect(down?.text).toBe(
      "The player stepped down from 1080p (5 Mbps) to 720p (2.8 Mbps). The network still carried at least " +
        "6 Mbps, enough for 1080p; the player's estimate was 2.5 Mbps.",
    );
  });

  it("explains a stall by the network only when the network shows it", () => {
    const low = notes(
      [...start, { type: "stall-start", t: 12 }, { type: "stall-end", t: 13 }, end(30)],
      steps(
        [
          [0, 6],
          [10, 1.2],
        ],
        30,
      ),
    );
    expect(low.at(-1)?.text).toBe(
      "Playback stalled at 0:12.0 for 1 s. The network was at 1.2 Mbps, below the 5 Mbps of 1080p on screen.",
    );
    const fine = notes([...start, { type: "stall-start", t: 12 }, end(30)], steps([[0, 6]], 30));
    expect(fine.at(-1)?.text).toBe(
      "Playback stalled at 0:12.0 for 18 s, until the run ended. The simulated network carried 6 Mbps then, " +
        "more than the quality on screen needs; the simulation check below says whether your real network held " +
        "downloads back.",
    );
  });

  it("gives an abandon of its own a note", () => {
    const [, gaveUp] = notes(
      [
        ...start,
        { type: "segment-loading", t: 5, level: 2, sn: 2 },
        { type: "segment-abandoned", t: 7, level: 2, sn: 2, bytesLoaded: 900_000 },
        end(30),
      ],
      steps([[0, 6]], 30),
    );
    expect(gaveUp).toEqual({
      from: 7,
      to: 7,
      text: "The player gave up on a 1080p (5 Mbps) download at 0:07.0, wasting 0.9 MB. The network was at 6 Mbps.",
    });
  });

  it("sums up a run with many switches in one note", () => {
    const busy: RunEvent[] = [...start];
    for (let i = 0; i < 10; i++) busy.push(shown(5 + i * 25, i % 2 === 0 ? 1 : 2));
    busy.push(end(300));
    const result = notes(busy, steps([[0, 6]], 300));
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      from: 5,
      to: 230,
      text: "The quality changed 10 times between 0:05 and 3:50, between 720p (2.8 Mbps) and 1080p (5 Mbps).",
    });
  });
});
