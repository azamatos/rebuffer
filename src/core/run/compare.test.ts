import { describe, expect, it } from "vitest";
import type { RunSummary } from "@/core/persist/runs";
import {
  compared,
  compareRuns,
  compareSubtitle,
  compareTitle,
  compareWarning,
  groupsForA,
  groupsForB,
  minComparedS,
  otherNumbers,
  partDeltas,
  runAgain,
  sameInBoth,
  scoreWalk,
  setupChanges,
  summaryChanges,
  summaryScore,
  summaryStatus,
  timelineRows,
} from "./compare";
import { DEFAULTS, FAST_START, planned, runA, runTv, RURAL, tvPlan } from "./compare-testing";

describe("compareRuns", () => {
  it("compares whole runs that played to the end", () => {
    const c = compareRuns(runA, runTv);
    expect(c.state).toBe("compared");
    expect(c.untilS).toBeUndefined();
    expect(c.minS).toBe(30);
    expect(c.lengthS).toBe(90);
    expect(c.sameNetwork).toBe(true);
    expect(c.streams).toBe(false);
    expect(c.changes.map((change) => change.label)).toEqual(["Player setup"]);
  });

  it("compares the stretch both covered when one was stopped", () => {
    const b = planned("tv41", { ...tvPlan, end: 41, reason: "stopped" });
    const c = compareRuns(runA, b);
    expect(c.state).toBe("compared");
    expect(c.untilS).toBe(41);
    expect(c.a.over.timeline.endS).toBe(41);
    expect(c.a.whole.timeline.endS).toBe(90);
  });

  it("calls a stretch under the minimum too short, whatever else", () => {
    const b = planned("tv6", { ...tvPlan, end: 6, reason: "stopped", heldBack: 3 });
    expect(compareRuns(runA, b).state).toBe("too-short");
  });

  it("holds back the verdict when the real network held a run back", () => {
    const b = planned("tvH", { ...tvPlan, heldBack: 14 });
    const c = compareRuns(runA, b);
    expect(c.state).toBe("held-back");
    expect(c.b.held).toBe(true);
    expect(c.a.held).toBe(false);
  });

  it("needs 30 s in common, or half a shorter network", () => {
    expect(minComparedS(90, 90)).toBe(30);
    expect(minComparedS(20, 90)).toBe(10);
  });
});

describe("the setups", () => {
  it("counts a player preset as one change, with the settings it changes listed", () => {
    const [change] = setupChanges(runA, runTv);
    expect(change).toMatchObject({ label: "Player setup", a: "Defaults", b: "Low-memory TV" });
    expect(change?.settings).toEqual([
      "buffer target 30 s → 10 s",
      "buffer ceiling 600 s → 20 s",
      "back buffer unlimited → 10 s",
      "cap to player size off → on",
    ]);
  });

  it("titles the page by what changed", () => {
    expect(compareTitle(compareRuns(runA, runTv))).toBe("Defaults → Low-memory TV");
    expect(compareTitle(compareRuns(runA, runA))).toBe("Defaults, run twice");
    const rural = planned("r", { ...tvPlan, player: FAST_START, network: RURAL });
    expect(compareTitle(compareRuns(runA, rural))).toBe("Defaults → Fast start on Rural 3G");
  });

  it("says what both share and how far each got", () => {
    expect(compareSubtitle(compareRuns(runA, runTv))).toBe(
      "Tears of Steel · Train through a tunnel · both played to the end (1:30)",
    );
    const stopped = planned("tv41", { ...tvPlan, end: 41, reason: "stopped" });
    expect(compareSubtitle(compareRuns(runA, stopped))).toBe(
      "Tears of Steel · Train through a tunnel · B stopped at 0:41 of 1:30",
    );
    const c = compareRuns(runA, runTv);
    expect(sameInBoth(runA, c.changes)).toBe(
      "The same in both: Tears of Steel, Train through a tunnel, Chrome on macOS.",
    );
  });

  it("warns when two things changed, with the run that would change one", () => {
    const rural = planned("r", { ...tvPlan, player: FAST_START, network: RURAL });
    expect(compareWarning(compareRuns(runA, rural))).toEqual({
      title: "A and B differ in 2 things",
      body: "The network and player setup both changed. This says how B did, not which change made the difference.",
      oneChange: "Run Fast start on Train through a tunnel",
    });
    expect(compareWarning(compareRuns(runA, runTv))).toBeUndefined();
  });

  it("warns about different streams and what their segments do to the score", () => {
    const other = planned("bbb", {
      ...tvPlan,
      player: DEFAULTS,
      stream: { url: "https://mux.example/bbb.m3u8", name: "Big Buck Bunny (Mux)" },
      segmentS: 10,
    });
    expect(compareWarning(compareRuns(runA, other))).toEqual({
      title: "Different streams",
      body: "Their qualities sit at different bitrates, so the quality rows are in Mbps and each run is scored against its own stream. Scores count switches and waiting per segment, and B’s segments are 10 s to A’s 4 s: each second of waiting costs B 2.5 times the points.",
    });
  });
});

