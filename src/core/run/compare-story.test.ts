import { describe, expect, it } from "vitest";
import { compareRuns } from "./compare";
import {
  compareVerdict,
  firstWeakens,
  heldBackText,
  lookFor,
  moments,
  noMoments,
  noSignal,
  shortRows,
  verdictFacts,
} from "./compare-story";
import {
  DEFAULTS,
  FAST_START,
  planned,
  runA,
  runTv,
  RURAL,
  tunnel,
  tvPlan,
} from "./compare-testing";

const fast = planned("fast", {
  player: FAST_START,
  firstFrame: 0.38,
  shown: [
    [0.38, 0],
    [8, 1],
    [14, 2],
    [20, 3],
    [38, 2],
    [44, 1],
    [52, 0],
    [60, 1],
    [68, 2],
    [76, 3],
  ],
  buffer: [
    [0.4, 1],
    [8, 6],
    [14, 10],
    [24, 24],
    [30, 28],
    [42, 22],
    [54, 10],
    [60, 8],
    [75, 27],
    [89, 30],
  ],
  end: 90,
});

const again = planned("a2", {
  firstFrame: 1.19,
  shown: [
    [1.19, 0],
    [5, 2],
    [10, 3],
    [37, 2],
    [53, 1],
    [67, 2],
    [79, 3],
  ],
  buffer: [
    [1, 2],
    [13, 17],
    [23, 30],
    [42, 23],
    [54, 10],
    [76, 28],
    [89, 30],
  ],
  end: 90,
});

describe("the network's shape", () => {
  it("finds the stretches with no signal and where the network first weakens", () => {
    expect(noSignal(tunnel)).toEqual([[42, 54]]);
    expect(firstWeakens(tunnel)).toBe(20);
  });
});

