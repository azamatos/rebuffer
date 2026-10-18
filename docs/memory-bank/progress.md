# Roadmap

Target: **MVP live by 2026-11-22; compare runs, case study and launch by 2026-12-06** (the owner's portfolio schedule). The owner works on it about 3 hours a week and pauses during busy weeks, so
agents do most of the building and every milestone is shippable on its own.

## Status

| Milestone | Status |
|---|---|
| Plan for a Smart TV app | done 2026-10-17, dropped 2026-10-18 |
| Plan for the HLS network lab, design proposal | done 2026-10-18 |
| M0 Decisions and setup | in progress (scaffold done 2026-10-18; repo, bucket and deploy wait for the owner) |
| M1 Core modules | not started |
| M2 Live run | not started |
| M3 Report, network editor, inspector | not started |
| M4 Polish; MVP live | not started |
| M5 Compare and launch | not started |

## M0: decisions and setup (target Oct 25)

- [x] Owner decides the open items in `activeContext.md` and reviews the design canvas (2026-10-18)
- [x] `git init`; Vite 8 + React 19 + TypeScript 6 + Tailwind 4, TanStack Router, ESLint (strict, type-checked),
      Prettier, Vitest, Playwright + axe in 3 engines, size-limit, Lighthouse CI, GitHub Actions (2026-10-18)
- [x] App shell: family wordmark, navigation, skip link, routes for every screen, not-found page (2026-10-18)
- [x] Media script: encode *Tears of Steel* (ladder + "with problems" version + subtitles) (2026-10-18)
- [ ] GitHub repo `azamatos/rebuffer` (owner creates it or says yes); rename the folder to `~/www/me/rebuffer`
- [ ] R2 bucket on media.azamatos.com (owner), full encode and upload
- [ ] Cloudflare Pages project on rebuffer.azamatos.com, preview deploys per branch
- [ ] shadcn/ui set up when the first component needs it

## M1: core modules (target Nov 1)

- [ ] Playlist parser, codec names, lint rules, with fixtures and tests
- [ ] Network simulator: curve model, link scheduler, presets, Irish 4G trace converter, with tests
- [ ] Metrics, score, notes and ideas from synthetic logs, with tests
- [ ] Service Worker shaping proven by a Playwright test in Chromium, Firefox and WebKit

Done when the core passes its tests and a 1 MB download through a known curve lands within tolerance in all three
engines.

## M2: live run (target Nov 8)

- [ ] hls.js adapter and RunController; event log
- [ ] Run screen: video, tiles, three charts on one time axis, event log, honesty checks
- [ ] Keyboard-only Playwright test: Home → Try the tunnel (CI curve) → run finishes

## M3: report, network editor, inspector (target Nov 15)

- [ ] Report: score, tiles, timeline, "what happened", "try next", export JSON, share link; saved runs
- [ ] Network editor with presets, recorded traces, keyboard editing, import and export
- [ ] Inspector: ladder, tracks, segments, measured bitrate, findings

## M4: polish; MVP live (target Nov 22)

- [ ] Home, About (how it works, limits, credits), first-run hints
- [ ] Accessibility pass (axe clean, table views, live region); budgets and Lighthouse ≥ 95
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
  Playwright checks with axe in 3 engines), CI, Lighthouse 98/100/100/100 locally, media script.
