# Active context

**Updated 2026-10-19 (end of the first build session).** Read this first, then `progress.md`.

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live tiles and a log show what it does, and a report scores the run.
  A stream inspector comes later in the MVP. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much
  hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **What works today:** Home (hero, how it works), the Run screen first version (setup from the URL, Start, video,
  live tiles, a plain-English event log, score and an honesty line at the end), and placeholders for Inspect,
  Networks, Runs and About. The core under it is done: playlist parser and lint rules, network simulator and
  Service Worker shaper, hls.js adapter, run controller, metrics and score.
- **Quality bar today:** 303 unit tests, 58 Playwright checks (axe on every screen) in Chromium, Firefox and
  WebKit, CI green on GitHub, home JavaScript 85 KB brotli.
- **Ahead of schedule:** M0 and M1 were planned for Oct 25 and Nov 1 and are done; M2 (Nov 8) is half done.

## Next step (in this order)

1. **Honest lateness (M2).** Live runs flag most downloads as "late": this connection's real latency to Cloudflare
   is above the simulated 80 ms RTT even from cache (warm cache: 20 of 41 late, worst 268 ms). Measure the real
   latency and throughput in a warm-up before the run, and report latency and bandwidth separately ("your real
   latency is about N ms, above the simulated 80 ms" vs "your connection couldn't keep up"). Consider caching
   segments in the worker so repeat runs match.
2. **Run screen charts (M2).** Bandwidth and quality, buffer, downloads on one time axis, with uPlot behind our own
   chart interface; live data stays out of React state (AGENTS.md rule 3). Follow the design canvas (Run board).
3. **Home setup (M2).** Stream, network and player pickers on Home that open `/run` with the setup in the URL; a
   keyboard-only Playwright test from Home through a finished run.
4. Then M3: Report screen (notes, "try next", export, share link, saved runs), network editor, inspector screen.

Deploys are by hand for now (see "Deploying" in `techContext.md`): pushes to GitHub don't trigger Cloudflare
builds, and the owner decided on 2026-10-19 to leave that for later.

## Decisions (settled 2026-10-18 and 2026-10-19)

| # | Decision | Outcome |
|---|---|---|
| 1 | Name | **Rebuffer** |
| 2 | Domains | App at **rebuffer.azamatos.com**; **media.azamatos.com** only serves media files (R2 bucket `azamatos-media`). `*.pages.dev` addresses send `noindex` |
| 3 | Brand | The **family wordmark** shared with azamatos.com and pass.azamatos.com: `➜ ~ rebuffer.azamatos▊` in Space Mono. The favicon keeps the prompt arrow plus a stepped quality line |
| 4 | Design | The dark "instrument panel" look on the design canvas, accepted 2026-10-18 |
| 5 | Score | Normalised linear QoE (Yin et al., 2015) out of 100, formula shown |
| 6 | Network shaping | A Service Worker shapes the player's own requests, every origin except the app's own; a custom hls.js loader is the fallback |
| 7 | TypeScript | 6.0 with typescript-eslint; 7 when lint supports it |
| 8 | Stream links | The lab accepts **any HLS link**, with a clear message when a server blocks browser access |
| 9 | Samples | Our *Tears of Steel* (clean, and a version with planted mistakes) first; public test streams from Unified Streaming, Apple and Mux after it |
| 10 | Scope by Dec 6 | Compare two runs and the case study; Shaka Player after launch |
| 11 | Repo | github.com/azamatos/rebuffer, public (owner created it 2026-10-19), pushed over SSH |
| 12 | Deploys | By hand until push-triggered builds are fixed; the owner deferred that on 2026-10-19 |

## Design and plan artifacts

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Owner's open items

- Fix push-triggered deploys (deferred): GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure
  → make sure azamatos/rebuffer is listed; if pushes still don't deploy, recreate the `rebuffer` Pages project from
  the dashboard (Create → Pages → Connect to Git; build `pnpm build`, output `dist`) and re-add the custom domain.
- Optional: rename the folder `~/www/me/tv` → `~/www/me/rebuffer` between sessions.
- Optional: Cloudflare Web Analytics for rebuffer.azamatos.com (the CSP already allows its beacon).
- Deferred to the beta: which player failures hurt most in the owner's past work and which hls.js settings were
  tuned; own network recordings for presets.

## Open questions

- Shaped responses in real Safari (only Playwright's WebKit was tested).
- Whether to add Lumos5G (CC BY 4.0) traces next to the Irish 4G ones.
- Whether to publish the playlist parser or the network simulator as npm packages after launch.

## Local state on the owner's Mac (git-ignored, not needed to continue)

- `media/source/`: the 584 MB source film and the English subtitles.
- `media/out/tears-of-steel/`: the full encodes (clean 912 MB, problems 1.0 GB), already uploaded to R2.
- `media/test-out/`, `media/e2e/`: test encodes and the synthetic e2e stream (rebuilt automatically by Playwright).
