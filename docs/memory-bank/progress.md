# Roadmap

Target: **MVP live by 2026-11-22; compare runs, case study and launch by 2026-12-06** (the owner's portfolio
schedule). The owner works on it about 3 hours a week and pauses during busy weeks, so agents do most of the
building and every milestone is shippable on its own.

## Status

| Milestone | Target | Status |
|---|---|---|
| Plan for a Smart TV app | — | done 2026-10-17, dropped 2026-10-18 |
| Plan for the HLS network lab, design proposal | — | done 2026-10-18 |
| M0 Decisions and setup | Oct 25 | done 2026-10-19; push-triggered deploys work since 2026-10-20 |
| M1 Core modules | Nov 1 | done 2026-10-18 (the Irish 4G trace converter moved to M3, done 2026-10-20) |
| M2 Live run | Nov 8 | done 2026-10-20: honest lateness, live charts, saved downloads, Home setup |
| M3 Report, network editor, inspector | Nov 15 | done 2026-10-20, live |
| M4 Polish; MVP live | Nov 22 | done and live 2026-10-20, except the real Safari check (needs the owner) |
| M4.5 UI polish | before Dec 6 | **live 2026-10-21** (`1c687b3`): every item below, with its tests; the owner pushed it |
| M4.6 Fixes from the owner's test | 2026-10-25 | **built**: group A, the score (D1), SEO, HAR import and export and the tables re-measured are live (pushed 2026-10-23, CI green); group B (Compare reworked, Change one thing, Inspect for big streams) built from the owner's Claude Design screens and live 2026-10-23, CI green |
| M5 Compare and launch | 2026-10-25 | Compare built 2026-10-20; the case study dropped 2026-10-22; pinning and the LinkedIn post after the owner's test |

## M0: decisions and setup — done

- [x] Decisions settled; design canvas accepted (2026-10-18)
- [x] `git init`; Vite 8 + React 19 + TypeScript 6 + Tailwind 4, TanStack Router, ESLint (strict, type-checked),
      Prettier, Vitest, Playwright + axe in 3 engines, size-limit, Lighthouse CI, GitHub Actions (2026-10-18)
- [x] App shell: family wordmark, navigation, skip link, routes for every screen, not-found page (2026-10-18)
- [x] Media script and full encode of *Tears of Steel*: clean 912 MB (184 × 4 s segments per rung), version with
      problems 1.0 GB; our parser finds the planted mistakes exactly (2026-10-18)
- [x] GitHub repo github.com/azamatos/rebuffer, public, description and topics set (2026-10-19)
- [x] Cloudflare Pages project `rebuffer` at https://rebuffer.azamatos.com; `*.pages.dev` sends `noindex`
      (2026-10-19)
- [x] R2 bucket `azamatos-media` at https://media.azamatos.com: CORS open to any origin (GET, HEAD), cache rule
      "media: cache segments and playlists", r2.dev off; all 1,740 files uploaded and verified (2026-10-19)
