# Active context

**Updated 2026-10-20 (end of the third session: M2 done, most of the Report built).** Read this first, then
`progress.md`.

## Where things stand

- **Rebuffer** is a browser-only HLS network lab: a real hls.js player plays a stream through a simulated network
  (a Service Worker shapes its downloads), live charts and a log show what it does, and a report scores and explains
  the run. No backend. It replaced a Smart TV app plan on 2026-10-18 (too much hardware work for a portfolio piece).
- **Live:** https://rebuffer.azamatos.com (Cloudflare Pages). **Media:** https://media.azamatos.com (R2 behind
  Cloudflare's cache) serves our *Tears of Steel* encodes. **Code:** https://github.com/azamatos/rebuffer (public).
- **Live site = `main` at `8b89fe6`** (pushed 2026-10-20). **Every push to `main` deploys on its own** (Cloudflare
  builds it in about a minute; checked 2026-10-20). Pushing is outward-facing: ask the owner before each push.
- **What works today:**
  - **Home:** hero ("Try the tunnel" starts it), a setup (our two films, three public test streams or your own HLS
    link; seven network presets with a thumbnail each; four player presets; Run), recent runs, how it works.
  - **Run screen:** setup from the URL, a check of the real latency before the run, video, live tiles, three live
    charts (bandwidth and quality, buffer, segment downloads; own canvas code), an event log, and at the end the
    score, an honesty paragraph and "See the report". Repeat runs take downloads from a copy saved in the browser
    (300 MB), so they match.
  - **Report (`/runs/<id>`):** score with its breakdown, seven tiles, the charts from the saved log with numbered
    markers, "What happened" notes, "Try next" ideas (each the setup with one change), setup, simulation check, how
    the score is computed; Run again, Export JSON, Copy link, Delete. **Not built yet: zoom on the charts.**
  - **Runs (`/runs`):** the runs saved in this browser (the newest 50).
  - Placeholders: Inspect, Networks, About.
- **Quality bar today:** 402 unit tests; 79 Playwright checks in Chromium, Firefox and WebKit (axe on every screen;
  2 keyboard checks skipped in WebKit, which only tabs to text fields); Home's JavaScript 90.9 KB of a 100 KB brotli
  budget, counting every script `index.html` loads.
- **Schedule:** M0, M1 and M2 are done (targets were Oct 25, Nov 1 and Nov 8). M3 (Nov 15) is in progress: the Report
  is done except zoom; the network editor and the inspector screen are not started. MVP live by Nov 22, launch Dec 6.

## Next step (in this order)

1. **Zoom on the Report's charts** (the last Report slice). The design says "static, zoomable": a time range chosen
   with the keyboard as well as the mouse (rule 4), the three charts zoomed together, the notes' markers and the
   charts' sentences and tables following the range, and a way back to the whole run.
2. **Network editor (`/networks`, M3):** presets, recorded traces (the Irish 4G converter, CC BY 4.0, with
   attribution), a curve editor that works with the keyboard alone, import and export (JSON; CSV), then "Change
   network" on the Report. Follow the design canvas (Network board).
3. **Inspector screen (`/inspect`, M3)** on top of `src/core/hls`: ladder, tracks, segments, measured bitrate,
   findings. Follow the design canvas (Inspect board).
4. Then M4: About, first-run hints, accessibility pass, pre-rendered Home (Lighthouse), real Safari check, README.

The owner collects fixes and reviews them when everything is ready (said 2026-10-20): keep building, list anything
that needs their eye under "Waiting for the owner".

## Working with the owner (how this went on 2026-10-19 and 2026-10-20)

- Give a recommendation with each choice; the owner answers "go with recommendations" or picks, after seeing results
  (live numbers, screenshots).
- They check the live site after a deploy. Ask before every push; they answered "lets push" / "lets go" each time.
- Things the agent's permission checker blocks: deploying by hand with wrangler and writing to the R2 bucket (the
  owner ran `node scripts/media/upload.mjs --playlists` themselves). Reading wrangler's login token is blocked too.

## Decisions (settled 2026-10-18 to 2026-10-20)

| # | Decision | Outcome |
|---|---|---|
| 1 | Name | **Rebuffer** |
| 2 | Domains | App at **rebuffer.azamatos.com**; **media.azamatos.com** only serves media files (R2 bucket `azamatos-media`). `*.pages.dev` addresses send `noindex` |
| 3 | Brand | The **family wordmark** shared with azamatos.com and pass.azamatos.com: `➜ ~ rebuffer.azamatos▊` in Space Mono, the cursor blinking as on pass.azamatos.com (owner's request 2026-10-20). The favicon keeps the prompt arrow plus a stepped quality line |
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

## Design and plan artifacts

- **Design canvas** (Home, Run, Report, Network editor, Inspector, visual system):
  https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6. Private to the owner. The screens follow it.
- **Plan page:** https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb. A snapshot from 2026-10-18 (before the domain
  and deploy decisions); this memory bank is the source of truth when they differ.

## Waiting for the owner (raised 2026-10-20)

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

## Lessons from this session worth keeping

- **GitHub's Linux runners are slower than the owner's Mac**, and Linux WebKit picks lower qualities. Tests must not
  depend on speed: the 20 s synthetic stream fits whole in the buffer at a low quality, so the forced-stall test caps
  the buffer with `set=maxBufferLength:4,maxMaxBufferLength:4`. The CI report artifact (`playwright-report`) has
  page snapshots of failures (`gh run download <id> -n playwright-report`).
- **Live runs against media.azamatos.com are noisy run to run** (one waited 21 s for a playlist on 2026-10-20); the
  saved copy makes repeats match, and the honesty paragraph says when the real network interfered.
- **A local `vite preview` left on port 4012 makes Playwright reuse a stale build.** Stop it before `pnpm e2e`.

## Local state on the owner's Mac (git-ignored, not needed to continue)

- `media/source/`: the 584 MB source film and the English subtitles.
- `media/out/tears-of-steel/`: the full encodes (clean 912 MB, problems 1.0 GB), already uploaded to R2.
- `media/test-out/`, `media/e2e/`: test encodes and the synthetic e2e stream (rebuilt automatically by Playwright).
