# Rebuffer: Compare, designed again (the first design failed)

Rebuffer is a browser-only lab for HLS video: a real player plays a stream through a simulated network, live charts show
what it does, and a report scores the run out of 100. Live at https://rebuffer.azamatos.com. This project holds the
app's tokens (both themes), fonts, stylesheet and parts. Use them.

## What happened

You designed Compare once (templates/compare). It was built as drawn, and the owner's verdict on the live page:
"they look awful, a lot of misleading things in the table and the graphs." It kept the old page's shape: two long
dropdowns, a plain table, three line charts laid over each other. The brief asked for something glanceable with bars.
Don't re-order that page. Design a different one. Compare is the screen where someone decides which setup is better,
so it must answer that at a glance and be honest about what it can't say.

## Look at the real thing first

Open https://rebuffer.azamatos.com/runs/<any report> (run something with "Try the tunnel" first; the Report is the
best-designed screen) and https://rebuffer.azamatos.com/runs/compare. Compare must feel like the Report's sibling:
the score card with its breakdown bars (Quality +68, Switches −7, Stalls, Startup), the eight tiles with a line of
explanation each, the charts with numbered markers. Reuse that vocabulary; don't invent a second one.

## The problems, from the live page (owner's screenshots, 2026-10-23)

1. **Meaningless scores.** B was stopped at 0:06. The page showed A "0 / 100", B "100 / 100" and a green "▲ 100
   points higher" under the headline "Too early to tell". Six seconds of a run is mostly the wait for the first frame.
   A big green verdict on that is a lie.
2. **The numbers table is a wall.** Nine rows, each "= same" or a green/grey word. You can't see magnitude; "0.16 s
   later ≈ within spread" and "1 fewer ▲ better" look equally important. Nothing is visual.
3. **The quality chart misleads.** Two different networks drawn as a filled area (A's) and a dotted outline (B's),
   with the two runs' lines on top, all on a log axis with 100 variants' worth of labels. You can't tell which line
   is the run and which is the network. A and B (solid black vs dashed green) are hard to tell apart where they
   overlap, which is most of the time.
4. **The buffer chart is two lines that mostly overlap**, with "Look for how low each line gets" above and the same
   fact written again below.
5. **Two long dropdowns** open the page, pre-filled with the two newest runs, which may be unrelated (a café run and a
   stopped Bus 4G run). The page says "Run A · 22/100" in the dropdown and "0 / 100" below it for the same run, with
   no explanation (the dropdown scores the whole run; the page scored its first 6 s).
6. **A stopped run looks perfect** ("Bus, 4G · defaults · 100/100") in the dropdown, with nothing saying it was
   stopped.
7. **A wrong count** ("the real network held back 23 of 17 downloads"): we're fixing that in code; just leave room for
   a short, plain honesty line.

## What Compare has to do

The question: **"B changed something; was it better, by how much, and why?"** In order:

1. **Which two runs, and are they comparable?** Show A and B as two compact chips (the setup in words, its score,
   when). Changing a run is one control, not two big selects. Come from the Report's "Change one thing" in the usual
   case: then A and B are known and the page shouldn't ask.
2. **The answer, visually.** Both scores as two bars on one 0–100 scale, each split into the Report's parts: quality
   earned, and points lost to switches, stalls and startup (so you can see why B scored differently, not just that it
   did). One plain sentence beside them, not a paragraph.
3. **The metrics as cards, not a table.** Group them: Start (first frame), Smoothness (stalls, stall time, rebuffer
   ratio), Picture (average bitrate, time at top quality, quality switches), Data (wasted). Each card shows A and B as
   two bars on one scale, the difference in words, and the run-to-run spread as a shaded band, so a difference inside
   the spread visibly isn't one. Cards where both are equal ("0 stalls vs 0 stalls") collapse into one line
   ("no stalls in either run"), because showing six "same" rows is noise.
4. **The runs on one timeline.** One lane per run (A above B), the quality on screen as coloured bands (the app's
   q0–q4 greens, labelled with the picture size), stalls as red marks, and the network drawn once above them when both
   ran on the same one, or each lane's own network behind its lane when they differ. Under the lanes, the buffer as two
   clearly different lines. Think: a gantt or swimlane, not two overlaid line charts. Chart | Table switch stays, as
   everywhere in the app.
5. **A and B are always told apart by more than a dash style:** two distinct hues, a letter badge, the same at every
   place on the page, both themes, AA contrast.

## States that must be designed (they're where it broke)

- **Not comparable yet.** B stopped early (under about 30 s, or under half of the shorter network): lead with that,
  "B stopped at 0:06 of 1:30. Too short to compare scores", show only what does compare (first frame), hide the score
  bars, and offer "Run B again". No green or red verdict.
- **Stopped later** (say 0:41 of 1:30): compare the stretch both covered, with a clear switch to whole runs, where only
  the first frame compares.
- **Two things changed**, or **different streams**: a warning above the answer, and the answer softened ("can't say
  which change"). Different streams: the timeline labels pictures by Mbps, not by name, because the ladders differ.
- **Same setup** (two runs of one setup): "no real difference" with the spread shown.
- **A clear win**, **a clear loss** and **mixed** (B starts sooner but switches more): the answer card must handle all.
- **One run only / none saved:** an empty state that says how to make a second (Report → Change one thing).
- **Phone (360 px):** cards stack, the timeline keeps its lanes with horizontal room, nothing scrolls sideways.

## The Report's "Change one thing" panel and Run B

They exist and were fine; leave them. Check they and the new Compare read as one flow (the toast, the banner that says
"Run B of a comparison").

## Limits

- Both themes (dark "instrument panel" default, light), AA contrast, everything reachable by keyboard with a visible
  focus, nothing only on hover. Every chart keeps Chart | Table.
- Desktop to 1280 px, phones from 360 px.
- The app's stylesheet budget is 9 KB compressed and about 1 KB is free. Reuse the existing classes, colours, radii.
  If a design needs more, say what and why.
- Plain words, numbers with units. No invented numbers in the live screens: mark example data as invented.
- Charts are drawn on canvas in the app today. A design that needs a charting library should say which and why; we may
  adopt one (uPlot is the candidate) if it makes the timeline simpler and clearer than our own drawing.

## What to send back

The states above, in both themes, at desktop and phone widths, each with a note wherever you chose something this brief
left open. Then I'll check your screens against this list, point by point, and tell the owner what they miss before
building anything.
