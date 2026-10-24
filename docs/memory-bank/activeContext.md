# Active context

**Updated 2026-10-23 (ninth session, night).** The owner's goal since 2026-10-22: **finish this week** (by Sunday
2026-10-25), the LinkedIn post after they've tested the site. M4.6 group B (Compare reworked, Change one thing, Inspect
for big streams) is **live** (pushed 2026-10-23, CI green, checked in three browsers). **But the owner tested Compare
and rejects it: "they look awful", "a lot of misleading things in the table and graphs", and nothing visibly changed
from the old page. Compare needs a real redesign; the owner can't test the product while it looks like this.**
**2026-10-24 (tenth session): Claude Design's new Compare arrived and was checked against the brief; the owner has
the gaps and a recommendation, the build waits for their answer** (see "Next step", 1). Review page of group B:
https://claude.ai/artifact/HvkGNXGbPeb3on9X1NvDpN.
Read this first, then `progress.md` (M4.6).

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live charts and a log show what it does, and a report scores and explains
  the run. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **Live site = `main` at `9ffe308`** (pushed 2026-10-23 on the owner's "go with push and checks"; deployed in 30 s;
  CI green on a re-run, after the first try hung 32 minutes installing browsers). **Every push to `main` deploys on
  its own.** Pushing is outward-facing: ask the owner before each push.
- **Group B, live since 2026-10-23** (`main` at the README commit `0dfff96` and this memory bank): Compare reworked
  and Change one thing (`1de8583`), Inspect for big streams (`a17f61a`), run A dotted behind run B's live charts
  (`5668e29`), Inspect's picture names (`80ae3b1`). CI failed once on the push: the Inspect test matched the local
  encode's "1 Mbps" and CI encodes the test stream afresh; fixed in `14229e8`, CI green. Live checks (2026-10-23):
  Inspect with Apple's advanced example in Chromium, Firefox and WebKit; Change one thing end to end with our film
  in Chromium. Screens in `productContext.md`; the departures are decision 30.
