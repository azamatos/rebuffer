# Rebuffer: the Compare screen needs a real design

Rebuffer is a browser-only lab for HLS video streaming. A visitor picks a stream and a simulated network (a train
through a tunnel, a busy café, rural 3G, or a curve they draw), presses Run, and a real player (hls.js) plays through
it while live charts show what happens. A report scores the run out of 100 and explains it. Live at
https://rebuffer.azamatos.com. This project holds the app's tokens in both themes, its fonts, its stylesheet and its
parts. The Report screen (run something with "Try the tunnel", then open its report) is the best-designed screen in
the app; Compare should feel like it belongs there.

## Where this stands

Compare was designed here once and built as drawn. The owner's verdict on the live page: "They look awful. There is a
lot of misleading things in the table and graphs." They see it as the weakest screen in the app and can't test the
product while it looks like this. Please treat the first design as a failed attempt, not a starting point.

## What Compare is for

A visitor has two saved runs, A and B, and usually B is A with one thing changed (another player setup, or another
network; the Report has a "Change one thing" button that runs B and opens Compare). They want to know: **was B better,
by how much, and why?** The screen must answer that quickly, and say honestly when it can't.

What the data offers per run: the score with its breakdown (quality earned; points lost to quality switches, stalls
and the wait for the first frame), first frame, stalls (count, seconds), rebuffer ratio, average bitrate, time at the
top quality, quality switches, wasted data; the quality shown over time, the buffer over time, the stalls, and the
simulated network's bandwidth over time. Repeat runs of one setup differ a little on their own (about 2 score points,
0.3 s of first frame, 0.1 s of stall time), so a small difference is not a result.

## What was wrong, from the live page (owner's screenshots, 2026-10-23)

- **Misleading numbers.** B was stopped after 6 seconds. The page showed A "0 / 100", B "100 / 100" and a green "▲ 100
  points higher" under the words "Too early to tell". Six seconds of a run is mostly the wait for the first frame, so
  that verdict means nothing and looked like a result.
- **A table that doesn't communicate.** Nine rows of mostly "= same", with "0.16 s later ≈ within spread" and "1
  fewer ▲ better" looking equally important. You can't see how big anything is.
- **Charts that mislead.** The two runs' quality lines, two different networks (one as a filled area, one dotted) and
  a log axis are drawn on top of each other: you can't tell which line is a run and which is a network, and A (solid
  black) and B (dashed green) are hard to tell apart where they overlap, which is most of the chart. The buffer chart
  is two overlapping lines with the same fact written above and below it.
- **A confusing start.** Two long dropdowns pre-filled with the two newest runs, which may have nothing to do with each
  other. The dropdown showed "22/100" for a run the page then scored 0, with no explanation, and a run stopped at 0:06
  showed "100/100" with nothing saying it was stopped.
- Overall it reads like a document of facts, not a comparison.

## Situations the design has to handle

- Both ran to the end; one clearly better, one clearly worse, or mixed (B starts sooner but switches more).
- Nearly identical (same setup, or a difference inside the run-to-run spread).
- One or both runs stopped early: very short (seconds), or partway (say 0:41 of 1:30). When a run is too short to
  compare scores, the page shouldn't present a verdict it can't back.
- The two runs differ in more than one thing, or are different streams (different quality ladders, so pictures can't
  share one axis; bitrates can).
- The runs ran on different networks, or on the same one.
- Only one run saved, or none.
- Phones (360 px) as well as desktop.

## Constraints

- Both themes: the dark "instrument panel" (default) and the light one. Text contrast at least 4.5:1, large text and
  controls 3:1.
- Keyboard first: everything reachable with Tab, visible focus, nothing only on hover. Every chart keeps a Chart |
  Table switch, with a text alternative.
- Desktop to 1280 px; phones from 360 px with no sideways page scroll.
- The app's stylesheet budget is 9 KB compressed and about 1 KB is free: reuse existing parts, colours and radii where
  they fit; if the design needs more, say what and why.
- Plain words, numbers with units, no streaming jargon without a few words of explanation. Mark invented example data
  as invented.
- The app draws its charts itself on canvas. If the design is better served by a charting library, name it and say why;
  that is open to decision.

## What to send back

Screens for the situations above in both themes, at desktop and phone widths, with a note wherever you chose something
this brief left open. I'll check them against the problems listed here and tell the owner what they miss before
building anything.
