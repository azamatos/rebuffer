# Active context

**Updated 2026-10-21 (seventh session).** The polish (M4.5) is live: the owner pushed it, and it was checked in
three browsers and both themes. CI failed on the CSS budget. The fix is committed, and the owner pushes it. The
clean sample is fixed live. The README's GIF of the new screens is recorded and waits for the owner's upload. Read
this first, then `progress.md` (M4.5 records what was built).

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live charts and a log show what it does, and a report scores and explains
  the run. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **Live site = `main` at `1c687b3`.** The owner pushed it on 2026-10-21 with `! git push origin main`, after the
  agent's permission checker refused the agent's push following "go on". Cloudflare deployed it within a minute.
  Checked live the same day in Chromium, Firefox and WebKit: every screen in both themes, axe clean everywhere, two
  real runs each, the report and its menu, and Compare. **CI red on `1c687b3`:** e2e passed (135, 3 flaky, 3
  skipped), but Home's CSS measured 8.21 KB against 8, because Tailwind also scanned the Markdown docs. **Every push
  to `main` deploys on its own.** Pushing is outward-facing: ask the owner before each push.
- **Local `main` is 1 commit ahead:** the CSS fix (Tailwind scans `src/` only, 7.90 KB) and this memory bank. The
  owner pushes it (`! git push origin main`). Then check that CI is green, including Lighthouse on GitHub's runner,
  which didn't run on `1c687b3` because the budget step failed first.
- **What works today (live since 2026-10-21):**
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
    network, Compare with…, Copy link, and a "More actions" menu (Export JSON, Delete); toasts confirm.
  - **Runs (`/runs`)** and **Compare (`/runs/compare`, built 2026-10-20):** two saved runs side by side: what changed,
    every number with B against A in words and a verdict, the charts overlaid (A solid, B dashed).
  - **Networks (`/networks`):** a sidebar of compact rows; the editor with Save and Run with this network in its
    header, a `?` list of the keys, one panel for the point and the whole network, Import / Export in one menu.
  - **Inspect (`/inspect`):** Link | Paste text | File as tabs, chips for samples, counts and playlists (each with its
    worst finding).
  - **About (`/about`, built 2026-10-20):** how a run works, where the simulation stops, how repeatable it is, the
    numbers and the score, privacy, credits (film, 4G dataset, test streams, libraries with licences).
  - **Light theme (built 2026-10-20, the owner asked for it):** System (default), Light or Dark from three radios in
    the header; no flash (a hashed inline script); charts redraw on a change; axe passes on every screen in both.
- **Quality bar today (2026-10-21):** 489 unit tests; 141 Playwright checks in Chromium, Firefox and WebKit, 138 pass
  and 3 keyboard checks are skipped in WebKit (which only tabs to text fields); axe on every screen in both themes;
  the run-based specs repeated 2–3 times in each browser. Home's JavaScript 96.3 of 100 KB and its CSS 7.90 of 8 KB
  (brotli; about 100 bytes of room). Lighthouse on Home 0.98–0.99 performance on the Mac and 0.99–1.0 in the
  Linux container, 1.0 in the rest, CLS 0 (CI fails under 0.95 and opens `/`). With the fonts held back 1.5 s, layout
  shift stays under 0.03 on every screen (Home 0.0000 desktop, 0.0039 phone).
- **Repeatability (`pnpm repeat`, measured 2026-10-20):** Each preset 5× in Chromium on a 2:00 synthetic stream from a local server: scores within 1 point per network, the same stalls and switches, first frames within 0.12 s (the first run in a fresh browser is about 0.2 s slower), no late downloads. The README and About quote the table.
- **Schedule:** M0–M4 done (M4's target was Nov 22; done 2026-10-20 except the real Safari check, which needs the
  owner). M5: Compare is built; the case study, pinning and the LinkedIn post remain (launch Dec 6).

## Next step (in this order)

1. **Push the CSS fix** (the owner: `! git push origin main`), then check that CI is green, Lighthouse included.
2. **Upload the README's new GIF.** The live site has the polish now. It was recorded on 2026-10-21 from the
   polished build (`media/readme/rebuffer.gif`, 6.4 MB, 26 s). The owner runs the upload command in
   `scripts/readme/record-gif.mjs`.
3. **The owner's review of the polish** (https://claude.ai/artifact/28kKPyVTMefi76jKa17E8n). They pushed it without
   comments; the departures from the boards are listed under "Waiting for the owner". Change what they ask for.