- **Live since 2026-10-23** (the 20 commits pushed then), M4.6 except group B:
  - the CSV import test's toast wait (WebKit's flaky CI retry);
  - group A (the Run screen keeps its last frame and a short result, the network's name in the editor's header, a
    softer text selection, Inspect for pasted and big streams, fewer quality lines on charts), the CSP's `data:` (D2);
  - the score against the network (D1), SEO and link previews (D3: Open Graph and Twitter tags, `public/og.png`,
    per-page titles and heads written at build time, `sitemap.xml`), checked live with `curl` on 2026-10-23;
  - HAR import (D4, `6907809`), HAR export (D4, `4325691`: the worker now reports each response's status), networks
    export CSV only (`0760ba7`), Home's CSS budget 9 KB (`14f59d4`), the repeatability tables re-measured
    (`2e90093`), the Claude Design brief (`41121b0`).
- **What works (live since 2026-10-21, plus the local commits above):**
  - **Home:** rendered at build time, so it paints before the JavaScript runs; hero ("Try the tunnel" starts it), a
    setup (our two films, three public test streams or your own HLS link; seven network presets with a thumbnail
    each; four player presets; Run), recent runs, how it works.
  - **Run screen:** setup from the URL, a check of the real latency before the run, a state chip and a progress bar
    that glides with the run's clock, video, four tiles, three live charts (each with Chart | Table), an event log
    beside the video that ends with the charts, a polite live log that reads out switches and stalls, a one-line
    first-run hint (until "Got it"), and at the end the score, an honesty paragraph and "See the report".
  - **Report (`/runs/<id>`):** the simulation check as a line or a banner under the title, the score with its
    breakdown as bars, eight tiles (the eighth: the real network's speed while downloading), zoomable charts with
    numbered markers, "What happened" rows, "Try next" cards, setup, how the score is computed; Run again, Change
    network, Compare with…, Copy link, and a "More actions" menu (Export JSON, Export HAR, Delete); toasts confirm.
  - **Runs (`/runs`)** and **Compare (`/runs/compare`, built 2026-10-20):** two saved runs side by side: what changed,
    every number with B against A in words and a verdict, the charts overlaid (A solid, B dashed).
  - **Networks (`/networks`):** a sidebar of compact rows; the editor with Save and Run with this network in its
    header, a `?` list of the keys, one panel for the point and the whole network, Import (JSON, CSV, HAR) / Export
    (CSV) in one menu.
  - **Inspect (`/inspect`):** Link | Paste text | File as tabs, chips for samples, counts and playlists (each with its
    worst finding).
  - **About (`/about`, built 2026-10-20):** how a run works, where the simulation stops, how repeatable it is, the
    numbers and the score, privacy, credits (film, 4G dataset, test streams, libraries with licences).
  - **Light theme (built 2026-10-20, the owner asked for it):** System (default), Light or Dark from three radios in
    the header; no flash (a hashed inline script); charts redraw on a change; axe passes on every screen in both.
- **Quality bar today (2026-10-23, local):** 534 unit tests; 162 Playwright checks in Chromium, Firefox and WebKit:
  the full run had 158 pass, 3 keyboard checks skipped in WebKit (which only tabs to text fields) and 1 flaky (the
  Report's mouse-drag zoom in WebKit under the full load; 3 of 3 alone); the specs changed since pass in all three.
  axe on every screen in both themes. Home's JavaScript 96.63 of 100 KB and its CSS 7.97 of 9 KB (brotli).
  Lighthouse on Home 0.98–0.99 performance on the Mac and 0.99–1.0 in the Linux container, 1.0 in the rest, CLS 0
  (CI fails under 0.95 and opens `/`). With the fonts held back 1.5 s, layout shift stays under 0.03 on every screen.
- **Repeatability (`pnpm repeat`, measured again 2026-10-22 with the new score):** each preset 5× in Chromium on the
  2:00 synthetic stream: scores within 2 points per network (the 2 is Home fibre's first run in a fresh browser; the
  rest within 1), the same stalls and switches, first frames otherwise within 0.1 s. New scores: Home fibre 89–91,
  café 86, 4G 100, tunnel 37–38, Rural 3G 0, Lift 41–42, evening 88–89. One Rural 3G run had 4 of 68 downloads
  late from the local server (flagged by its result); Rural 3G alone again had none. Our film on the tunnel over the
  internet, 4 runs (`REPEAT_STREAM`): 60, 59, 59, 59, no stalls. The README and About quote these.
- **Schedule:** M0–M4 done (M4's target was Nov 22; done 2026-10-20 except the real Safari check, which needs the
  owner). The owner's goal since 2026-10-22: finish this week. The case study is dropped ("leave it. Do ur
  rebuffer"); pinning the repo and the LinkedIn post come after the owner has tested the site.

## Next step (in this order)

1. **Compare redesign (the owner's priority, 2026-10-23).** The brief for Claude Design is
   `.design-sync/briefs/compare-redo.md` (context only, no layout orders: the owner said Claude Design has its own
   skills; it names the live problems, the situations and the limits). **The screens arrived 2026-10-23** in
   Claude Design (project https://claude.ai/design/p/c7a57a4f-af89-43e4-a225-59c326219472), template "Compare
   (redesign)": `templates/compare-2/Compare2.dc.html` (11 states via `?state=worse|better|mixed|same|partway|short|
   two|streams|pick|one|none&theme=dark|light`) and `Compare2Board.dc.html` (22 frames with notes); the first design
   in `templates/compare/` is unchanged. Archive downloaded 2026-10-24 on the owner's OK (`~/Downloads/Rebuffer.zip`,
   844 KB). **(b) done 2026-10-24: checked against the brief and told the owner, waiting for their answer.** It covers
   all four problem areas and every listed situation: a verdict only with ≥ 30 s in common ("Too short to compare",
   B "Not scored"), a partway stop compared over the stretch both played ("first 0:41"); "Where the points went"
   (A's score to B's, part by part, as bars on one 0–100 scale, A ± 2 shaded); tiles only where numbers differ; one
   timeline row per run (network once when shared), quality on even steps, Mbps when streams differ, numbered markers
   with a "Where they differ" list; a B picker grouped by how many things differ. Gaps found: (1) the score is clamped
   to 0–100 (`score.ts`), so the part-by-part walk doesn't land on a clamped score (Rural 3G's parts add to about −6
   and show 0); (2) the part bars are coloured by part, not by gain or loss: a quality loss is green, close to the
   accent used for "better"; (3) "partway" at 360 px scrolls sideways 111 px (the header's three buttons don't wrap);
   (4) not drawn: a run whose simulation check failed, A stopped or both stopped, choosing A from scratch; (5) the
   design's sentences name causes ("so it ran dry"); by decision 30 they're written from rules as facts, and "Where
   they differ" needs new core code to find where two runs part ways. A score over the first N s is possible: saved
   runs keep their whole event log. Recommended fixing (1)–(4) in the build; **the owner chose another Claude
   Design round instead** ("I like what claude design did, lets ask it to fix"): the brief is
   `.design-sync/briefs/compare-redo-2.md` (problems and facts only, no fixes: the owner's rule), copied to the
   clipboard 2026-10-24 for the owner to paste. When the screens come back: export, check the five points again,
   tell the owner. Then: (c) build, with unit tests, keyboard and axe tests, screenshots in both themes and at 360 px; (d)
   show the owner, ask before pushing. Charts stay on our canvas (the design agrees; decision 15).
2. **Bugs in the live Compare, to fix with it** (owner's screenshots): over a 6 s stretch A scored 0 and B 100 with a
   green "▲ 100 points higher" under "Too early to tell"; "held back 23 of 17 downloads" (a download late both at its
   start and mid-body counted twice); the run dropdown showed 22/100 for a run the page scored 0, and a run stopped at
   0:06 showed 100/100 unmarked; the quality chart draws two networks plus two runs on one log axis, A (solid black)
   and B (dashed green) hard to tell apart. **Half-done fixes are uncommitted in the working tree** (typecheck
   passes, no tests run): `Honesty.lateRequests` counts each late download once (`metrics.ts`, used by
   `compare.ts`; test fixtures updated), `SUMMARY_VERSION` 3 with `RunSummary.stopped` (`runs.ts`, `summary.ts`),
   and in `compare.ts` `longEnough`/`MIN_COMPARED_S` (30 s, or half the shorter network) plus a `tooShortS` option in
   `compareVerdict` and `tally(rows, over)`. Not yet wired into `ComparePage.tsx`; no tests yet. Keep, test and wire
   them, or discard with `git checkout`.
2b. **The owner tests the live site** (the LinkedIn post comes after that), including the real Safari check (about 10
   minutes; checklist under "Waiting for the owner"), then LinkedIn's Post Inspector, pinning the repo and the post
   (a draft was given in chat; the owner approves it).
3. Whatever else the owner's test finds: fix, show, ask before each push. The owner's other note: **a new link preview
   image** (`public/og.png` looks odd; clearer, smoother, more charming), a later task: design it in Claude Design,
   then `scripts/og/card.html` and `node scripts/og/render.mjs` (`progress.md`, Later).
4. **At the next `/design-sync` (the owner starts it):** Claude Design's check lists 4 `--tw-*` variables set inside
   component classes and 13 variables without a category (`--animate-cursor` is ours; the rest are Tailwind's and
   Lightning CSS's). They don't change the designs, and they stay: the converter has no option to skip variables,
   and taking Tailwind's out of the stylesheet would break the previews (checked 2026-10-23; the earlier plan to
   filter them in `.design-sync/app-css.mjs` was wrong). Group B's new parts (GroupedLadder, ChangeOne, RunSwatch)
   could be synced then.

The owner collects fixes and reviews them when everything is ready (said 2026-10-20): keep building, list anything
that needs their eye under "Waiting for the owner".

## Working with the owner (how this went on 2026-10-19 to 2026-10-22)

- Give a recommendation with each choice; the owner answers "go with recommendations" or picks, after seeing results
  (live numbers, screenshots).
- They check the live site after a deploy. Ask before every push; they answered "lets push" / "lets go" each time.
- Things the agent's permission checker blocks: deploying by hand with wrangler and writing to the R2 bucket (the
  owner ran `node scripts/media/upload.mjs --playlists` themselves). Reading wrangler's login token is blocked too.
  On 2026-10-21 it also blocked `git push origin main` (a production deploy) after the owner's "go on". The
  owner's "lets push" got through on 2026-10-20. If a push is refused, give the owner `! git push origin main`.
- They want short status lines while the agent works, and plain answers to "what are you waiting for". On
  2026-10-22 they asked why networks export JSON and CSV ("are they used somewhere else?"); the honest answer
  (nothing else reads them) led to dropping JSON export. Questions like that deserve a check of the code first.

## Decisions (settled 2026-10-18 to 2026-10-22)

| # | Decision | Outcome |
|---|---|---|
| 1 | Name | **Rebuffer** |
| 2 | Domains | App at **rebuffer.azamatos.com**; **media.azamatos.com** only serves media files (R2 bucket `azamatos-media`). `*.pages.dev` addresses send `noindex` |
| 3 | Brand | The **family wordmark** shared with azamatos.com and pass.azamatos.com: `➜ ~ rebuffer.azamatos▊` in Space Mono, the cursor blinks at pass.azamatos.com's pace for 4.4 s, then stays solid (the owner first asked for endless blinking, then chose this on 2026-10-20 for WCAG 2.2.2). The favicon keeps the prompt arrow plus a stepped quality line |
| 4 | Design | The dark "instrument panel" look on the design canvas, accepted 2026-10-18 |
| 5 | Score | Normalised linear QoE (Yin et al., 2015) out of 100, formula shown |
| 6 | Network shaping | A Service Worker shapes the player's own requests, every origin except the app's own; a custom hls.js loader is the fallback |
| 7 | TypeScript | 6.0 with typescript-eslint; 7 when lint supports it |
| 8 | Stream links | The lab accepts **any HLS link**, with a clear message when a server blocks browser access |
| 9 | Samples | Our *Tears of Steel* (clean, and a version with planted mistakes) first; public test streams from Unified Streaming, Apple and Mux after it |
| 10 | Scope by Dec 6 | Compare two runs and the case study; Shaka Player after launch. Changed 2026-10-22: finish this week, the case study dropped |
| 11 | Repo | github.com/azamatos/rebuffer, public (owner created it 2026-10-19), pushed over SSH |
| 12 | Deploys | Cloudflare builds every push to `main` (working as of 2026-10-20; by hand before) |
| 13 | Repeat runs | The browser keeps what runs download (300 MB) so repeats match; approved 2026-10-20 ("go with recommendations") |
| 14 | Playlist cache time | A day instead of 5 minutes; approved 2026-10-20; the owner re-uploaded the 14 playlists the same day |
| 15 | Charts | Own canvas code instead of uPlot: the agent's call on 2026-10-20 (reasons in `techContext.md`, Stack), shown to the owner with the results |
| 16 | Themes | A light theme next to the dark one, with a System / Light / Dark switch; System is the default. The owner asked for it on 2026-10-20 ("not everyone will like" dark only); the light palette is the agent's, for the owner's eye |
| 18 | UI polish | The proposal (header, Run, Report, Networks, Inspect, motion) approved as drawn on 2026-10-20, with the eighth Report tile (the real network's speed) and the simulation check as a banner; built 2026-10-21, waiting for the owner's review |
| 17 | First paint | Home rendered at build time and hydrated, the app's code after the first paint: the agent's call on 2026-10-20 (`techContext.md`, "Themes and the first paint") |
| 19 | Score target (D1, reopens 5) | A run is measured against the best rendition at or under its network's mean bandwidth over the run, not the ladder's top; Yin et al.'s formula otherwise. Approved 2026-10-21 ("Go with recommendations"), built (`84d99d3`) |
| 20 | CSP (D2) | `media-src` allows `data:` for hls.js's empty subtitle track. Approved and built 2026-10-21 (`214d582`) |
| 21 | Preview image (D3) | `public/og.png` is committed, made by `scripts/og/render.mjs`. Approved and built 2026-10-21 (`3853f75`) |
| 22 | HAR (D4) | Import (a curve from DevTools' Export HAR, with a note on what it can't tell) and export (a run's downloads). Approved 2026-10-21; built 2026-10-22 (`6907809`, `4325691`) |
| 23 | Compare (D5) | "Change one thing": from a report, run B with one setting changed, then compare. Approved 2026-10-21; designed in Claude Design |
| 24 | Analytics (D6) | Cloudflare injects its beacon; a blocked beacon costs only the count. Approved 2026-10-21 |
| 25 | Design tool | Visual design happens in Claude Design (claude.ai/design), with the app's real parts synced there; the agent briefs and builds. The owner's call on 2026-10-21 ("U r not good on design stuff at all. Can we move to claude design?") |
| 26 | Network export | CSV only; JSON export dropped (it did what the CSV does, and nothing else reads it). Import keeps JSON, CSV and HAR. The owner's "Okay" to the recommendation, 2026-10-22 (`0760ba7`) |
| 27 | CSS budget | Home's CSS budget 9 KB (was 8), room for group B. The owner's "Do recommended", 2026-10-22 (`14f59d4`) |
| 28 | Schedule | Finish this week (by 2026-10-25); the case study on azamatos.com dropped ("leave it. Do ur rebuffer"); the LinkedIn post after the owner has tested the site. The owner, 2026-10-22 |
| 29 | Rural 3G's 0 | Keep Yin et al.'s formula as published: the 11.7 s first frame and hls.js starting at 720p cost what the paper charges; the Report's bars and the README show why. The owner's "go … with recommended", 2026-10-23 |
| 30 | Group B as built | The departures from the Claude Design screens stand (review page, 2026-10-23): "within spread" in every comparison, verdicts written from the numbers, "HEVC · HDR (PQ)" for HDR10+, Inspect's input card kept, no peak tag, "Segments" always, pictures named as the app does, hand-set settings kept in B. Pushed on the owner's "push and go other stuff with recommended", 2026-10-23 |

## Design and plan artifacts

- **Claude Design project "Rebuffer" (2026-10-21):** https://claude.ai/design/p/c7a57a4f-af89-43e4-a225-59c326219472.
  The app's tokens (both themes), fonts, compiled stylesheet and 14 parts with graded previews, synced by
  `/design-sync`; `.design-sync/NOTES.md` says how to re-sync. The brief for group B (2026-10-22):
  `.design-sync/briefs/m4.6-group-b.md`, pasted there by the owner. The agent's own M4.6 boards
  (https://claude.ai/artifact/VBhPRjdiXQoQDBzWtyc9vQ) are dropped.

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Polish proposal (2026-10-20, approved the same day, built 2026-10-21):** https://claude.ai/artifact/UYaEK9K9r65q42HTHYvj4K.
  The owner asked for a friendlier, more compact UI: the wordmark sized to the nav, fewer and better-matched blocks,
  clearer labels, smooth motion (disclosures, the paste panel, run progress, state changes, scrolling). Six boards:
  header before/after, Run, Report, Networks, Inspect, and an interactive motion board. What was built is M4.5 in
  `progress.md`.
- **Polish review (2026-10-21):** https://claude.ai/artifact/28kKPyVTMefi76jKa17E8n. Screenshots of the built polish
  in both themes (from the production build), the departures from the proposal, the measurements. Private.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Waiting for the owner (raised 2026-10-20 to 2026-10-22)

- **Settled 2026-10-23 (decision 30): group B's departures from the Claude Design screens stand** (review page):
  - "Within spread" applies to every comparison, not only the same setup: a first frame 0.04 s sooner isn't
    "better" when repeat runs differ by up to 0.27 s. Limits from `pnpm repeat` (2 points, 0.3 s, 0.1 s of stall,
    0.1 Mbps; `SPREAD` in `src/core/run/compare.ts`).
  - Verdict sentences are written by rules from the numbers and state facts, not causes; the design's were examples.
  - HDR10+ reads "HEVC · HDR (PQ)": Apple's playlist only says `VIDEO-RANGE=PQ`.
  - Inspect keeps its input card on top instead of a title with "Inspect another stream"; no floating peak tag on
    the segment chart (the takeaway names it); the ladder's button always says "Segments" (axe fails a visible
    "Showing" that isn't in the name); pictures are named as the app does (a 1920×800 film is 1080p).
  - Change one thing keeps settings changed by hand; its network list is the seven presets (drawn networks through
    the editor); run B's toast says "Compare reads it against A".
- **Settled 2026-10-23 (decision 29): Rural 3G keeps its 0.** Was:
  **Rural 3G still scores 0 under the new score (D1), 2026-10-22.** From a run's breakdown: it's scored against 360p
  (the best its 1.02 Mbps mean carries); the picture earns 68 points, the 11.7 s wait for the first frame costs 60
  (Yin et al. charge each second of startup as much as a segment), and hls.js starting at 720p and dropping to 240p
  costs 14. Recommended: keep the published formula; the Report's bars show the losses and the README explains it.
  Changing startup's weight would be a departure from the paper, the owner's call.

- **The light theme's look** is new and not on the design canvas: a light grey ground, white cards, the mint accent
  darkened to teal (`#0a7a5a`) so white text reads on buttons, qualities from light to dark green. The wordmark's
  arrow and tilde darken with it. Screenshots before the push.
- **The README's GIF: recorded again from the polished build and uploaded by the owner on 2026-10-21**
  (`readme/rebuffer.gif` in R2, served at https://media.azamatos.com/readme/rebuffer.gif, 6,353,125 bytes, checked):
  Home, then "Try the tunnel" with no stalls and 3 switches down, then the report's timeline.
  `scripts/readme/record-gif.mjs` records it again; the upload command is in the script. Cloudflare's cache rule doesn't cover `.gif` (`cf-cache-status: DYNAMIC`):
  fine for a README, which GitHub fetches through its own image proxy.
- **Real Safari check (M4's last item), about 10 minutes in Safari on the Mac, on the live site after the push:**
  1. "Try the tunnel": it plays, the charts move, the result's simulation check reads sensibly.
  2. Rural 3G with Fast start; Stop halfway (an abort mid-download), then Run again.
  3. Start a run and switch to another tab for 20 s (the worker idles; the report should note background time).
  4. Inspect our "with problems" sample (four findings); the theme switch; Compare two runs.
  5. The polish's menus: open the Report's "⋯" with the keyboard (Tab, Enter), then click Export JSON with the mouse
     (Safari doesn't focus a clicked button, which once closed the menu first; Playwright's WebKit showed it). Then
     Export HAR, and open the file in Safari's Web Inspector (Network, Import).
  6. Anything that looks wrong: a screenshot is enough.
- **Compare's colours:** A is a solid line in the text colour, B a dashed line in the accent (no new colour tokens;
  the network keeps its blue). The owner may prefer two new hues.
- **About states the score's limit** ("on a network slower than the top quality, even a run without a stall scores
  low"), which answers the slow-network observation below in words; decision 5 itself is unchanged.

- **Inspect, departures from the design canvas (Inspect board):**
  - "Run this stream" opens the Run screen with the stream (as "Use in a run" does), not Home's setup.
  - Measured peaks come from segment sizes (HEAD requests, or a download when a server won't answer one), so the
    first 3 segments of every playlist cost about 18 small requests, not 25 MB of video.
  - A finding broken the same way in several playlists is listed once, with every file; a 6.6 s segment in all five
    renditions is one error. The board shows only the 720p one.
  - The column the board calls "Resolution" is "Picture" (size and frame rate).
- **Deviations from the design canvas (Network board), for the owner's eye:**
  - The board says Tab moves between points; that would trap keyboard users in the editor (WCAG 2.1.2), so Tab
    leaves it as anywhere else and `[` `]` choose the point before or after (Home and End: first and last).
  - Recorded traces are train, car, bus and walking (the board shows train and car), 90 s each. Their latency is
    60 ms, our assumption: the recordings don't measure one; the screen says so.
  - The page has a visible "Networks" title above the list and the editor, like the Runs page.
  - "Use in a run" opens the Run screen ready to start (not started), with the default stream and player, or the
    run's own stream and player when the editor came from a report's "Change network".
- **On phones the network list comes before the editor** (11 cards to scroll past). Possible later: a compact
  list (a select, or collapsed groups) under 700 px. Not done; the design has the list first.
- **Score on slow networks:** answered by D1 (decision 19); Rural 3G's remaining 0 is above.
- **The report at the end of a run:** the spec said the Report opens by itself; it's built as a "See the report"
  button so the live result stays in view. The owner can ask for it to open by itself.
- **Idea, not started:** a setup's first run carries the real network's noise. A "warm-up" could download the ladder
  for the run's length first (about 140 MB for 1:30 of our film). Recommended: not now; the result says when the
  real network held a run back, and the next run comes from the saved copy.

## Owner's open items

- Cloudflare Web Analytics: the live pages load its beacon (`static.cloudflareinsights.com`, seen 2026-10-20), so it
  looks switched on; the owner can confirm in the dashboard. The CSP allows it.
- Deferred to the beta: which player failures hurt most in the owner's past work and which hls.js settings were
  tuned; own network recordings for presets.

## Open questions

- Shaped responses in real Safari (only Playwright's WebKit was tested).
- Whether to add Lumos5G (CC BY 4.0) traces next to the Irish 4G ones.
- Whether to publish the playlist parser or the network simulator as npm packages after launch.

## Lessons worth keeping

- **Check a design against the brief before building it** (2026-10-23): Claude Design's Compare kept the old page's
  structure and dropped the brief's metric cards; the agent built it as drawn, pushed it and called it done. The owner
  saw "nothing changed". Compare the screens with the brief's list first, say what's missing, and let the owner
  decide. Also: a verdict, colour or score the data can't back (a 6 s stretch) is worse than no verdict.
- **The owner wants Claude Design briefs as context only:** what the screen is for, what's wrong, the situations, the
  limits. Don't dictate layout; it has its own design skills (2026-10-23).
- **Claude Design's screens come out as source:** Share → Export → Project HTML → Project archive (instant, free)
  downloads a zip of every file, `templates/*/*.dc.html` included (2026-10-23; ask the owner before downloading).
  The `DesignSync` tool is for `/design-sync` only. Read the boards' notes first: they list the design's choices.
- **`pnpm e2e` empties `test-results/`,** scratch specs included. Keep throwaway Playwright scripts in
  `.claude/scratch-e2e/` (ESLint and Prettier ignore `.claude/`; it's in `.git/info/exclude`, so local only), with
  their own config pointing at a `vite preview --port 4022` of the build.
- **CI can hang installing browsers** (`playwright install --with-deps`, 32 minutes on 2026-10-23, against 7 for a
  whole run): `gh run cancel <id>`, then `gh run rerun <id>`; the re-run took 7 minutes.
- **A run id like `91827e74` reads as a number** (91827×10⁷⁴), so the router quotes it in links; match ids in tests
  with optional `%22` around them.
- **Firefox logs "Failed to load ''. A ServiceWorker intercepted the request and encountered an unexpected error"
  once for each download the page cancels while the worker streams its body** (found 2026-10-22, matched to the
  run's log to the hundredth of a second): hls.js giving up a slow segment, or its downloads cut at a run's end.
  Erroring or quietly closing the body made no difference, and resolving instead of rejecting only matters before
  the first byte. It's the player's own cancellation, not a fault; left as it is. Playwright's Firefox shows these
  messages in `page.on("console")`. Reproduce with our film and a short Playwright script against `pnpm preview`;
  the small local stream rarely cancels mid-body.
- **The repeatability job can see late downloads from localhost** when the Mac is busy (one Rural 3G run, 4 of 68,
  2026-10-22); the run's own check flags them. Re-run that network alone before reading anything into it.
- **`lsof -ti :4012,:4013` fails on macOS** ("unknown service"); use `lsof -ti tcp:4012`. And zsh expands a word
  that starts with `=` (`echo =====X` fails): quote separators.

- **Tailwind's `flex-1` is `flex: 1 1 0%`,** and a percentage basis in a column of indefinite height counts the
  content: the Run screen's event log grew with its lines. Use `flex-[1_1_0px]` to fill a column without growing it.
- **WebKit moves focus to the nearest focusable ancestor** (`<main tabindex="-1">`) when a button that doesn't take
  focus on click is pressed; Safari and Firefox on macOS don't focus clicked buttons at all. A popover that closes on
  blur must ignore blurs during a press inside it (`Popover.tsx`). Chromium tests alone don't show it.
- **axe measures what's painted:** a check during a fade (a table appearing, a theme switch) fails on contrast. Wait
  with `settle()`, and after `emulateMedia` wait for `data-theme` first (`switchTheme()`).
- **Smooth scrolling moves boxes after a jump:** a test that measures a box for the mouse waits for it to stop
  (`steady()`).
- **CSS bytes:** each one-off Tailwind class costs (a tint brings a fallback and a `color-mix` rule), and Tailwind
  makes a class of any word in the files it scans: a comment or a `style.transform` produced `.transform`. Reuse
  classes. It scanned the Markdown docs too. The sixth session's memory bank named enough classes to push the CSS
  from 7.97 to 8.21 KB, and CI failed on the push of 2026-10-21. `src/styles.css` now scans `src/` only.
  **Run `pnpm size` after the last commit, docs included.**
- **Vite's dev server serves stale dependencies** ("504 Outdated Optimize Dep") after a module first imports a new
  entry of a dependency (`react-dom`'s `flushSync`): restart it.
- **zsh doesn't split `$var` into words:** pass file lists through `xargs`.

- **`ch` is the width of "0" in whichever font is showing:** a box sized in `ch` changes width when a web font swaps
  in, and its text re-wraps. Size text boxes in `em`.
- **A router-wide `defaultPendingComponent` breaks hydration** of Home's build-time markup (the root route gets a
  Suspense boundary in the browser only). Set pending components per lazy route.
- **TanStack Router calls `replaceState` once as the app starts** (its history state, no URL change). A test that
  navigates or reloads in that instant is aborted in Firefox and WebKit: wait for the app first (`openApp`, or a
  heading).
- **Docker Desktop doesn't show the repo at its Mac path inside a container** (`-v $PWD:$PWD` came up empty): mount
  it at `/repo` and link `node_modules` inside the container.
- **Lighthouse on GitHub's runners loses its points to layout shift, not paint time:** Linux's fallback fonts are far
  from Geist, so a swapped-in web font moves the text (CLS 0.33 on CI, 0.024 on the Mac). Reproduce in Docker with
  `mcr.microsoft.com/playwright:v1.64.1-noble` and `@lhci/cli` (`CHROME_PATH` = its Chromium). Fixed with sized
  fallback faces (`scripts/fonts/fallbacks.mjs`) and preloads.
- **Lighthouse CI with `staticDistDir` opens `/index.html` unless `url` says otherwise,** and our router shows the
  not-found screen there: CI scored the wrong page until 2026-10-20 (`lighthouserc.json` now lists `/`).
- **Lighthouse simulates from what it observed:** scripts that ran before the observed first paint count toward FCP,
  even with the page's HTML already there. Locally they arrive at once, so the app now starts after the first frame.
- **TanStack Router renders a Suspense boundary in the browser but not on the server** (without its own SSR set-up):
  plain `renderToString` + `hydrateRoot` mismatches (React error #418). The build adds the boundary's markers.
- **Replacing server-rendered markup with `createRoot` counts as a new largest paint;** hydrating keeps the nodes.
- **Playwright's browsers report a light system theme by default** (`colorScheme: "light"`); pass `dark` to test the
  dark theme.
- **Zod 4 probes for `new Function`;** under a CSP without `'unsafe-eval'` Firefox logs it as an error. `jitless`.
- **`pnpm build` empties `dist/`:** don't build while something serves it (the repeatability job's preview).
- **GitHub's Linux runners are slower than the owner's Mac**, and Linux WebKit picks lower qualities. Tests must not
  depend on speed: the 20 s synthetic stream fits whole in the buffer at a low quality, so the forced-stall test caps
  the buffer with `set=maxBufferLength:4,maxMaxBufferLength:4`. The CI report artifact (`playwright-report`) has
  page snapshots of failures (`gh run download <id> -n playwright-report`).
- **Live runs against media.azamatos.com are noisy run to run** (one waited 21 s for a playlist on 2026-10-20); the
  saved copy makes repeats match, and the honesty paragraph says when the real network interfered.
- **A local `vite preview` left on port 4012 makes Playwright reuse a stale build.** Stop it before `pnpm e2e`.
- **WebKit doesn't scroll to an element it focuses from script** (found 2026-10-20 with "Show on the chart"): call
  `scrollIntoView` after `focus({ preventScroll: true })`, and check `toBeInViewport()` in tests.
- **An `sr-only` span adds a space to the accessible name** ("31 Report : Custom network…"), so Playwright name
  patterns use `\b.*` rather than a literal colon.
- **The Irish 4G recordings skip a sample about every 10 s.** Choose excerpts by elapsed time (as the converter
  reads them), not by row number: the first pick, by rows, put a train excerpt on 65 s of nothing.
- **idb-keyval creates a store only along with its database:** each kind of record gets its own database
  (`rebuffer` for runs, `rebuffer-networks` for networks).
- **The router quotes a search value that reads as a number** (`?run=%2231994322%22`). It still works; new ids start
  with a letter (`newNetworkId`), and tests accept the quotes for run ids.
- **ffmpeg's master playlist leaves separate audio out of BANDWIDTH** (and AVERAGE-BANDWIDTH): measure the variant
  with its audio, as `polishMaster` now does. Found by our own inspector on our "clean" sample.
- **Cloudflare keeps a cached copy per `Origin` for R2 files (`Vary: Origin`):** the dashboard's purge by URL
  doesn't clear what browsers get. Purge everything, or purge through the API with the `Origin` header, or wait out
  the cache time.
- **macOS has no `timeout` command,** and `cat > file` with no input waits forever in the agent's shell.
- **Keyboard tests only Tab forward:** in Firefox, a control earlier in the page than the focus can be 40+ Tabs
  away. Order a test's steps as a person would fill the page, top to bottom, or load the page afresh.
- **The code review (`/code-review high <range>`) earned its keep:** 10 findings on the third session, 8 real. Its
  findings aren't verified, so check each against the code before fixing.

## Local state on the owner's Mac (git-ignored, not needed to continue)

- `media/source/`: the 584 MB source film and the English subtitles.
- `media/out/tears-of-steel/`: the full encodes (clean 912 MB, problems 1.0 GB), already uploaded to R2.
- `media/test-out/`, `media/e2e/`: test encodes and the synthetic e2e stream (rebuilt automatically by Playwright).
