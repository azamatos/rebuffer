# Active context

**Updated 2026-10-20 (end of the fifth session: M4 and Compare built, not pushed).** Read this first, then
`progress.md`.

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live charts and a log show what it does, and a report scores and explains
  the run. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **Live site = `main` at `dc3fd6f`.** This session's commits (from `718b568` on: two docs commits from the fourth
  session, then the light theme, About, the live region, the first-run hint, build-time Home, the repeatability job,
  Compare, README and docs) are **local, not pushed**. **Every push to `main` deploys on its own** (Cloudflare builds
  it in about a minute). Pushing is outward-facing: ask the owner before each push.
- **What works today (locally; live is the fourth session's state):**
  - **Home:** rendered at build time, so it paints before the JavaScript runs; hero ("Try the tunnel" starts it), a
    setup (our two films, three public test streams or your own HLS link; seven network presets with a thumbnail
    each; four player presets; Run), recent runs, how it works.
  - **Run screen:** setup from the URL, a check of the real latency before the run, video, live tiles, three live
    charts, an event log, a polite live log that reads out switches and stalls, a first-run hint ("What to watch",
    until "Got it"), and at the end the score, an honesty paragraph and "See the report".
  - **Report (`/runs/<id>`):** score with its breakdown, seven tiles, zoomable charts with numbered markers, "What
    happened", "Try next", setup, simulation check, how the score is computed; Run again, Change network, Compare
    with…, Export JSON, Copy link, Delete.
  - **Runs (`/runs`)** and **Compare (`/runs/compare`, built 2026-10-20):** two saved runs side by side: what changed,
    every number with B against A in words and a verdict, the charts overlaid (A solid, B dashed).
  - **Networks (`/networks`)** and **Inspect (`/inspect`)** as in the fourth session.
  - **About (`/about`, built 2026-10-20):** how a run works, where the simulation stops, how repeatable it is, the
    numbers and the score, privacy, credits (film, 4G dataset, test streams, libraries with licences).
  - **Light theme (built 2026-10-20, the owner asked for it):** System (default), Light or Dark from three radios in
    the header; no flash (a hashed inline script); charts redraw on a change; axe passes on every screen in both.
- **Quality bar today:** 484 unit tests; 138 Playwright checks in Chromium, Firefox and WebKit (axe on every screen, in
  both themes; 3 keyboard checks skipped in WebKit, which only tabs to text fields); Home's JavaScript 95.1 KB of a 100 KB brotli budget (now counting the app chunk the entry
  loads after the first paint); Lighthouse on Home locally 0.98–0.99 performance, 1.0 in the rest (CI now fails
  under 0.95, and opens `/`: it used to open `/index.html`, the not-found screen).
- **Repeatability (`pnpm repeat`, measured 2026-10-20):** Each preset 5× in Chromium on a 2:00 synthetic stream from a local server: scores within 1 point per network, the same stalls and switches, first frames within 0.12 s (the first run in a fresh browser is about 0.2 s slower), no late downloads. The README and About quote the table.
- **Schedule:** M0–M4 done (M4's target was Nov 22; done 2026-10-20 except the real Safari check, which needs the
  owner). M5: Compare is built; the case study, pinning and the LinkedIn post remain (launch Dec 6).

## Next step (in this order)

1. **Show the owner, then push** (ask first): the light theme, About, Compare, build-time Home. After the push, check
   CI (Lighthouse now fails under 95 on GitHub's runners: watch the first run) and the live site.
2. **Check `/inspect` on our clean sample live:** from the evening of 2026-10-21 it should show no bandwidth warning.
3. **Real Safari check** (owner, about 10 minutes; checklist under "Waiting for the owner").
4. **M5:** the case study on azamatos.com (the owner's portfolio repo; ask first), pin the repo, LinkedIn post with
   the GIF.

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
| 16 | Themes | A light theme next to the dark one, with a System / Light / Dark switch; System is the default. The owner asked for it on 2026-10-20 ("not everyone will like" dark only); the light palette is the agent's, for the owner's eye |
| 17 | First paint | Home rendered at build time and hydrated, the app's code after the first paint: the agent's call on 2026-10-20 (`techContext.md`, "Themes and the first paint") |

## Design and plan artifacts

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Waiting for the owner (raised 2026-10-20)

- **Push this session's work** (ask; nothing from it is live).
- **The light theme's look** is new and not on the design canvas: a light grey ground, white cards, the mint accent
  darkened to teal (`#0a7a5a`) so white text reads on buttons, qualities from light to dark green. The wordmark's
  arrow and tilde darken with it. Screenshots before the push.
- **The README's GIF: uploaded by the owner on 2026-10-20** (`readme/rebuffer.gif` in R2, served at
  https://media.azamatos.com/readme/rebuffer.gif, 5.6 MB, checked). `scripts/readme/record-gif.mjs` records it again;
  the upload command is in the script. Cloudflare's cache rule doesn't cover `.gif` (`cf-cache-status: DYNAMIC`):
  fine for a README, which GitHub fetches through its own image proxy.
- **Real Safari check (M4's last item), about 10 minutes in Safari on the Mac, on the live site after the push:**
  1. "Try the tunnel": it plays, the charts move, the result's simulation check reads sensibly.
  2. Rural 3G with Fast start; Stop halfway (an abort mid-download), then Run again.
  3. Start a run and switch to another tab for 20 s (the worker idles; the report should note background time).
  4. Inspect our "with problems" sample (four findings); the theme switch; Compare two runs.
  5. Anything that looks wrong: a screenshot is enough.
- **Compare's colours:** A is a solid line in the text colour, B a dashed line in the accent (no new colour tokens;
  the network keeps its blue). The owner may prefer two new hues.
- **About states the score's limit** ("on a network slower than the top quality, even a run without a stall scores
  low"), which answers the slow-network observation below in words; decision 5 itself is unchanged.

- **Clean film's master playlist: uploaded by the owner on 2026-10-20** (`upload.mjs --only clean --playlists`;
  R2 serves BANDWIDTH 6,123,200 for 1080p). The dashboard's URL purge cleared only the cached copy without an
  `Origin`; browsers still got the old one (`Vary: Origin`), cached until about a day after it was first fetched,
  so from the evening of 2026-10-21 the live inspector should show no bandwidth warning on our clean sample. Check
  that first in the next session. The rest of this item is how it was found: the inspector found that our clean
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

## Lessons worth keeping

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
