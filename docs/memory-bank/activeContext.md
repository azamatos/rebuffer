# Active context

**Updated 2026-10-18.** Read this first.

## Where things stand

- **The project changed on 2026-10-18.** The Smart TV app planned on 2026-10-17 is dropped (too much hardware work
  for a portfolio piece). After reviewing what viewers and video teams struggle with, the owner chose an **HLS
  network lab** named **Rebuffer**: run a real player through a simulated bad network, watch it live,
  get a scored report; plus a stream inspector. Browser-only, no backend.
- The brief, product spec, tech plan, `AGENTS.md` and README were rewritten for it on 2026-10-18. Code started the same day (M0).
- **Design proposal** (6 boards: Home, Run, Report, Network editor, Inspector, visual system), dark and in the
  azamatos.com brand: https://claude.ai/artifact/BgVz6NLex5nHa9G5hGKej6 (private until the owner shares it).
  Accepted by the owner on 2026-10-18. A plan page with the same decisions, stack and architecture:
  https://claude.ai/artifact/4B7WoHuWMp3aNKdZkDFpqb (private).
- **Facts checked 2026-10-18:** package versions; hls.js 1.7.3 loader, stats and events; Service Worker shaping
  tested in Chromium, Firefox and WebKit (scratch Playwright run); trace dataset licences; CORS of public test
  streams; *Tears of Steel* licence (the soundtrack is CC BY-ND, so the film is re-encoded, never cut);
  Cloudflare R2/Pages limits and video terms; prior art (the gap is real); name collisions.
- Targets: MVP live by **Nov 22**, compare runs and the case study by **Dec 6** (`progress.md`).
- Parked on 2026-10-18 (see `progress.md`, Later): subtitle sync tool, a player for your own films, encode comparer.
- **Code exists since 2026-10-18:** a local git repo with the M0 scaffold (see `progress.md`). Nothing is deployed.

## Decisions (settled 2026-10-18 unless marked open)

| # | Decision | Outcome |
|---|---|---|
| 1 | Name | **Rebuffer.** |
| 2 | Subdomain | **rebuffer.azamatos.com** for the app. |
| 3 | Media hosting | **media.azamatos.com** serves media files only: one R2 bucket, ~1 GB. **Open:** the owner creates the bucket (Cloudflare may ask for a payment method). |
| 4 | Brand | The header uses the **family wordmark** shared with azamatos.com and pass.azamatos.com: `➜ ~ rebuffer.azamatos▊` in Space Mono. The favicon keeps the prompt arrow plus a stepped quality line. |
| 5 | Design | The dark "instrument panel" look on the canvas, accepted; the canvas headers now show the family wordmark too. |
| 6 | Score | Normalised linear QoE (Yin et al., 2015) out of 100, formula shown. |
| 7 | Network shaping | A Service Worker shapes the player's own requests; a custom hls.js loader is the fallback. |
| 8 | TypeScript | 6.0 with typescript-eslint; 7 when lint supports it. |
| 9 | Scope by Dec 6 | Compare two runs and the case study; Shaka Player after launch. |
| 10 | Stream links | The lab accepts **any HLS link** from launch, with a clear message when a server blocks browser access. |
| 11 | Test streams | Public test streams (Apple, Unified Streaming, Mux) for development and as samples; no special streams from the owner. |
| 12 | Folder and repo | **Open:** rename `~/www/me/tv` → `~/www/me/rebuffer` (after this session, so the session's folder doesn't move) and create the GitHub repo `azamatos/rebuffer` (owner creates it or says yes). |

## Questions for context (deferred to the beta, owner's call 2026-10-18)

- Which failures hurt most in the players the owner shipped, and which hls.js settings were changed and why.
- Own network recordings that could become presets.

## Next step

M0 is mostly done (see `progress.md`): the app shell, tooling, tests, CI and the media script exist and pass
locally. Left for M0: the owner creates the GitHub repo and the R2 bucket; then connect Cloudflare Pages to the
repo for rebuffer.azamatos.com and upload the full encode. Meanwhile M1 (core modules) can start.

## Open questions

- Shaped responses in real Safari (only Playwright's WebKit was tested).
- Whether enabling R2 needs a payment method; whether Pages may serve HLS (not verified, so video stays on R2).
- Whether to add Lumos5G (CC BY 4.0) traces next to the Irish 4G ones.
- Whether to publish the playlist parser or the network simulator as npm packages after launch.
