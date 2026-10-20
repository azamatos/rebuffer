# Active context

**Updated 2026-10-20 (third session: deploy, live charts, saved downloads).** Read this first, then `progress.md`.

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live tiles and a log show what it does, and a report scores the run.
  A stream inspector comes later in the MVP. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much
  hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **What works today:** Home (hero, how it works), the Run screen (setup from the URL, Start, video, live tiles, three
  live charts, a plain-English event log, score and an honesty paragraph at the end), and placeholders for Inspect,
  Networks, Runs and About. The core under it is done: playlist parser and lint rules, network simulator and
  Service Worker shaper, hls.js adapter, run controller, metrics and score.
- **Live site = commit `3b7f739` (honest lateness)**, pushed and deployed by hand on 2026-10-20 (`wrangler pages
  deploy` of a clean build of that commit). The charts and saved downloads are on `main` locally, **not pushed or
  deployed yet**.
- **Honest lateness (built 2026-10-19):** a check before the run measures the real latency to the stream's host and
  opens the connection; the result tells late starts from late bytes, quotes the real speed and the measured
  latency, and reports background-tab time (`techContext.md`, "Honesty checks").
- **Live charts (built 2026-10-20):** bandwidth and quality, buffer, segment downloads on one time axis, per the
  design canvas; our own canvas code instead of uPlot (reason in `techContext.md`, Stack). Each chart has a sentence
  and a data table. Drawing costs 0.1 ms per frame (p50), 1.8 ms at most, at 4× CPU throttling.
- **Saved downloads (built 2026-10-20):** the worker keeps what runs download (300 MB, oldest out) and answers repeat
  runs from it, still shaped. The result says how many downloads came from it and has a "Forget saved downloads"
  button. Live results in `techContext.md`, "Saved downloads for repeat runs".
- **Quality bar today:** 367 unit tests, 64 Playwright checks (axe on every screen; 2 keyboard checks skipped in
  WebKit as before) in Chromium, Firefox and WebKit, home JavaScript 85.5 KB brotli, Run chunk 41 KB gzip.
- **Ahead of schedule:** M0 and M1 were planned for Oct 25 and Nov 1 and are done; M2 (Nov 8) is half done.

## Next step (in this order)

1. **The owner decides** on the items in "Waiting for the owner" below (push and deploy the charts and saved
   downloads first).
2. **Home setup (M2).** Stream, network and player pickers on Home that open `/run` with the setup in the URL; a
   keyboard-only Playwright test from Home through a finished run.
3. Then M3: Report screen (notes, "try next", export, share link, saved runs, zoomable charts), network editor,
   inspector screen.

Deploys are by hand for now (see "Deploying" in `techContext.md`): pushes to GitHub don't trigger Cloudflare
builds, and the owner decided on 2026-10-19 to leave that for later.

## Decisions (settled 2026-10-18 to 2026-10-20)

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
| 13 | Repeat runs | The browser keeps what runs download (300 MB) so repeats match; approved 2026-10-20 ("go with recommendations"), built the same day |
| 14 | Playlist cache time | A day instead of 5 minutes; approved 2026-10-20; the live files change when the owner re-uploads them |

## Design and plan artifacts

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Waiting for the owner (raised 2026-10-20, third session)

- **Push and deploy the charts and saved downloads.** Recommended: yes. Pushing is done over SSH (`git push origin
  main`); deploying by hand is a clean build plus `pnpm exec wrangler pages deploy dist --project-name rebuffer
  --branch main` (`techContext.md`, "Deploying"). The agent's permission checker blocks deploys and R2 writes, so the
  owner runs them or allows them.
- **Playlists' cache time at Cloudflare** (approved 2026-10-20): `scripts/media/upload.mjs` now sets a day; the 14
  live playlists still say 5 minutes until the owner runs `node scripts/media/upload.mjs --playlists` (local copies
  match the live ones byte for byte, checked 2026-10-20). Low priority now: with saved downloads, playlists come
  from Cloudflare only on a setup's first run.
- **Score on slow networks (observation, decision 5 stays as is until the owner reopens it).** Rural 3G played with
  no stalls and scored 0–1/100, Tunnel 25–35: the score compares with the ladder's top quality, not with what the
  network allows. Possible later: show "best possible on this network" next to the score.
- **Idea, not started:** the first run of a setup carries the real network's noise. A "warm-up" could download the
  ladder for the run's length first (about 140 MB for 1:30 of our film), so even the first run is clean. Recommended:
  not now; the result already says when the real network held a run back, and the next run fixes it.

## Owner's open items

- Fix push-triggered deploys (deferred): GitHub → Settings → Applications → Cloudflare Workers and Pages → Configure
  → make sure azamatos/rebuffer is listed; if pushes still don't deploy, recreate the `rebuffer` Pages project from
  the dashboard (Create → Pages → Connect to Git; build `pnpm build`, output `dist`) and re-add the custom domain.
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
