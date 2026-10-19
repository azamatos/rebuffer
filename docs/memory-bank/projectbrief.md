# Project brief

**Chosen 2026-10-18.** Replaces the Smart TV app planned on 2026-10-17 (dropped: too much hardware work for a
portfolio piece). Live at https://rebuffer.azamatos.com since 2026-10-19, still in development (`progress.md`).

## What it is

A browser-only lab for HLS video streaming. Pick a stream (the sample, or any HLS link), pick a network ("train
through a tunnel", "busy café Wi-Fi", or a bandwidth curve you draw), and press **Run**. A real player (hls.js)
plays the stream through a simulated network while live charts show what it does: the bandwidth it gets, what it
thinks it gets, the quality it picks, the buffer, every stall. At the end comes a report with the numbers that
decide whether viewers stay: time to first frame, stalls, average quality, quality switches, wasted downloads.
Runs are saved in the browser, two runs can be compared, and a setup can be shared as a link.

A **stream inspector** reads the playlist: the quality ladder, codecs in plain words, audio and subtitle tracks,
segments, measured against declared bitrates, and warnings with explanations.

No backend: everything runs in the visitor's browser. The sample film is Blender Studio's *Tears of Steel*
(CC BY 3.0), re-encoded for streaming.

## Why it exists

- **Buffering is the oldest complaint about online video**, and the work that fights it (adaptive bitrate
  logic, buffer sizes, encoding ladders) is invisible: it lives in player configs and private dashboards. This
  makes it visible and testable in a browser tab.
- **The gap (checked 2026-10-18):** research simulators in Python (Sabre), browser DevTools throttling (one flat
  rate, no player metrics), local throttling servers and command-line playlist checkers exist. Nothing on the web
  runs the real player through a changing network and scores the result.
- **The owner's video work is private.** The owner built a custom hls.js player for a video platform with 100k+
  active users and tuned hls.js for low-end TVs; that code belongs to the client. This is the public stand-in,
  written from scratch.

## Who it's for

- **Video and player engineers, QA:** reproduce "it buffers on the train" at a desk; check a ladder or a player
  config before shipping; share the exact setup with a link.
- **People learning adaptive streaming:** the charts and the report explain each decision the player made.
- **Anyone reviewing the owner's work:** open the link, press "Try the tunnel", and within 30 seconds a player is
  fighting a bad network on screen.

## What it proves

| Skill | Where it shows |
|---|---|
| Video streaming | HLS playlist parsing, codec strings, hls.js internals (custom loader, ABR settings), buffer metrics |
| Hard frontend engineering | A deterministic network simulator in the page; live charts at 60 fps next to a playing video |
| Architecture | A framework-free, unit-tested core (parser, simulator, metrics, player adapters) under a React UI |
| Data visualisation and UX | Time-series charts, a curve editor that works with the keyboard, reports people can read |
| Quality | Vitest, Playwright and axe on every screen, Lighthouse and bundle budgets in CI |
| React + TypeScript | The whole app |

## What success looks like

- Live at rebuffer.azamatos.com; the README has a GIF, the architecture, and measured numbers.
- The 30-second path works: open → "Try the tunnel" → watch → report.
- **The simulation is honest:** the same setup gives the same result within a stated, measured margin, and a run
  says so when the visitor's real network was slower than the simulated one.
- Every screen works with the keyboard alone; charts have text alternatives; Lighthouse ≥ 95; axe clean.
- On azamatos.com as a case study and pinned on GitHub.

## Not in scope

- A backend of any kind: accounts, server storage, a CORS proxy.
- DRM-protected streams, low-latency live HLS and DASH in the MVP (DASH maybe later).
- TV apps (dropped 2026-10-18).
- Recording or downloading streams.