- [x] Push-triggered deploys: every push to `main` deploys (checked 2026-10-20)
- [x] Logo cursor keeps blinking, as on pass.azamatos.com (owner's request, 2026-10-20)
- [x] Folder renamed to `~/www/me/rebuffer` (by 2026-10-19)
- [ ] shadcn/ui, when the first component needs it

## M1: core modules — done

- [x] Playlist parser, codec names, lint rules with spec references; 193 tests (2026-10-18)
- [x] Network simulator: curve model, link scheduler, presets, page↔worker protocol, client; compact curve URL
      format (2026-10-18)
- [x] Service Worker shaper, proven in Chromium, Firefox and WebKit: 3–24 ms behind the curve, never ahead; shapes
      every origin except the app's own (2026-10-18)
- [x] Run event log; metrics, score and the honesty count (2026-10-18)
- [x] hls.js adapter and player presets; levels named by width class (1280×534 → 720p) (2026-10-19)

## M2: live run (target Nov 8) — done

- [x] Run controller; setup in the URL (stream, network preset or compact curve, player preset) (2026-10-18)
- [x] Run screen, first version: setup, progress, video, live tiles, event log, score, honesty line (2026-10-18)
- [x] End-to-end Playwright run on a synthetic ffmpeg ladder in all three engines (2026-10-18)
- [x] Our film is the default sample; a live run on rebuffer.azamatos.com plays it from media.azamatos.com (2026-10-19)
- [x] **Honest lateness** (2026-10-19, deployed 2026-10-20): a check before the run measures the real latency and
      opens the connection; the result tells late starts (the real network answered slower than the simulated RTT)
      from late bytes (it paused or couldn't keep up), quotes the real speed and the measured latency, and reports
      background-tab time. Live numbers are in `techContext.md`, "Honesty checks"
- [x] **Run screen charts** (2026-10-20, live): bandwidth and quality, buffer, downloads on one time
      axis, per the design canvas; our own canvas code instead of uPlot (`techContext.md`, Stack); a sentence and a
      data table per chart; 0.1 ms per frame (p50), 1.8 ms at most, at 4× CPU throttling
- [x] **Saved downloads for repeat runs** (2026-10-20, live; the owner approved it after the charts): the
      worker keeps what runs download in Cache Storage (300 MB, oldest out) and answers repeat runs from it, still
      shaped; the result says how many came from it and can forget it
- [x] **Home setup** (2026-10-20): stream (our two films, public test streams, your own link), network presets with
      a thumbnail each, player presets as chips, Run; "Try the tunnel" and Run open `/run` and start it
- [x] Keyboard-only Playwright test: Home → setup → Run → the run starts → Stop (2026-10-20). "Try the tunnel" is
      checked by its link, so CI doesn't depend on media.azamatos.com

## M3: report, network editor, inspector (target Nov 15)

- [x] **Report, first slice** (2026-10-20): score with breakdown, tiles, the three charts from the saved log, setup,
      simulation check, score explanation; Run again, Export JSON, Copy link, Delete; saved runs in IndexedDB (50);
      Runs list; Home's recent runs
- [x] Stalls that start during hls.js's own gap-jumping seeks are counted (2026-10-20; a run had shown an empty
      buffer for 1.5 s and no stall)
- [x] Report: "what happened" notes with numbered markers on the bandwidth chart (2026-10-20)
- [x] Report: "try next" ideas, each the setup with one change; player settings in run links (`set=`) (2026-10-20)
- [x] Review of the third session's work (`/code-review high`): 10 findings, 8 fixed (2026-10-20); the logo's
      blinking left for the owner, one cleanup skipped
- [x] Report: zoom on the charts, by keyboard and by mouse; notes show their stretch (2026-10-20)
- [x] Irish 4G trace converter (CC BY 4.0) and four recorded-trace networks with their credit (2026-10-20)
- [x] Network editor: presets, recorded traces, your own (IndexedDB), a curve editor by keyboard or pointer, point
      and whole-network fields, undo, import and export JSON and CSV, Use in a run (2026-10-20)
- [x] Report: Change network, keeping the run's stream and player (2026-10-20)
- [x] Inspector screen on top of `src/core/hls`: ladder, tracks, segments, measured bitrate, findings (2026-10-20)
- [x] Our clean film's BANDWIDTH counts its separate audio (found by the inspector; local copy fixed 2026-10-20, the
      upload waits for the owner)

## M4: polish; MVP complete (target Nov 22)

- [x] About (how it works, limits, the numbers, privacy, credits) and a first-run hint on the Run screen (2026-10-20)
- [x] Accessibility pass: a polite live log of switches and stalls on the Run screen; axe on every screen in both
      themes (2026-10-20)
