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
| M2 Live run | Nov 8 | in progress: a real run works end to end, live; honest lateness, charts and Home setup left |
| M3 Report, network editor, inspector | Nov 15 | not started |
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
- [ ] Push-triggered deploys: deferred by the owner on 2026-10-19; deploys are by hand (`techContext.md`, "Deploying")
- [ ] Optional: rename the folder to `~/www/me/rebuffer`
- [ ] shadcn/ui, when the first component needs it

## M1: core modules — done

- [x] Playlist parser, codec names, lint rules with spec references; 193 tests (2026-10-18)
- [x] Network simulator: curve model, link scheduler, presets, page↔worker protocol, client; compact curve URL
      format (2026-10-18)
- [x] Service Worker shaper, proven in Chromium, Firefox and WebKit: 3–24 ms behind the curve, never ahead; shapes
      every origin except the app's own (2026-10-18)
- [x] Run event log; metrics, score and the honesty count (2026-10-18)
- [x] hls.js adapter and player presets; levels named by width class (1280×534 → 720p) (2026-10-19)

## M2: live run (target Nov 8)

- [x] Run controller; setup in the URL (stream, network preset or compact curve, player preset) (2026-10-18)
- [x] Run screen, first version: setup, progress, video, live tiles, event log, score, honesty line (2026-10-18)
- [x] End-to-end Playwright run on a synthetic ffmpeg ladder in all three engines (2026-10-18)
- [x] Our film is the default sample; a live run on rebuffer.azamatos.com plays it from media.azamatos.com (2026-10-19)
- [ ] **Honest lateness:** a warm-up before the run measures the real latency and throughput; the report separates
      "your real latency (~N ms) is above the simulated one" from "your connection couldn't keep up". Found on
      2026-10-19: even from Cloudflare's cache, this connection's latency is above the simulated 80 ms RTT (warm:
      20 of 41 downloads late, worst 268 ms; cold: 34 of 34, worst 596 ms; Unified Streaming's on-demand packaging:
      17 of 17, worst 1.2 s)
- [ ] Optional with the above: cache segments in the worker so repeat runs of a setup match
- [ ] Run screen charts: bandwidth and quality, buffer, downloads on one time axis (uPlot), per the design canvas
- [ ] Home setup (stream, network, player pickers) wired to `/run`; "Try the tunnel" from Home
- [ ] Keyboard-only Playwright test: Home → Try the tunnel → run finishes

## M3: report, network editor, inspector (target Nov 15)

- [ ] Report: score with breakdown, tiles, timeline, "what happened" notes, "try next" ideas, export JSON, share
      link; saved runs in IndexedDB; Runs list
- [ ] Network editor: presets, recorded traces, keyboard editing, import and export
- [ ] Irish 4G trace converter (CC BY 4.0) and recorded-trace presets with attribution
- [ ] Inspector screen on top of `src/core/hls`: ladder, tracks, segments, measured bitrate, findings

## M4: polish; MVP complete (target Nov 22)

- [ ] About (how it works, limits, credits), first-run hints
- [ ] Accessibility pass (table views for charts, live region); budgets; Lighthouse ≥ 95
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
