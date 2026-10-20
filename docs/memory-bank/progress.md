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
| M4 Polish; MVP live | Nov 22 | done 2026-10-20 locally, except the real Safari check (needs the owner); not pushed yet |
| M5 Compare and launch | Dec 6 | Compare built 2026-10-20; the case study and the launch posts remain |

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

## M5: compare and launch (target Dec 6)

- [x] Compare two saved runs (differences in words, what changed, overlaid charts) (2026-10-20)
- [ ] Case study on azamatos.com; repo pinned; LinkedIn post with a GIF

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
  Waits for the owner's OK to push.
