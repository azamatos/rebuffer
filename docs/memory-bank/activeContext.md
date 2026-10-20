# Active context

**Updated 2026-10-20 (end of the fourth session: M3 done. Review fixes, zoom and the Networks screen are live; the
Inspect screen is built, not pushed yet).** Read this first, then `progress.md`.

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live charts and a log show what it does, and a report scores and explains
  the run. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **Live site = `main` at `55356a3`** (pushed 2026-10-20 after the owner's "lets go"; CI green; the deployed site
  has the Networks screen). **Not pushed yet:** the Inspect screen (`5f9ebab`, `e647d85`), the clean film's
  BANDWIDTH fix (`26686a8`) and this hand-off. **Every push to `main` deploys on its own** (Cloudflare builds it in
  about a minute). Pushing is outward-facing: ask the owner before each push.
- **What works today:**
  - **Home:** hero ("Try the tunnel" starts it), a setup (our two films, three public test streams or your own HLS
    link; seven network presets with a thumbnail each; four player presets; Run), recent runs, how it works.
  - **Run screen:** setup from the URL, a check of the real latency before the run, video, live tiles, three live
    charts (bandwidth and quality, buffer, segment downloads; own canvas code), an event log, and at the end the
    score, an honesty paragraph and "See the report". Repeat runs take downloads from a copy saved in the browser
    (300 MB), so they match.
  - **Report (`/runs/<id>`):** score with its breakdown, seven tiles, the charts from the saved log with numbered
    markers, "What happened" notes, "Try next" ideas (each the setup with one change), setup, simulation check, how
    the score is computed; Run again, Change network, Export JSON, Copy link, Delete. **Zoom**:
    buttons above the charts (in, out, earlier, later, whole run), a drag across a chart, "Show on the chart" on each
    note; the axis, markers, sentences and tables follow the view.
  - **Runs (`/runs`):** the runs saved in this browser (the newest 50).
  - **Networks (`/networks`):** the seven presets, four recorded 4G traces (Irish 4G dataset, CC BY 4.0, credited)
    and your own; a curve editor that works with the keyboard alone, with our film's qualities drawn over it; point
    and whole-network fields; undo; import JSON or CSV, export both; save in this browser; "Use in a run" (run links
    carry a drawn network's `name=`).
  - **Inspect (`/inspect?url=`, built 2026-10-20, not pushed yet):** a link, pasted text or a file; summary with
    finding counts and Run this stream; the ladder with declared, average and measured peak (first 3 segments,
    sizes by HEAD, separate audio added segment by segment), codecs in words and what this browser plays; findings
    grouped across playlists with file, line and spec; segments of any playlist as a chart, a sentence and a table.
    On our "with problems" sample it shows all four planted mistakes.
  - Placeholder: About.
- **Quality bar today:** 474 unit tests; 94 Playwright checks in Chromium, Firefox and WebKit (axe on every screen;
  2 keyboard checks skipped in WebKit, which only tabs to text fields); Home's JavaScript 93.4 KB of a 100 KB brotli
  budget, counting every script `index.html` loads (91.0 before the Networks screen: the bundler now splits React
  and the router into a third file, which compresses worse; the raw size grew about 1 KB).
- **Schedule:** M0, M1, M2 and M3 are done (targets were Oct 25, Nov 1, Nov 8 and Nov 15; M3 finished 2026-10-20).
  M4 (polish, MVP complete, Nov 22) is next; launch Dec 6.

## Next step (in this order)

1. **Ask the owner to push** the Inspect screen and the BANDWIDTH fix, and to **upload the clean film's new
   `master.m3u8`** (see "Waiting for the owner"); then check `/inspect` on both samples live.
2. **M4:** About (how it works, limits, credits for the film and the traces), first-run hints, the accessibility
   pass (a live region for switches and stalls on the Run screen), pre-rendered Home (Lighthouse), the determinism
   job, a real Safari check, README.

The owner collects fixes and reviews them when everything is ready (said 2026-10-20): keep building, list anything
that needs their eye under "Waiting for the owner".

## Working with the owner (how this went on 2026-10-19 and 2026-10-20)

- Give a recommendation with each choice; the owner answers "go with recommendations" or picks, after seeing results
  (live numbers, screenshots).
- They check the live site after a deploy. Ask before every push; they answered "lets push" / "lets go" each time.
- Things the agent's permission checker blocks: deploying by hand with wrangler and writing to the R2 bucket (the
  owner ran `node scripts/media/upload.mjs --playlists` themselves). Reading wrangler's login token is blocked too.

## Decisions (settled 2026-10-18 to 2026-10-20)

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
| 10 | Scope by Dec 6 | Compare two runs and the case study; Shaka Player after launch |
| 11 | Repo | github.com/azamatos/rebuffer, public (owner created it 2026-10-19), pushed over SSH |
| 12 | Deploys | Cloudflare builds every push to `main` (working as of 2026-10-20; by hand before) |
| 13 | Repeat runs | The browser keeps what runs download (300 MB) so repeats match; approved 2026-10-20 ("go with recommendations") |
| 14 | Playlist cache time | A day instead of 5 minutes; approved 2026-10-20; the owner re-uploaded the 14 playlists the same day |
| 15 | Charts | Own canvas code instead of uPlot: the agent's call on 2026-10-20 (reasons in `techContext.md`, Stack), shown to the owner with the results |

## Design and plan artifacts

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Waiting for the owner (raised 2026-10-20)

- **Push:** the Inspect screen (core and screen), the clean film's BANDWIDTH fix and this hand-off. All checks pass
  locally (474 unit tests, 94 Playwright checks).
- **Upload the clean film's master playlist (blocked for the agent: R2 writes):** the inspector found that our clean
  `master.m3u8` declares each variant's video alone (ffmpeg leaves out the separate audio; RFC 8216 §4.3.4.2 counts
  it): 240p declares 469 kbps and peaks at 600 kbps with its audio. The local copy is fixed
  (`node scripts/media/encode.mjs --only polish`, already run). The owner runs
  `node scripts/media/upload.mjs --playlists`. Cloudflare caches playlists for a day (decision 14), so purge
  `https://media.azamatos.com/tears-of-steel/clean/master.m3u8` in the dashboard, or wait a day; browsers that saved
  the old one for repeat runs keep it until "Forget saved downloads". Until then the live inspector shows a warning
  on our clean sample, which is true.
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
- **Score on slow networks (observation; decision 5 stays until the owner reopens it).** Rural 3G played with no
  stalls and scored 0–1/100, Tunnel 25–35: the score compares with the ladder's top quality, not with what the
  network allows. Possible later: show "best possible on this network" next to the score.
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

## Lessons from this session worth keeping

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
- **macOS has no `timeout` command,** and `cat > file` with no input waits forever in the agent's shell.
- **Keyboard tests only Tab forward:** in Firefox, a control earlier in the page than the focus can be 40+ Tabs
  away. Order a test's steps as a person would fill the page, top to bottom, or load the page afresh.
- **The code review (`/code-review high <range>`) earned its keep:** 10 findings on the third session, 8 real. Its
  findings aren't verified, so check each against the code before fixing.

## Local state on the owner's Mac (git-ignored, not needed to continue)

- `media/source/`: the 584 MB source film and the English subtitles.
- `media/out/tears-of-steel/`: the full encodes (clean 912 MB, problems 1.0 GB), already uploaded to R2.
- `media/test-out/`, `media/e2e/`: test encodes and the synthetic e2e stream (rebuilt automatically by Playwright).