- [x] Light theme with a System / Light / Dark switch (the owner's request, 2026-10-20)
- [x] Home rendered at build time and hydrated, the app's code after the first paint; Lighthouse CI opens `/` and
      fails under 95 (2026-10-20; locally 0.98–0.99)
- [x] Repeatability job: every preset 5× in Chromium, the spread published in the README and on About (2026-10-20)
- [ ] Real Safari check by hand (shaped responses, redirects, aborts): needs the owner; checklist in
      `activeContext.md`
- [x] README: pitch, architecture, measured numbers, how to run and test (2026-10-20); the GIF is recorded by
      `scripts/readme/record-gif.mjs`; the owner uploaded it to media.azamatos.com the same day

## M4.5: UI polish (approved 2026-10-20, built and live 2026-10-21)

The owner found the UI too boxy and "AI-looking" and asked for a friendlier, more compact one with smooth motion. The
proposal (https://claude.ai/artifact/UYaEK9K9r65q42HTHYvj4K: header before/after, Run, Report, Networks, Inspect,
an interactive motion board) was approved as drawn: "Lets apply everything u mentioned and drew". Built in the
sixth session (2026-10-20 to 21), one commit and its tests per item, in this order; where the build departs from the
boards, `activeContext.md` lists it under "Waiting for the owner".

- [x] **Shared** (`ae2efa8`): header 60 px, the wordmark at 18 px on the links' line, links 15 px, the active link a
      quiet pill (and now marked on a screen whose link carries search params, which it wasn't); motion CSS in
      `src/styles.css` (disclosures open by height with `interpolate-size`, smooth jumps within a page while the router
      starts each screen at its top at once, `.flash` on jump targets, one `rise` keyframe for tables, popovers and
      toasts; none of it with reduced motion); toasts (`src/ui/feedback/`, a polite live region without
      `role="status"`, `id="toasts"`); `Popover` and `MenuItem` (`src/ui/menu/Popover.tsx`: a disclosure; Escape, an
      outside click or focus leaving closes it); `ShowAs` and `ChartOrTable` (`src/ui/run/chart-parts.tsx`) instead
      of the "… as a table" disclosures.
- [x] **Run screen** (`6b5ffb5`): the state chip, the progress bar on the run's clock every frame (the CSS `scale`
      property; `aria-valuenow` at 4 Hz), the hint as one line, the left column (video, four tiles, the result, the
      event log that fills down to the charts and scrolls), each chart's toggle in its header.
- [x] **Report** (`2865bd9`): Run again, Change network, Compare with…, Copy link and a "More actions" menu (Export
      JSON, Delete); toasts for Copy link and Export; the simulation check as a banner (`honestyWarning` in
      `src/core/run/describe.ts`; one quiet line when the simulation held); score bars; the eighth tile, the real
      network's speed while downloading; What happened as rows with "Show ↗"; Try next as cards; Setup as a grid with
      the player settings folded; the score's method as a disclosure the score card opens.
- [x] **Networks** (`ac26d24`): compact rows in a sticky sidebar with the title; the editor's header (badge, Steps |
      Slopes, undo, redo, the `?` popover, Save, Run with this network); one panel for the point and the whole
      network, Import / Export in one menu; the points table behind the toggle; toasts for save, export, import.
- [x] **Inspect** (`8a0b4e4`): Link | Paste text | File as WAI-ARIA tabs, each panel saying what it takes (and a drop
      zone); sample, count and playlist chips, each playlist chip with its worst finding (`playlistSeverities`).
- [x] **Labels:** every one in the plan changed with its screen.
- [x] **Tests** updated with the labels and added for the new parts: the toggles, both menus (a mouse click after
      opening by keyboard), the popover and its `?` key, the tabs, the playlist chips, toasts, the banner (with a slow
      server), the columns ending together; axe in both themes on each.
- [x] **Measured again** (2026-10-21): Lighthouse on Home 0.98–0.99 on the Mac and 0.99–1.0 in the Linux container,
      1.0 in the other categories, CLS 0; with the fonts held back 1.5 s, layout shift 0.0000 (Home, desktop) to 0.025
      (Run, phone); Home's JavaScript 96.3 of 100 KB; its CSS had grown to 8.36 KB and is back to 7.97 of 8 KB
      (`5341079`); 141 Playwright checks pass in three browsers (3 keyboard checks skipped in WebKit), the run-based
      specs repeated three times. A code review of the range found 10 issues: 8 fixed in `6c43a60`, the memory bank written
      at the end, and the progress bar's step back of about a frame at Stop left as it is.

## M4.6: fixes from the owner's test (planned 2026-10-21, decisions approved the same day, built 2026-10-23)

Status on 2026-10-23: the 20 commits of 2026-10-21/22 are live (the owner's "go with push", `9ffe308`; CI green
after a re-run: its first try hung 32 minutes installing browsers). Group B is built from the owner's Claude Design
screens (exported as a project archive, read from source): Compare and Change one thing (`1de8583`), Inspect for big
streams (`a17f61a`). Not pushed. The design's optional "A for reference" line on run B's live charts isn't built.

Status on 2026-10-22 (nothing pushed): group A, D1, SEO, HAR import (`6907809`) and export (`4325691`) are built,
networks export CSV only (`0760ba7`), and `pnpm repeat` was run again for the new score (`2e90093`). Group B waits
for the owner's designs from Claude Design (brief: `.design-sync/briefs/m4.6-group-b.md`). Firefox's "ServiceWorker
… unexpected error" is explained and left (`activeContext.md`, Lessons).

