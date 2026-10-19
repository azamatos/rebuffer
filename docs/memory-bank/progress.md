# Roadmap

Target: **MVP live by 2026-11-22; compare runs, case study and launch by 2026-12-06** (the owner's portfolio schedule). The owner works on it about 3 hours a week and pauses during busy weeks, so
agents do most of the building and every milestone is shippable on its own.

## Status

| Milestone | Status |
|---|---|
| Plan for a Smart TV app | done 2026-10-17, dropped 2026-10-18 |
| Plan for the HLS network lab, design proposal | done 2026-10-18 |
| M0 Decisions and setup | in progress (scaffold done 2026-10-18; repo, bucket and deploy wait for the owner) |
| M1 Core modules | done 2026-10-18 (except the Irish 4G trace converter) |
| M2 Live run | in progress (a real run works end to end; charts next) |
| M3 Report, network editor, inspector | not started |
| M4 Polish; MVP live | not started |
| M5 Compare and launch | not started |

## M0: decisions and setup (target Oct 25)

- [x] Owner decides the open items in `activeContext.md` and reviews the design canvas (2026-10-18)
- [x] `git init`; Vite 8 + React 19 + TypeScript 6 + Tailwind 4, TanStack Router, ESLint (strict, type-checked),
      Prettier, Vitest, Playwright + axe in 3 engines, size-limit, Lighthouse CI, GitHub Actions (2026-10-18)
- [x] App shell: family wordmark, navigation, skip link, routes for every screen, not-found page (2026-10-18)
- [x] Media script: encode *Tears of Steel* (ladder + "with problems" version + subtitles) (2026-10-18)
- [x] GitHub repo github.com/azamatos/rebuffer (owner created it, public; pushed 2026-10-19; description and topics
      set)
- [ ] Rename the folder to `~/www/me/rebuffer`
- [x] Full encode (2026-10-18): clean 912 MB (184 × 4 s segments per rung; our parser finds only two notes: no
      I-frame playlists, one 2.05× ladder gap), problems version 1.0 GB (the planted mistakes found exactly)
- [ ] R2 bucket on media.azamatos.com (owner) and upload
- [ ] Cloudflare Pages project on rebuffer.azamatos.com, preview deploys per branch
- [ ] shadcn/ui set up when the first component needs it

## M1: core modules (target Nov 1)

- [x] Playlist parser, codec names, lint rules, with fixtures and tests (2026-10-18; 193 tests; checked on our
      real encodes: the planted mistakes are found)
- [x] Network simulator: curve model, link scheduler, presets, page↔worker protocol, client, with tests (2026-10-18)
- [ ] Irish 4G trace converter
- [x] Run event log; metrics and score from synthetic logs, with tests (2026-10-18)
- [x] hls.js adapter (events from the player and the video element) and player presets (2026-10-18; end-to-end test in M2)
- [ ] "What happened" notes and "try next" ideas (moved to M3, to tune on real runs)
- [x] Service Worker shaping proven by a Playwright test in Chromium, Firefox and WebKit: 3–24 ms behind the curve
      (2026-10-18)

Done when the core passes its tests and a 1 MB download through a known curve lands within tolerance in all three
engines.

## M2: live run (target Nov 8)

- [x] hls.js adapter and RunController; event log; setup in the URL (stream, network preset or compact curve,
      player preset) (2026-10-18)
- [x] Run screen, first version: setup, progress, video, live tiles, event log, score and honesty line
      (2026-10-18)
- [x] Playwright: a synthetic ffmpeg ladder plays through the shaper end to end in Chromium, Firefox and WebKit
      (2026-10-18)
- [ ] Run screen charts: bandwidth and quality, buffer, downloads on one time axis (uPlot)
- [ ] Home setup (stream, network, player pickers) wired to the Run screen; Try the tunnel from Home
- [ ] Keyboard-only Playwright test: Home → Try the tunnel → run finishes

## M3: report, network editor, inspector (target Nov 15)

- [ ] Report: score, tiles, timeline, "what happened", "try next", export JSON, share link; saved runs
- [ ] Network editor with presets, recorded traces, keyboard editing, import and export
- [ ] Inspector: ladder, tracks, segments, measured bitrate, findings

## M4: polish; MVP live (target Nov 22)

- [ ] Home, About (how it works, limits, credits), first-run hints
- [ ] Accessibility pass (axe clean, table views, live region); budgets and Lighthouse ≥ 95
- [ ] Pre-render the home page: CI measured Lighthouse performance 0.82 on GitHub's runners (0.98 locally) because
      the first paint waits for React; the CI assertion is a warning until this is done (2026-10-19)
- [ ] Determinism job: spread per preset measured and published
- [ ] README: pitch, GIF, architecture, measured numbers, how to run and test
- [ ] Deployed to the chosen subdomain

## M5: compare and launch (target Dec 6)

- [ ] Compare two saved runs (tiles with differences, overlaid charts)
- [ ] Case study on azamatos.com; repo public (owner's call) and pinned; LinkedIn post with a GIF

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
  network lab. Research on stack versions, hls.js internals, Service Worker shaping (tested in 3 engines), trace
  licences, test streams, film licence, Cloudflare terms and names. Brief, spec, tech plan, AGENTS.md and README
  rewritten; design proposal published as a canvas (6 boards).
- 2026-10-18: owner settled the decisions (Rebuffer at rebuffer.azamatos.com, media at media.azamatos.com, any
  stream link, public test streams, family wordmark). M0 scaffold built: tooling, app shell, tests (Vitest; 25
  Playwright checks with axe in 3 engines), CI, Lighthouse 98/100/100/100 locally, media script (test encodes
  verified: 4 s fMP4 ladder; the problems version cuts a 6.625 s segment under a 6 s target). M1 started: event log,
  metrics, score, hls.js adapter. Network simulator and Service Worker shaper built and merged (98 unit tests, 49
  Playwright checks green). Playlist parser, codecs and lint rules merged (193 tests). Run controller and the first
  Run screen built: a real hls.js run plays through the shaper in all three engines (301 unit tests, 56 Playwright
  checks).
- 2026-10-19: pushed to github.com/azamatos/rebuffer (public). Before the first push, local history was rewritten
  to drop private references from the docs (no commit had been published).
