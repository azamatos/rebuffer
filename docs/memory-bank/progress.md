# Roadmap

Target: **MVP live by 2026-11-22; compare runs, case study and launch by 2026-12-06** (the owner's portfolio
schedule). The owner works on it about 3 hours a week and pauses during busy weeks, so agents do most of the
building and every milestone is shippable on its own.

## Status

| Milestone | Target | Status |
|---|---|---|
| Plan for a Smart TV app | — | done 2026-10-17, dropped 2026-10-18 |
| Plan for the HLS network lab, design proposal | — | done 2026-10-18 |
| M0 Decisions and setup | Oct 25 | done 2026-10-19 (push-triggered deploys deferred by the owner) |
| M1 Core modules | Nov 1 | done 2026-10-18 (the Irish 4G trace converter moved to M3) |
| M2 Live run | Nov 8 | done 2026-10-20: honest lateness, live charts, saved downloads, Home setup |
| M3 Report, network editor, inspector | Nov 15 | in progress: the Report's first slice and saved runs built 2026-10-20 |
| M4 Polish; MVP live | Nov 22 | not started (the site is already live; M4 makes it complete) |
| M5 Compare and launch | Dec 6 | not started |

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
- [ ] Report: "try next" ideas (rerun with one setting changed), zoom
- [ ] Network editor: presets, recorded traces, keyboard editing, import and export
- [ ] Irish 4G trace converter (CC BY 4.0) and recorded-trace presets with attribution
- [ ] Inspector screen on top of `src/core/hls`: ladder, tracks, segments, measured bitrate, findings

## M4: polish; MVP complete (target Nov 22)

- [ ] About (how it works, limits, credits), first-run hints
- [ ] Accessibility pass (live region for switches and stalls; chart tables are built); budgets; Lighthouse ≥ 95
- [ ] Pre-render the home page: CI measured Lighthouse performance 0.82 on GitHub's runners (0.98 locally) because
      the first paint waits for React; the CI assertion is a warning until this is done
- [ ] Determinism job: spread per preset measured and published
- [ ] Real Safari check by hand (shaped responses, redirects, aborts)
- [ ] README: pitch, GIF, architecture, measured numbers, how to run and test

## M5: compare and launch (target Dec 6)

- [ ] Compare two saved runs (tiles with differences, overlaid charts)
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
  counted `index-*.js`; it now counts every script Home loads. 384 unit tests, 79 Playwright checks.