describe("compareVerdict", () => {
  it("calls a clear difference better or worse, with the facts behind it", () => {
    const verdict = compareVerdict(compareRuns(runA, runTv));
    expect(verdict).toMatchObject({
      title: "B did worse",
      direction: "worse",
      difference: "28 points lower",
      though: "",
      note: "28 points is more than the 2 that repeat runs of one setup differ by on their own.",
    });
    expect(verdict.facts).toBe(
      "B’s buffer stayed at 10 s or under, the target its player setup sets; A’s reached 30 s. B stalled once, for 3.4 s at 0:52; A didn’t stall. B was at 720p or above for 37 s, A for 41 s.",
    );
    expect(verdict.cells.map((cell) => [cell.label, cell.score])).toEqual([
      ["whole run", 56],
      ["whole run", 28],
    ]);
  });

  it("names the biggest part that pulls the other way", () => {
    const verdict = compareVerdict(compareRuns(runA, fast));
    expect(verdict.title).toBe("B did worse");
    expect(verdict.though).toBe("Though its first frame came 0.74 s sooner: +3 points.");
    expect(verdict.facts).toBe(
      "B was at 720p or above for 32 s, A for 41 s. B showed its first frame 0.74 s sooner. B changed quality 9 times to A’s 6. Neither stalled.",
    );
  });

  it("calls a difference within the spread no real difference", () => {
    const verdict = compareVerdict(compareRuns(runA, again));
    expect(verdict).toMatchObject({
      title: "No real difference",
      direction: "same",
      difference: "1 point lower, within spread",
      facts:
        "The two runs changed quality at the same moments, within a second of each other, and neither stalled. B’s first frame came 0.07 s after A’s.",
      note: "Repeat runs of one setup differ by about 2 points on their own; 1 is inside that.",
    });
  });

  it("reads a stopped run over the stretch both covered, as a lead", () => {
    const verdict = compareVerdict(
      compareRuns(runA, planned("tv41", { ...tvPlan, end: 41, reason: "stopped" })),
    );
    expect(verdict.title).toBe("B did worse over the first 0:41");
    expect(verdict.note).toBe(
      "Repeat runs of one setup differ by about 2 points over a whole run; over the first 0:41 nobody has measured it. Take this as a lead, and run both to the end to know. The stretch with no signal starts at 0:42, after B stopped.",
    );
    expect(verdict.cells.map((cell) => cell.label)).toEqual(["first 0:41", "first 0:41"]);
  });

  it("gives no verdict on a stretch too short to score", () => {
    const verdict = compareVerdict(
      compareRuns(runA, planned("tv6", { ...tvPlan, end: 6, reason: "stopped" })),
    );
    expect(verdict).toMatchObject({
      title: "Too short to compare",
      direction: undefined,
      facts:
        "B was stopped at 0:06, 4.9 s after its first frame. Scores are compared once both runs have played 0:30: before that, a score is mostly the wait for the first frame.",
      note: "This network first weakens at 0:20.",
    });
    expect(verdict.cells).toEqual([
      { side: "a", label: "whole run", score: 56, limit: "", why: "" },
      {
        side: "b",
        label: "0:06 played",
        score: undefined,
        limit: "",
        why: "Played 0:06 of the 0:30 needed",
      },
    ]);
  });

  it("gives no verdict when the real network held a run back", () => {
    const verdict = compareVerdict(compareRuns(runA, planned("tvH", { ...tvPlan, heldBack: 14 })));
    expect(verdict).toMatchObject({
      title: "Can’t compare these",
      facts:
        "Your real network held back 14 of B’s 20 downloads, so B played on less than Train through a tunnel gives. Part of any difference would be your connection’s, not Low-memory TV’s.",
      note: "Runs compare once each gets the network it was set to.",
    });
    expect(verdict.cells[1]).toMatchObject({ score: undefined, why: "Held back by your network" });
  });

  it("says what each network carried and what each score is measured against", () => {
    const rural = planned("r", {
      player: FAST_START,
      network: RURAL,
      firstFrame: 1.9,
      shown: [
        [1.9, 0],
        [14, 1],
        [22, 0],
        [60, 1],
      ],
      stalls: [[48, 50.6]],
      buffer: [
        [2, 1],
        [14, 6],
        [47.9, 0.1],
        [50.6, 0],
        [89, 8],
      ],
      end: 90,
    });
    const verdict = compareVerdict(compareRuns(runA, rural));
    expect(verdict.facts).toMatch(/^B’s network gave 600 kbps to 1\.7 Mbps; A’s up to 6 Mbps\. /);
    expect(verdict.note).toContain(
      "Each score is measured against the best its own network could carry: 720p for A, 360p for B. With 2 changes, it can’t be pinned on any one of them.",
    );
  });

  it("says when every fact is the same, the facts that still differ", () => {
    expect(verdictFacts(compareRuns(runA, runA))).toBe(
      "The two runs changed quality at the same moments, within a second of each other, and neither stalled. B’s first frame came 0.00 s after A’s.",
    );
  });
});

describe("where they differ", () => {
  it("finds where the runs part ways, in time order", () => {
    expect(moments(compareRuns(runA, runTv))).toEqual([
      { t: 22, side: "a", text: "A’s buffer reached 30 s. B’s stayed at 10 s." },
      {
        t: 30,
        side: "b",
        text: "The network fell to 1.2 Mbps. B went down to 360p. A stayed at 720p until 0:38.",
      },
      {
        t: 52,
        side: "b",
        text: "B stalled for 3.4 s, 10 s into the stretch with no signal. A had 13 s of video ahead.",
      },
    ]);
    expect(moments(compareRuns(runA, fast)).map((moment) => moment.text)).toEqual([
      "B’s first frame, at 240p, 0.74 s before A’s.",
      "A reached 720p. B was at 360p.",
      "B reached 720p, 11 s after A.",
      "The network lost its signal. B went down to 360p. A stayed at 540p until 0:52.",
    ]);
  });

  it("marks where a run was stopped, and whether the runs matched up to there", () => {
    const c = compareRuns(runA, planned("tv6", { ...tvPlan, end: 6, reason: "stopped" }));
    expect(moments(c)).toEqual([
      { t: 6, side: "b", text: "B was stopped. Up to here the two runs match." },
    ]);
    const partway = compareRuns(runA, planned("tv41", { ...tvPlan, end: 41, reason: "stopped" }));
    expect(moments(partway).at(-1)?.text).toBe(
      "B was stopped, a second before the stretch with no signal.",
    );
  });

  it("lists nothing when the runs match or the real network held one back", () => {
    const same = compareRuns(runA, again);
    expect(moments(same)).toEqual([]);
    expect(noMoments(same)).toBe("Nowhere by more than a second.");
    expect(lookFor(same, [])).toBe("The two rows match step for step.");
    const held = compareRuns(runA, planned("tvH", { ...tvPlan, heldBack: 14 }));
    expect(moments(held)).toEqual([]);
    expect(noMoments(held)).toBe(
      "Not listed: part of B’s run is your network’s doing, so a difference here wouldn’t say what the setup did.",
    );
  });
});