describe("the score, part by part", () => {
  it("rounds B's parts against A's so they add up to the difference of the totals", () => {
    const c = compareRuns(runA, runTv);
    const deltas = partDeltas(c.a.over.score, c.b.over.score);
    const sum = Object.values(deltas).reduce((x, y) => x + y, 0);
    expect(sum).toBe(c.b.total - c.a.total);
  });

  it("walks from A's score to B's, with the measured fact under each part", () => {
    const c = compareRuns(runA, runTv);
    const walk = scoreWalk(c);
    expect(walk.steps.map((step) => step.label)).toEqual([
      "Quality earned",
      "Quality switches",
      "Stalls",
      "Wait for the first frame",
    ]);
    expect(walk.steps[0]?.from).toBe(c.a.total);
    expect(walk.steps.at(-1)?.to).toBe(c.b.total);
    expect(walk.steps[2]?.fact).toBe("A none · B 1 stall, 3.4 s (3.8% of the time)");
    expect(walk.steps[3]?.fact).toBe(
      "A 1.12 s · B 1.08 s: within the 0.3 s that repeat runs differ by",
    );
    expect(walk.title).toBe(`Where the ${c.a.shown - c.b.shown} points went`);
    expect(walk.band).toBe(c.a.shown);
    expect([walk.lo, walk.hi]).toEqual([0, 100]);
  });

  it("shows where a score is held at 0, and why the parts and scores differ", () => {
    const ruralA = planned("rA", {
      network: RURAL,
      firstFrame: 11.7,
      shown: [
        [11.7, 0],
        [20, 1],
        [30, 0],
      ],
      buffer: [
        [12, 4],
        [30, 10],
        [89, 10],
      ],
      end: 90,
    });
    const ruralB = planned("rB", {
      network: RURAL,
      player: FAST_START,
      firstFrame: 1.9,
      shown: [[1.9, 0]],
      buffer: [
        [2, 1],
        [30, 4],
        [89, 8],
      ],
      end: 90,
    });
    const c = compareRuns(ruralA, ruralB);
    const walk = scoreWalk(c);
    expect(c.a.total).toBeLessThan(0);
    expect(c.a.shown).toBe(0);
    expect(walk.lo).toBeLessThan(0);
    expect(Math.abs(walk.lo % 5)).toBe(0);
    expect(walk.title).toBe("Where the points went");
    expect(walk.subtitle).toContain(
      `A’s parts come to −${Math.abs(c.a.total)}, but a score stops at 0, so it shows 0.`,
    );
    expect(walk.subtitle).toContain(
      `That’s why the parts add up to +${c.b.total - c.a.total} while the scores differ by ${c.b.shown}.`,
    );
    expect(walk.a.fact).toBe(`Its parts come to −${Math.abs(c.a.total)}; a score stops at 0.`);
  });

  it("shades no spread over part of a run: it wasn't measured there", () => {
    const b = planned("tv41", { ...tvPlan, end: 41, reason: "stopped" });
    const walk = scoreWalk(compareRuns(runA, b));
    expect(walk.band).toBeUndefined();
    expect(walk.subtitle).toBe("From A’s score to B’s, part by part, over the first 0:41.");
    expect(walk.a.fact).toBe("Over its first 0:41");
  });
});

describe("the other numbers", () => {
  it("gives a tile to each number that differs and one line to the rest", () => {
    const { tiles, same } = otherNumbers(compareRuns(runA, runTv));
    expect(tiles.map((tile) => tile.label)).toEqual(["Average bitrate"]);
    expect(tiles[0]?.value).toMatch(/^\d\.\d Mbps lower$/);
    expect(same).toBe("The same in both: 0% of play time at the top quality, no wasted data.");
    expect(otherNumbers(compareRuns(runA, runA)).same).toMatch(/^All the same in both: /);
  });
});

describe("running again", () => {
  it("offers the stopped run, both, or the one held back", () => {
    const stopped = planned("tv41", { ...tvPlan, end: 41, reason: "stopped" });
    expect(runAgain(compareRuns(runA, stopped))).toMatchObject({
      sides: ["b"],
      label: "Run B again",
    });
    const aStopped = planned("a41", { ...tvPlan, player: DEFAULTS, end: 41, reason: "stopped" });
    const bStopped = planned("b65", { ...tvPlan, end: 65, reason: "stopped" });
    expect(runAgain(compareRuns(aStopped, bStopped))?.label).toBe("Run both again");
    const short = planned("tv6", { ...tvPlan, end: 6, reason: "stopped" });
    expect(runAgain(compareRuns(runA, short))).toMatchObject({
      sides: ["b"],
      label: "Run B again, to the end",
      note: "Same setup as B. It opens this comparison when it ends.",
    });
    const held = planned("tvH", { ...tvPlan, heldBack: 14 });
    expect(runAgain(compareRuns(runA, held))).toMatchObject({
      sides: ["b"],
      note: "Same setup as B.",
    });
    expect(runAgain(compareRuns(runA, runTv))).toBeUndefined();
  });
});