4. **Real Safari check** (owner, about 10 minutes; checklist under "Waiting for the owner").
5. **Firefox's console during a run:**
   - The CSP blocks hls.js's placeholder subtitle track, `data:,WEBVTT`. hls.js adds it so that Safari keeps the
     cues. Recommended: add `data:` to `media-src` in `public/_headers` (and `tests/unit/csp.test.ts`). It needs the
     owner's yes, because it's a security header.
   - The worker logs "Failed to load ''. A ServiceWorker intercepted the request and encountered an unexpected error"
     once per run. It's probably a download aborted as the run ends; find out before changing anything.
   Both came before the polish. The beacon errors and WebKit's "Refused to apply a stylesheet" seen in the same
   check came from the test set-up: the sandbox can't reach `static.cloudflareinsights.com`, and Playwright's
   screenshot style breaks our `style-src`.
6. **M5:** the case study on azamatos.com (the owner's portfolio repo; ask first), pin the repo, LinkedIn post with
   the GIF.

The owner collects fixes and reviews them when everything is ready (said 2026-10-20): keep building, list anything
that needs their eye under "Waiting for the owner".

## Working with the owner (how this went on 2026-10-19 to 2026-10-21)

- Give a recommendation with each choice; the owner answers "go with recommendations" or picks, after seeing results
  (live numbers, screenshots).
- They check the live site after a deploy. Ask before every push; they answered "lets push" / "lets go" each time.
- Things the agent's permission checker blocks: deploying by hand with wrangler and writing to the R2 bucket (the
  owner ran `node scripts/media/upload.mjs --playlists` themselves). Reading wrangler's login token is blocked too.
  On 2026-10-21 it also blocked `git push origin main` (a production deploy) after the owner's "go on". The
  owner's "lets push" got through on 2026-10-20. If a push is refused, give the owner `! git push origin main`.

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
| 18 | UI polish | The proposal (header, Run, Report, Networks, Inspect, motion) approved as drawn on 2026-10-20, with the eighth Report tile (the real network's speed) and the simulation check as a banner; built 2026-10-21, waiting for the owner's review |
| 17 | First paint | Home rendered at build time and hydrated, the app's code after the first paint: the agent's call on 2026-10-20 (`techContext.md`, "Themes and the first paint") |

## Design and plan artifacts

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

## Waiting for the owner (raised 2026-10-20 and 2026-10-21)

- **The polish (2026-10-21): review it, then say when to push.** The review page lists where the build departs from
  the boards: the score's bars are green (quality) and red (stalls) with grey for switches and startup, out of 100
  points (the board drew pink and orange, which mean other things here, and doubled the bars); the state chip says
  "Running" or "Finished" without the time or score; after a run the result card makes the left column longer than
  the charts (the log keeps 96 px and scrolls); the Networks panel keeps the Name field, so its buttons sit on a second
  row, and a saved network gets "Delete network" there; zoom's Earlier and Later are ‹ ›; the third-party samples keep
  their "no guarantees" label; a few sizes moved 1–2 px onto the spacing scale (theme buttons 32 px, undo and redo 36,
  every transition 200 ms) to stay inside the CSS budget. **The CSS budget has about 100 bytes left** (7,902 of 8,000
  since 2026-10-21's fix): a larger visual change needs trimming or a bigger budget, the owner's call.

- **The light theme's look** is new and not on the design canvas: a light grey ground, white cards, the mint accent
  darkened to teal (`#0a7a5a`) so white text reads on buttons, qualities from light to dark green. The wordmark's
  arrow and tilde darken with it. Screenshots before the push.
- **The README's GIF: uploaded by the owner on 2026-10-20** (`readme/rebuffer.gif` in R2, served at
  https://media.azamatos.com/readme/rebuffer.gif, 5.6 MB, checked). It shows the screens before the polish. A new one
  was recorded on 2026-10-21 (6.4 MB): Home, then "Try the tunnel" with no stalls and 3 switches down, then the
  report's timeline. It waits in `media/readme/rebuffer.gif` for the upload after the push. The upload command is in
  `scripts/readme/record-gif.mjs`. Cloudflare's cache rule doesn't cover `.gif` (`cf-cache-status: DYNAMIC`):
  fine for a README, which GitHub fetches through its own image proxy.
- **Real Safari check (M4's last item), about 10 minutes in Safari on the Mac, on the live site after the push:**
  1. "Try the tunnel": it plays, the charts move, the result's simulation check reads sensibly.
  2. Rural 3G with Fast start; Stop halfway (an abort mid-download), then Run again.
  3. Start a run and switch to another tab for 20 s (the worker idles; the report should note background time).
  4. Inspect our "with problems" sample (four findings); the theme switch; Compare two runs.
  5. The polish's menus: open the Report's "⋯" with the keyboard (Tab, Enter), then click Export JSON with the mouse
     (Safari doesn't focus a clicked button, which once closed the menu first; Playwright's WebKit showed it).
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