describe("lookFor", () => {
  it("points at what tells the runs apart", () => {
    const worse = compareRuns(runA, runTv);
    expect(lookFor(worse, moments(worse))).toBe(
      "Look at the red bars, where a picture stopped, and at each purple buffer just before.",
    );
    const partway = compareRuns(runA, planned("tv41", { ...tvPlan, end: 41, reason: "stopped" }));
    expect(lookFor(partway, [])).toBe(
      "Right of the dashed line at 0:41 is A alone; it isn’t counted.",
    );
    const held = compareRuns(runA, planned("tvH", { ...tvPlan, heldBack: 14 }));
    expect(lookFor(held, [])).toBe(
      "B’s row is what B got, your network’s delays included. The blue row is what was simulated.",
    );
  });
});

describe("when scores can't be compared", () => {
  it("shows what both runs reached in a stretch too short to score", () => {
    const a20 = planned("a20", {
      firstFrame: 1.12,
      shown: [
        [1.12, 0],
        [5, 2],
        [9, 3],
      ],
      buffer: [
        [1, 2],
        [12, 18],
        [19, 22],
      ],
      end: 20,
      reason: "stopped",
    });
    const c = compareRuns(a20, planned("tv12", { ...tvPlan, end: 12, reason: "stopped" }));
    expect(shortRows(c)).toEqual([
      {
        label: "First frame",
        value: "A 1.12 s · B 1.08 s",
        note: "0.04 s apart: within the 0.3 s that repeat runs differ by",
      },
      {
        label: "Quality on screen",
        value: "Both: 240p, 540p from 0:05, 720p from 0:09",
        note: "The same up to 0:12",
      },
      {
        label: "Buffer",
        value: "At 0:12: A 18 s · B 10 s",
        note: "B’s stayed at 10 s or under: the target its player setup sets",
      },
      {
        label: "Score",
        value: "Not compared",
        note: "Both played less than the 0:30 needed: A 0:20, B 0:12",
      },
    ]);
    expect(compareVerdict(c).facts).toBe(
      "A was stopped at 0:20 and B at 0:12. Scores are compared once both runs have played 0:30: before that, a score is mostly the wait for the first frame.",
    );
    expect(compareVerdict(c).note).toBe("This network first weakens at 0:20, where A stopped.");
  });

  it("says what to do when the real network held runs back", () => {
    const both = compareRuns(
      planned("aH", { ...tvPlan, player: DEFAULTS, heldBack: 9 }),
      planned("tvH", { ...tvPlan, heldBack: 14 }),
    );
    expect(heldBackText(both).text).toBe(
      "Run both again. It runs A, then B, and opens this comparison when B ends.",
    );
    expect(compareVerdict(both).facts).toBe(
      "Your real network held back downloads in both runs: 9 of A’s 20 and 14 of B’s 20. Part of each result is your connection’s, so the two can’t be set against each other.",
    );
  });
});