describe("the timeline as a table", () => {
  it("gives each run's network, quality and buffer every few seconds", () => {
    const short = planned("tv41", { ...tvPlan, end: 41, reason: "stopped" });
    const rows = timelineRows(compareRuns(runA, short));
    expect(rows).toHaveLength(19);
    expect(rows[0]?.a).toEqual({ network: 6_000_000, shown: "Starting", buffer: "—" });
    expect(rows[1]?.a.shown).toBe("540p");
    expect(rows[2]?.a.shown).toBe("720p");
    expect(rows[10]?.b).toEqual({ network: 0, shown: "not played", buffer: "not played" });
    const stalls = timelineRows(compareRuns(runA, runTv));
    expect(stalls.find((row) => row.t === 55)?.b.shown).toBe("Stalled");
  });
});

describe("choosing runs", () => {
  const summary = (id: string, overrides: Partial<RunSummary>): RunSummary => ({
    id,
    savedAt: 0,
    streamName: "Tears of Steel",
    streamUrl: "https://media.example/tears/master.m3u8",
    networkName: "Train through a tunnel",
    networkLengthS: 90,
    playerName: "Defaults",
    playerTitle: "defaults",
    score: 56.4,
    stalls: { count: 0, totalS: 0 },
    averageBitrate: 2_400_000,
    firstFrameS: 1.1,
    lengthS: 90,
    stopped: false,
    heldBack: false,
    ...overrides,
  });
  const a = summary("a", {});
  const tv = summary("tv", {
    playerName: "Low-memory TV",
    playerTitle: "low-memory tv",
    score: 28,
  });
  const tv41 = summary("tv41", {
    playerName: "Low-memory TV",
    playerTitle: "low-memory tv",
    lengthS: 41,
    stopped: true,
    score: 28,
  });
  const tv6 = summary("tv6", { playerName: "Low-memory TV", lengthS: 6, stopped: true });
  const held = summary("held", { heldBack: true });
  const cafe = summary("cafe", { networkName: "Busy café Wi-Fi", score: 75 });
  const rural = summary("rural", {
    networkName: "Rural 3G",
    playerName: "Fast start",
    playerTitle: "fast start",
  });
  const bbb = summary("bbb", {
    streamName: "Big Buck Bunny (Mux)",
    streamUrl: "https://mux.example/bbb",
  });

  it("scores and states a run as Compare would show it", () => {
    expect(summaryScore(a)).toBe("56 / 100");
    expect(summaryScore(tv41)).toBe("28 / 100 over its 0:41");
    expect(summaryScore(tv6)).toBe("Too short to compare");
    expect(summaryScore(held)).toBe("Not compared");
    expect(summaryStatus(tv41)).toBe("Stopped at 0:41 of 1:30");
    expect(summaryStatus(a)).toBe("1:30, played to the end");
  });

  it("describes B by how it differs from A", () => {
    expect(summaryChanges(a, tv)).toEqual(["Player setup: Low-memory TV"]);
    expect(summaryChanges(a, rural)).toEqual(["Network: Rural 3G", "Player setup: Fast start"]);
    expect(summaryChanges(a, held)).toEqual([]);
  });

  it("groups A's choices by stream and network, B's by how many things differ", () => {
    const runs = [tv, a, cafe, rural, bbb, held];
    expect(groupsForA(runs).map((group) => [group.name, group.rows.length])).toEqual([
      ["Tears of Steel · Train through a tunnel", 3],
      ["Tears of Steel · Busy café Wi-Fi", 1],
      ["Tears of Steel · Rural 3G", 1],
      ["Big Buck Bunny (Mux) · Train through a tunnel", 1],
    ]);
    expect(groupsForA(runs)[0]?.rows.find((row) => row.summary.id === "a")?.near).toBe(3);
    expect(
      groupsForB(a, runs).map((group) => [group.key, group.rows.map((row) => row.summary.id)]),
    ).toEqual([
      ["one", ["tv", "cafe"]],
      ["none", ["held"]],
      ["more", ["rural"]],
      ["stream", ["bbb"]],
    ]);
  });
});

describe("cutEvents", () => {
  it("cuts a run at a time as if stopped there", () => {
    const cut = compared(runA, 20);
    expect(cut.timeline.endS).toBe(20);
    expect(cut.metrics.endS).toBe(20);
  });
});