Status on 2026-10-21, evening (nothing pushed): every group A item is built, in `9185b6c`, `3b5a3e4`, `8f73b4b`,
`5f5546c`, `a3b75f6` and `214d582`. The score (D1) is `84d99d3` and SEO is `3853f75`. HAR import is written and its
unit tests pass, but it's uncommitted, with 2 lint errors in its test. HAR export isn't started. Group B is designed
in Claude Design (decision 25), not on the agent's boards. The repeatability tables need a new `pnpm repeat`: their
scores are from the old formula.

The owner tried the live site on 2026-10-21. They inspected and ran Apple's advanced example (`adv_dv_atmos`: 100
variants, 10 audio and 13 subtitle playlists, a ladder up to 2160p at 39 Mbps), pasted its text, compared runs, and
edited a network. What they found, and the plan. Nothing here is built. The decisions D1–D6 are in
`activeContext.md`, "Waiting for the owner".

**A. Fixes that follow patterns already approved (no new board):**

- [x] **Run: the video keeps its last frame.** At the end, `controller.ts` destroys hls.js, which empties the video,
      so a finished run shows a dark box. Before `destroy()`, draw the frame to a canvas and set it as the video's
      `poster`; the video is MSE, so the canvas isn't tainted. Before the first frame, the box says what it waits for
      ("Waiting for the first frame…"). Tests: Playwright checks the poster after a run.
- [x] **Run: the result card is short and the log stays readable.** The honesty paragraph, nine lines on a slow link,
      becomes the Report's simulation-check banner: one headline and Details. The event log keeps at least 240 px, and
      the left column may end below the charts. Tests: the columns test, the banner's text.
- [x] **Networks: the name in the header**, as the board drew it (one of M4.5's departures; the owner didn't find
      the Name field at the bottom). The heading becomes an input styled as a title, with a pencil, and a new
      network starts with its name selected. Tests: keyboard rename, Save keeps the name, axe.
- [x] **A softer text selection.** The `::selection` colour is the solid accent with white text, so selected words
      look like a badge (the owner's "12 s"). Use an accent tint with the normal text colour.
- [x] **Inspect, pasted text with relative links:** one sentence instead of one line per playlist ("123 media
      playlists couldn't be read: …"), with the list behind a disclosure. The counts say "not checked" instead of
      "0 errors". A "Where it came from (optional)" address field resolves the links, so the whole stream can be
      checked. Tests: unit (load with a base address), e2e (the message, then the field).
- [x] **Inspect, findings name playlists by label:** "13 subtitle playlists (English (Forced), Italiano (SDH), …)",
      with the file paths behind a disclosure. Subtitle playlists show "WebVTT", not "unknown".
- [x] **Charts with big ladders:** one dotted line per labelled quality. Apple's 100 variants drew dozens.
- [x] **CSP:** `media-src` gets `data:` for hls.js's placeholder subtitle track (D2).

**B. Needs boards first** (`design-review-before-ui-code`):

- [x] **Inspect for big ladders** (built 2026-10-23, `a17f61a`; `productContext.md`, Inspect). The playlist chooser groups and shrinks when there are many: Video by codec and
      range (H.264, HEVC, Dolby Vision, HDR10+), Audio, Subtitles; a select with groups above about 12. Variants that
      share one video playlist are listed once (Apple's 1080p hls290 has three audio pairings). The ladder table
      groups the same way. The layout doesn't leave the Findings column empty beside a long Segments column.
- [x] **Compare, reworked to answer a question** (built 2026-10-23, `1de8583`; `productContext.md`, Compare and
      Report). The owner: "we need real comparison which will be useful".
  - "Change one thing" from a report: pick another player preset or network, and the lab runs B with only that
    change, then opens Compare.
  - A warning when two runs differ in more than one setting or in the stream. Two ladders can't share one quality
    axis, so such charts show Mbps only.
  - A verdict headline, then metric cards with icons and A/B bars, grouped as Start, Smoothness, Picture and Data.
  - Each chart gets a line on what to look for and a takeaway written from the data ("B stayed at 576p; A dropped
    to 342p at 0:12"). "No stalls in either run" replaces two empty lanes.
- [x] **Run screen end state** (from A): the last frame, the waiting message and the short result are built; Claude
      Design left it as built. Run B of a comparison has its banner (2026-10-23).

**C. Features:**

- [x] **HAR import (D4, built 2026-10-22):** a network curve from DevTools' "Export HAR". It reads the throughput of each response
      while it downloaded (`timings.receive`, body size), sums it per second, and takes the latency from the median
      `wait`. Seconds with no download hold the value before them, and the import says how many there were. It's the
      throughput the page got, not the line's capacity, and the import says so (rule 2). The file is read in the
      browser and only the curve is kept; HAR files can hold cookies. Core parser with unit tests; e2e import.
- [x] **HAR export (D4, built 2026-10-22):** a run's downloads as a HAR file (More actions), to open in DevTools' Network panel
      ("Import HAR file") as a waterfall.
- [x] **SEO and sharing:**
  - Open Graph and Twitter tags, a canonical link, `apple-touch-icon`, JSON-LD (`WebApplication`).
  - A 1200×630 preview image, made by a script from an HTML template (D3: where it lives).
  - Titles and descriptions per route.
  - Build-time heads for the static routes (About, Networks, Inspect, Runs), because link scrapers don't run
    JavaScript.
  - `sitemap.xml`, and the sitemap line in `robots.txt`.
  - After the deploy, the owner checks LinkedIn's Post Inspector.
- [x] **Score (D1, reopens decision 5):** Apple's ladder tops at 39 Mbps, so a 6 Mbps network scores 0 even without a
      stall (6.12 s to the first frame costs 6 × 39 points). Proposed: score against the best the simulated network
      could carry at each moment, keeping Yin et al.'s formula.

Not a bug: the console's `ERR_CONNECTION_REFUSED` for `static.cloudflareinsights.com/beacon.min.js` is Cloudflare
Web Analytics. Cloudflare injects the script at the edge (`(index):37`; our `index.html` doesn't have it). A tracker
blocker or a filtering DNS refused it; the agent's sandbox can't reach it either. Nothing in the app needs it (D6).

## M5: compare and launch (target Dec 6)

- [x] Compare two saved runs (differences in words, what changed, overlaid charts) (2026-10-20)
- [ ] Repo pinned; LinkedIn post with a GIF, after the owner has tested the site
- Dropped 2026-10-22 (the owner): the case study on azamatos.com

## Later (only if it earns it)

- Shaka Player adapter: "player vs player" on the same network.
- Segment probing in a worker (keyframes at segment starts, real codec vs declared).
- DASH; low-latency HLS; more recorded traces (Lumos5G).
- Publish the parser or the simulator as npm packages.
- Parked on 2026-10-18: subtitle sync tool; a player for your own films (subtitle sync, dialogue boost, two
  subtitle languages); encode comparer.

## Done log

- 2026-10-17: Smart TV app idea agreed; folder, README, AGENTS.md and memory bank written.
- 2026-10-18: scope review; the TV app dropped. Pains of viewers and video teams reviewed; the owner chose the HLS
  network lab. Research on stack versions, hls.js internals, Service Worker shaping, trace licences, test streams,
  film licence, Cloudflare terms and names. Brief, spec, tech plan, AGENTS.md and README rewritten; design canvas
  published (6 boards).
- 2026-10-18: decisions settled. M0 scaffold; M1 core modules (parser, simulator and shaper built by two agents in
  worktrees, metrics and the hls.js adapter in the main tree); the run controller and the first Run screen; full
  encode of the film.
- 2026-10-19: pushed to github.com/azamatos/rebuffer (public); before the first push, unpublished history was
  rewritten to drop private references from the docs. Cloudflare Pages live at rebuffer.azamatos.com; R2 media at
  media.azamatos.com with CDN caching, CORS and all files verified; our film became the default sample; levels named
  by width class; live runs work. Push-triggered deploys don't fire (project created through the API); the owner
  deferred the fix.
- 2026-10-19 (second session): honest lateness. The link books late first bytes and late later bytes separately;
  a check before the run measures the real latency and opens the connection; the result names late starts, late
  bytes (with the real speed) and background-tab time in plain words; 321 unit tests, 61 Playwright checks (one new:
  a slow test server). Live runs against media.azamatos.com showed first bytes far later than the check suggests and
  run-to-run variation, so the wording names no cause it can't show.
- 2026-10-20 (third session): the owner said "go with recommendations". Honest lateness pushed and deployed by hand
  (a clean build of `3b7f739`). Live charts on the Run screen (own canvas code, not uPlot; a sentence and a data
  table each; 1.8 ms per frame at worst at 4× CPU throttling). Saved downloads: the worker keeps what runs download
  (300 MB) and answers repeat runs from it; Tunnel scored 31, then 25, 25, 25 (runs 2–4 identical). Playlists now
  cache for a day at Cloudflare (the owner re-uploaded them with `upload.mjs --playlists`). 367 unit tests, 64 Playwright checks.
  Then pushed: Cloudflare built and deployed `7b7d527` from the push on its own (auto-deploy works now), and CI passed.
  Later the same day: the logo cursor keeps blinking (owner's request), and Home's setup (stream, network, player,
  Run) opens the Run screen and starts it; M2 done. 372 unit tests, 73 Playwright checks, home JavaScript 89.5 KB.
- 2026-10-20 (later): M3 started. The Report's first slice and saved runs. A stall that began during hls.js's own
  seek wasn't counted: fixed, with a backstop on the samples and a test that forces a stall. The bundle budget only
  counted `index-*.js`; it now counts every script Home loads. Then "what happened" notes with chart markers, and
  "try next" ideas with player settings in run links. 402 unit tests, 79 Playwright checks. CI failed on GitHub's
  slower Linux runners (WebKit picked a low quality and buffered the whole 20 s test stream, so the forced stall
  never came); the test now caps the buffer. All of it pushed as `8b89fe6` and live.
- 2026-10-20 (fourth session): a review of the third session's work (`3b7f739..4d45ef2`) found 10 issues; 8 were
  real and are fixed: run links took `constructor` and other inherited names as player settings; the stall backstop
  could date a stall before the frame or stall end before it; "What happened" lost abandons when it summed up
  switches and cut notes past seven without a word; the Wasted data tile counted abandons differently from the
  chart; saved downloads went oldest-saved first (now least recently used); after "Forget" the HTTP cache still
  answered while the result said real network (now `no-store`); the heads-up about latency hid itself when only
  the master playlist was saved; the Report's actions and the Runs list weren't tested by keyboard. Docs that no
  longer matched the code were corrected. Then zoom on the Report's charts. 426 unit tests, 82 Playwright checks,
  Home's JavaScript 91.0 KB. The owner said "push" (`c18034c`, CI green, live), chose a 4.4 s blink for the logo
  cursor (WCAG 2.2.2), and "lets go with networks": curve edits and CSV (pure, tested), four recorded 4G traces
  from the Irish 4G dataset (licence checked at Zenodo: CC BY 4.0), saved networks, the Networks screen and "Change
  network" on the Report. 462 unit tests, 88 Playwright checks, Home's JavaScript 93.2 KB. The owner said "lets go":
  pushed (`55356a3`, CI green, live), then the Inspect screen (M3 done): a reader and model in `src/core/inspect`,
  the screen, and e2e tests against the synthetic stream (and a server without CORS). On media.azamatos.com it shows
  all four planted mistakes; on our clean film it found a real one: BANDWIDTH without the separate audio. The encode
  script now measures it with the audio; the upload waits for the owner. 474 unit tests, 94 Playwright checks, Home's
  JavaScript 93.4 KB. Pushed with the owner's "lets push" (`dc3fd6f`, CI green, live). The clean master's upload
  waits for the owner.
- 2026-10-20 (fifth session): the owner asked to finish what's left and to add a light theme with a switch. Built, in
  order, each with its tests: the light theme (System / Light / Dark, a hashed inline script so nothing flashes, axe
  in both themes); About; a polite live log of switches and stalls; a first-run hint; Home rendered at build time and
  hydrated, with the app's code after the first paint (Lighthouse locally 0.98–0.99; CI had been scoring the
  not-found page at `/index.html`); zod without `eval` (Firefox logged a CSP error); the repeatability job
  (each preset 5× in Chromium on a 2:00 synthetic stream from a local server: scores within 1 point per network, the same stalls and switches, first frames within 0.12 s (the first run in a fresh browser is about 0.2 s slower), no late downloads); Compare; README. 484 unit tests, 138 Playwright checks, Home's JavaScript 95.1 KB. Not
  pushed at first. Pushed later that day (`98b6327`, the owner's "lets now push the changes"):
  live in 45 s; CI's e2e passed, its Lighthouse step failed on performance (0.75–0.84) from layout shift: Linux's
  fallback fonts reflow when Geist swaps in. Reproduced in a Linux container. The owner asked for a better fix than
  `font-display: optional` (best practices): fallback faces sized like the web fonts (next/font's and Capsize's
  method, measured in Chromium by `scripts/fonts/fallbacks.mjs`), `em` instead of `ch`, and screens whose code the
  router loads before they render (a directly opened screen had pushed its footer down). With the fonts held back
  1.5 s, Home's layout shift is 0.0000–0.0001 on macOS and Linux; Lighthouse 1.0 in Linux Chromium, 0.99 on the Mac.
  Pushed with the owner's "Lets push" (`5a16d13`): live, CI green, Lighthouse on GitHub's runner 100 in every
  category.
- 2026-10-20 (end of the fifth session): the owner reviewed the polish proposal and approved all of it, then asked to
  stop coding and leave the build to a new session. M4.5's plan above records the decisions; nothing of it is built.
- 2026-10-21 (sixth session, from the evening of 2026-10-20): M4.5 built as approved, one commit per item (shared
  parts, Run, Report, Networks, Inspect), then the CSS budget (the polish took Home's CSS to 8.36 KB; classes reused
  to 7.97 KB) and the code review's fixes: menus that ignored a mouse click in Safari and Firefox on macOS after
  opening by keyboard, a banner headline that could contradict its details, playlist chips that missed measured
  bandwidth, Inspect's tab not following a sample link. 489 unit tests, 141 Playwright checks. Not pushed: the owner
  reviews the screenshots first.
- 2026-10-21 (seventh session): the live clean sample is fixed. Asked with an `Origin`, as browsers ask, R2 serves
  the new `master.m3u8` (1080p declares 6,123,200, 240p 599,571), and the live inspector reports 0 errors, 0 warnings
  and 2 notes on it. The README's GIF was recorded again from the polished build (the script now waits for the
  "Finished" chip); the owner uploaded it after the push. The owner answered "go on" to "Should I push?", and the
  agent's permission checker refused `git push` as a production deploy, so the owner pushed the 12 commits
  (`1c687b3`).
  Cloudflare deployed it within a minute. CI failed on the CSS budget: 8.21 KB against 8. Tailwind also scanned
  the Markdown docs, and the sixth session's memory bank named classes the app doesn't use (7 rules, about 310
  bytes). The 7.97 KB had been measured before that memory bank was written. `src/styles.css` now scans `src/`
  only: 7.90 KB, with the same rules for every class the app uses. The e2e job passed (135, 3 flaky, 3 skipped).
  Checked live in Chromium, Firefox and WebKit: every screen in both themes with axe (clean everywhere), two real
  runs each, the report and its menu, Compare. Firefox's console shows two errors during a run, both from before the
  polish (`activeContext.md`, Next step 4). The owner pushed the fix (`66c638a`): CI green, Lighthouse's assertions
  passed. WebKit's CSV import test had failed on its first try in both CI runs (axe read the import's toast mid-fade);
  the test now waits for the toast to leave.
- 2026-10-22: the owner's new goal: finish this week. HAR import and export (the worker reports each response's
  status), networks export CSV only, Home's CSS budget 9 KB; `pnpm repeat` again with the new score (scores within 2
  points; Rural 3G's 0 explained from a run's breakdown) and our film on the tunnel 4× (60, 59, 59, 59); Firefox's
  console error traced to the page cancelling downloads mid-body (not fixable from the worker); the Claude Design
  brief for group B. 513 unit tests, 141 Playwright checks pass in three browsers.
- 2026-10-23: the owner pushed the 20 commits ("go with push"); live in 30 s with every page's own head, the
  sitemap and the preview image; "Try the tunnel", the report and Export HAR checked live in Chromium, Firefox and
  WebKit. Group B built from the owner's Claude Design screens: Compare leads with what changed and a verdict, reads
  differences within the measured spread as such, compares a stopped run over the stretch both covered, warns about
  two changes or two streams; the Report's Change one thing runs B and opens Compare (checked end to end with our
  film); Inspect groups Apple's 100 variants into 50 rows in four groups, with search, a select for the playlists
  and a bit rate chart per segment. Pushed on the owner's word the same evening; CI's first run failed on a test that
  matched the local encode's bitrate (fixed); checked live in three browsers. Decisions 29 (Rural 3G keeps its 0) and
  30 (group B as built).
