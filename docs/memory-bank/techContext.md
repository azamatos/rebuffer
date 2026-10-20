# Technical plan

**Agreed 2026-10-18; built through M1 and the first Run screen by 2026-10-19.** Versions and API facts were checked
on 2026-10-18 (`npm view`, package sources, a scratch Playwright test).

## Stack

| Area | Choice | Version (2026-10-18) | Why |
|---|---|---|---|
| Build | Vite (Rolldown inside) | 8.3 | Owner's default; fast; default target Chrome 111 / Safari 16.4 / Firefox 114 |
| UI | React | 19.3 | Owner's default; the stack target jobs use |
| Language | TypeScript, strict | **6.0.x** | typescript-eslint needs `typescript <6.1`; TS 7 (native) has no stable JS API yet. Move to 7 when lint supports it |
| Styling | Tailwind CSS | 4.3 | No old-engine limits any more; works in Chrome 111+, Safari 16.4+, Firefox 128+ |
| Components | shadcn/ui (Radix) | — | Owner's default: dialog, popover, tabs, select, tooltip, toggle group |
| Routing | TanStack Router | 1.170 | Typed, validated search params: a run setup lives in the URL and can be shared |
| App state | Zustand | 5.0 | Settings and UI state only; run data stays outside React |
| Player | hls.js | 1.7.3 (no 2.x) | The player under test. Pinned; the version is saved with every run. Shaka Player 5.3 later |
| Charts | Our own canvas code (`src/charts`) | — | **Changed 2026-10-20 from uPlot (1.6.32).** The design needs a curve that is filled up to the playhead and dashed after it, a log axis labelled by the ladder, stall bands, a playhead with a time pill and a downloads lane; with uPlot most of that was draw hooks anyway, and uPlot redraws everything on each `setData`. Own code draws a frame in 0.1 ms (p50) and 1.8 ms (max) at 4× CPU throttling, adds no dependency, and its scales and labels are unit-tested. Zoom for the Report (M3) is ours to build |
| Validation | zod | 4.6 | Imported traces, exported runs, URL state |
| Storage | idb-keyval (IndexedDB) | 6.3 | Saved runs and networks; small API |
| Unit tests | Vitest | 5.0 | Core logic, with fake timers for the simulator |
| E2E and a11y | Playwright + @axe-core/playwright | 1.64 / 4.14 | Chromium, Firefox, WebKit |
| Budgets | size-limit, Lighthouse CI | 14.2 / 0.15 | Bundle size per route; Lighthouse ≥ 95 |
| Lint, format | ESLint flat + typescript-eslint, Prettier | 10.13 / 3.9 | Owner's default |
| Runtime | Node ≥ 22.12, pnpm 10 | — | Owner's default; Vite 8 needs Node 20.19+ or 22.12+ |
| Hosting | Cloudflare Pages at rebuffer.azamatos.com, R2 at media.azamatos.com (Web Analytics optional, not on yet) | wrangler 4.151 (devDependency) | Free tiers; R2 is the route Cloudflare's terms allow for video |
| Fonts | Geist (variable) and Space Mono, self-hosted via Fontsource | 5.3 | Same faces as azamatos.com; no third-party font requests |

## How the network is simulated

**Decided 2026-10-18 and built: a Service Worker shapes the player's own requests.**

- During a run, the page registers a *session* with the Service Worker: the network curve, the latency, the origins
  to shape (the run controller passes `*`: every origin except the app's own, because segments often live on
  another host) and the start time. The SW intercepts those requests from that page and answers each one with a
  `Response` whose body it releases on the schedule the curve allows. Bytes come from the real network, or from the
  copy saved by earlier runs (below).
- **One bottleneck link per run.** Concurrent downloads (video and audio, a playlist refresh) share the bandwidth
  fairly; every request waits one RTT before its first byte. The scheduler ticks every 10–20 ms; the maths
  (integrating the curve, fair sharing) is a pure module in `src/core/netsim`, unit-tested with a fake clock.
- **The player runs unmodified.** hls.js keeps its default loader, its own progress events, its abandon rules and
  its bandwidth estimator, so the lab tests the real code path. Shaka Player (fetch-based) goes through the same
  SW, so "player vs player" needs no new transport.
- **Checked 2026-10-18** in a scratch Playwright test: a SW serving a cross-origin, CORS-enabled file throttled to
  64 KB per 100 ms worked in Chromium, Firefox and WebKit. XHR `progress` events arrived about every 105 ms with
  `lengthComputable` set (once `content-length` is present). Real Safari is not verified yet.
- **Why not a custom hls.js loader:** it works (hls.js reads `stats.loaded` directly for abandon decisions and
  stamps `parsing.end` itself, so a loader must update stats step by step and wait in real time), but it replaces
  the very code under test and is hls.js-only. **Why not CDP throttling:** Chromium-only, deprecated
  (`emulateNetworkConditions`), and changing conditions mid-request delivered the rest of the response at once.
- **Honesty checks** (rule 2): every response records when its bytes arrived from the real network versus when the
  simulation released them. Repeat runs of each preset in CI measure the spread that the README states (_planned_).
  **Built 2026-10-19:**
  - **Latency and bandwidth are told apart.** The link books a wait for real bytes before a request's first byte as
    `firstByteLateMs` (the real latency is above the simulated RTT) and a wait after it as `bodyLateMs` (the real
    network couldn't keep up with the simulated bandwidth). Only time while the simulated link is up counts. A first
    byte counts as late past 20 ms (two shaper ticks, `LATE_FIRST_BYTE_MS`), a download past 50 ms (`LATE_MS`).
  - **A check before the run** (`src/core/netsim/latency.ts`): the page asks the stream's host for the playlist four
    times in a row, unshaped, with `cache: "no-store"` (Cloudflare still answers from its cache: it ignores the
    request's `no-cache`). The first answer opens the connection, so the run's first download doesn't pay for DNS and
    TLS; the median of the other three is the real latency, logged as a `network-check` event. When it is above the
    simulated RTT, the Run screen says so while the run plays.
  - **The real network's speed:** the worker records when each real response arrived and when its last byte did
    (`realFirstByteAt`, `realEndAt`); the report divides the bytes of finished downloads by the time the real network
    was busy with at least one of them, and quotes it when bandwidth held the run back.
  - **Hidden tabs:** the controller logs `visibility` events; the report says how long the tab was in the background.
  - Why: from the owner's Mac, media.azamatos.com (Cloudflare, Warsaw, cache hit) answers in 80–100 ms on an open
    connection and about 300 ms on a new one (TLS alone about 230 ms), measured with curl on 2026-10-19. Six of seven
    presets simulate less than that (15–80 ms).
  - **Measured in live runs (2026-10-19, Playwright Chromium on the owner's Mac, local build against
    media.azamatos.com):** the check before the run gives 86–105 ms; its first answer, which opens the connection,
    took 320–810 ms. During runs, first bytes are often much later than the check suggests (Home fibre: late by 82 ms
    typically, up to 301–663 ms; Tunnel: up to 390–455 ms; Rural 3G: 4–17 of 87 late by up to 438 ms), and the same
    setup varied between two runs (Home fibre scored 76, then 85). Causes seen: playlists expire at Cloudflare after
    5 minutes (`max-age=300`), and the next fetch is a MISS or REVALIDATED (about 100 ms more); segments were all
    cache hits (76–158 ms). The rest is unexplained (load on the real connection, the worker's fetch path), so the
    report names no cause for late starts: it gives typical and worst waits and quotes the measured latency as a
    fact. Late bytes mid-download came from pauses, not low speed: the real network averaged 48–71 Mbps.
- **Saved downloads for repeat runs (built 2026-10-20, the owner approved it on 2026-10-20):** the worker keeps what
  runs download in Cache Storage (`rebuffer-saved-v1`; rules in `src/core/netsim/saved.ts`, the worker side in
  `src/sw/saved.ts`) and answers later requests for the same URL from there, still shaped by the link.
  - What's kept: plain GETs (no `Range`) answered 200 and not marked `no-store`; playlists only when they can't
    change (a multivariant playlist, or a media playlist with `#EXT-X-ENDLIST`), never a live one. A copy is read
    alongside the original and saved once it has fully arrived, so an aborted download is never kept.
  - Budget: 300 MB, oldest first out, tracked in an index stored in the same cache (one update at a time).
  - Saved answers carry `saved: true` and no real-network timings, so the report counts them and leaves them out of
    the real speed. The check before the run still runs; its heads-up stays quiet when the stream is saved.
  - The result's "Forget saved downloads" button deletes the cache. The test file server's `/keep/` prefix serves
    cacheable files for the e2e test of a repeat run; elsewhere it sends `no-store`, so other tests always use the wire.
  - **Measured 2026-10-20** (Playwright Chromium on the owner's Mac, local build against media.azamatos.com, one
    browser profile): Tunnel four times scored 31, 25, 25, 25. Run 1 went over the real network (49 of 97 downloads
    started late, up to 782 ms) and the player chose differently; runs 2–4 matched exactly (first frame 0.41–0.42 s,
    one 1.1 s stall, 2.2 Mbps, 6 switches), with 89, 94 and then all 96 downloads from the saved copy (runs 2–3
    still fetched segments run 1 never picked). Home fibre three times: 89, then 90 and 90 (first frame 0.68 s, then
    0.10 and 0.11 s). So a setup's first run carries the real network's noise (its result says so) and the repeats
    show the simulated network alone.
- **Built 2026-10-18** (`src/core/netsim`, `src/sw`, `tests/e2e/shaper.spec.ts`):
  - A small Vite plugin bundles `src/sw/sw.ts` into one classic script at `/sw.js` (dev middleware and
    `dist/sw.js`). It is 98 KB minified, mostly zod; `zod/mini` could shrink it.
  - Sessions are keyed per tab. The page pings every 10 s (`keep-alive`) so the browser doesn't stop an idle worker.
  - A shaped response resolves at the simulated first byte (after the RTT), so hls.js measures TTFB from the
    simulation. `content-encoding` and the compressed `content-length` are dropped because the body arrives decoded.
  - Redirects go back to the page as a 302 after one simulated RTT, so it follows them itself and keeps the right
    final URL. WebKit only follows them when the redirect carries `Access-Control-Allow-Origin`.
  - `end-session` stops shaping new requests; in-flight ones get what the link holds at once, then the rest at the
    real network's speed.
  - **Measured accuracy** (4 Mbps steps, RTT 100 ms, 1 MiB; Chromium, Firefox, WebKit): 3–24 ms behind the curve,
    never ahead. Two parallel downloads each take twice as long, as they should.
- **Known limits:** the first visit needs the SW to take control (`skipWaiting` + `clients.claim`, wait for
  `controllerchange`); a hard reload bypasses it, so the Run page checks for a controller first. Safari's native
  HLS can't be shaped, which is fine: the lab plays through hls.js (MSE or ManagedMediaSource) everywhere.

## Player adapter and events

- `PlayerAdapter` interface: `load(url, settings)`, `destroy()`, and a stream of normalised `RunEvent`s.
- hls.js adapter (facts from hls.js 1.7.3 sources):
  - quality on screen: `LEVEL_SWITCHED`; requested: `LEVEL_SWITCHING`
  - downloads: `FRAG_LOADED` / `FRAG_BUFFERED` with `stats.loading.{start,first,end}`; emergency switch:
    `FRAG_LOAD_EMERGENCY_ABORTED`
  - estimate: `hls.bandwidthEstimate`, `hls.ttfbEstimate`, sampled every 250 ms
  - buffer: `hls.mainForwardBufferInfo.len` or `video.buffered`, sampled every 250 ms
  - stalls: video `waiting` → `playing` for exact timing; `BUFFER_STALLED_ERROR` and `STALL_RESOLVED` as a cross-check
  - dropped frames: `video.getVideoPlaybackQuality()` polled
- Defaults recorded with each run (hls.js 1.7.3): `abrEwmaFastVoD 3`, `abrEwmaSlowVoD 9`,
  `abrEwmaDefaultEstimate 500000`, `abrBandWidthFactor 0.95`, `abrBandWidthUpFactor 0.7`, `maxBufferLength 30`,
  `maxStarvationDelay 4`, `capLevelToPlayerSize false`, `testBandwidth true`.
- Player presets: **Defaults**; **Low-memory TV** (`maxBufferLength 10`, `maxMaxBufferLength 20`,
  `backBufferLength 10`, `capLevelToPlayerSize true`); **Quality first** (`abrBandWidthFactor 1`,
  `abrBandWidthUpFactor 0.9`); **Fast start** (`startLevel 0`).

## Routes (code-based TanStack Router, real paths; Pages serves `index.html` for unknown paths)

`/` home and setup · `/run` live run (`?stream=&network=|curve=&player=&set=`; `set` changes player settings from the
preset's, as `abrEwmaFastVoD:1.5`, within limits in `src/core/player/settings.ts`; `start=now` from Home's buttons
and the Report's starts it and is then dropped from the URL) · `/runs` saved runs · `/runs/$runId` a report (both lazy) · `/networks` network editor · `/inspect`
stream inspector · `/about`. Each route sets its own `<title>`. Headers and CSP live in `public/_headers`
(`connect-src` and `media-src` stay open because the lab plays any link).

## Architecture

```
src/
  core/            framework-free, unit-tested (no React, no DOM UI)
    hls/           playlist parser (multivariant + media), codec strings → names, lint rules with spec refs
    netsim/        curve model, link scheduler (fair share, RTT, outages), presets, trace import
    player/        PlayerAdapter interface, hls.js adapter (Shaka later)
    run/           RunController: SW session + player + clock → event log
    metrics/       event log → metrics, score, "what happened" notes, "try next" ideas
    persist/       IndexedDB: saved runs (built: `runs.ts`, light enough for Home; `summary.ts` with the metrics),
                   networks (planned)
  sw/              Service Worker: shaping transport (imports core/netsim), cache for repeat runs
  charts/          canvas charts: scales and labels (pure), drawing, the rAF loop that follows a run
  ui/              routes, screens, components (shadcn), hooks
content/traces/    trace excerpts as JSON + their licences and attribution
scripts/media/     download, encode the ladder, the flawed variant, subtitles, upload
tests/e2e/         Playwright specs; CI test stream made with ffmpeg
```

A run, step by step:
1. The Run screen asks `RunController.start(setup)`.
2. It checks that the SW controls the page, then registers the session (curve, RTT, origin, t0).
3. The hls.js adapter loads the stream; every request goes through the SW and is shaped.
4. The SW posts each request's timeline (start, first byte, end, bytes, late or not) to the page; the adapter emits
   player events. Both go into one append-only event log.
5. The charts subscribe to the log: each event goes into a timeline (`src/core/run/timeline.ts`: samples in parallel
   number arrays, quality on screen, stalls, one entry per video segment download), and a `requestAnimationFrame`
   loop draws it up to the run's clock. React renders only the frame around them, the tiles and the charts' text
   alternatives (a sentence each and a data table, from `chart-text.ts`), from a copy of the log taken 4 times a
   second.
6. At the end, `metrics` turns the log into numbers, notes and ideas (pure functions); the run (setup, versions,
   log, metrics) is saved to IndexedDB and the Report opens.

## Metrics and score

Definitions are in `productContext.md`. The score is the linear QoE model from Yin et al., SIGCOMM 2015 (bitrate
utility minus penalties for switches, rebuffering and startup, with the paper's weights), divided by the score of a
perfect run on the same ladder and shown out of 100. The formula is shown in the report. Not ITU-T P.1203: its
reference code is non-commercial research only, with patent notices.

## Stream inspector

- Own parser for RFC 8216 playlists (multivariant and media), tolerant of real-world quirks, with line numbers so
  findings can point at the source.
- Codec strings decoded to names (`avc1.640028` → H.264 High 4.0; `mp4a.40.2` → AAC-LC; HEVC, AV1, AC-3, E-AC-3).
- "Plays here" from `MediaSource.isTypeSupported` and Media Capabilities (`supported`, `smooth`, `powerEfficient`).
- Measured bitrate: fetch the first 3 segments of each rendition (byte ranges respected), outside any run session.
- Lint rules with severity and spec reference (RFC 8216 sections, Apple's HLS authoring spec). MVP set: segment over
  target duration, missing `CODECS` or `RESOLUTION`, declared bandwidth below measured peak, missing `ENDLIST` on VOD,
  version too low for the tags used, mixed containers, no I-frame playlists.
- Later: probe segments in a worker (keyframe at segment start, real codec vs declared) with a small TS/fMP4 reader.
- **Built 2026-10-18** (`src/core/hls`, 193 tests). Decisions where the specs left room: any EXTINF or
  TARGETDURATION makes a media playlist (as hls.js does); variables are substituted in URIs and quoted values only;
  a `.ts` URI counts as MPEG-TS even under an EXT-X-MAP; `duplicate-variant-uri` only fires when the media groups
  also match (Apple's examples reuse a video URI across audio groups); version rules cover RFC 8216 §7 only, not
  rfc8216bis; Apple references carry no section names (not confirmed). Rule ids: `src/core/hls/lint.ts`.

## Media and content

- **Sample film: the whole *Tears of Steel*, re-encoded, not cut.** The film is CC BY 3.0, but the soundtrack files
  in the download folder are CC BY-ND 3.0, so the lab only changes the format (allowed under ND), never cuts or
  remixes. Attribution: "(CC) Blender Foundation | mango.blender.org", plus "re-encoded for streaming". Source:
  `download.blender.org/demo/movies/ToS/tears_of_steel_1080p.mov.zip` (584 MB; the frame is really 1920×800).
  Official English subtitles (`/subtitles/`) become a WebVTT track.
- **Ladder** (H.264 High + AAC-LC, fMP4/CMAF, 4 s segments, separate audio, English WebVTT): targets 1920 wide 5.0
  Mbps, 1280 2.8, 960 1.6, 640 0.8, 426 0.4 (declared peaks came out 6.0, 3.3, 1.9, 0.94, 0.47). Labels use the
  width class (1080p, 720p…); the real frame is 2.4:1. 912 MB. URL:
  `https://media.azamatos.com/tears-of-steel/clean/master.m3u8`.
- **Version with problems** for the inspector: MPEG-TS, 6 s segments, segment 12 lasts 6.625 s under a 6 s target,
  720p encoded at 3.2 Mbps but declared 2.8, no `CODECS` on 540p and 240p, no I-frame playlists. 1.0 GB. URL:
  `https://media.azamatos.com/tears-of-steel/problems/master.m3u8`. Both made by `scripts/media/encode.mjs`.
- **Recorded traces:** excerpts of the Irish 4G dataset (Raca et al., MMSys 2018, CC BY 4.0, Zenodo 1219679), and maybe
  Lumos5G (CC BY 4.0), converted to our JSON with attribution and "excerpted and converted". Not bundled: Riiser
  HSDPA and Ghent 4G (no licence), Mahimahi (GPL repo), Puffer (no licence), NYU-METS (ODbL share-alike: only in
  its own folder if ever).
- **Third-party test streams** offered as links (all CORS-open on 2026-10-18, no SLA): Apple bipbop 16×9 (TS, 5
  rungs, subtitles, I-frames), Apple advanced fMP4 example, Unified Streaming Tears of Steel (TS, 5 rungs, 4 s),
  Mux Big Buck Bunny (TS, 10 s). Bitmovin's demo streams refuse other origins: don't use.
- **Hosting (live 2026-10-19):** R2 bucket `azamatos-media` on `media.azamatos.com`; `r2.dev` off. Segments carry
  `Cache-Control: public, max-age=31536000, immutable`, playlists `public, max-age=86400` (a day; it was 5 minutes
  until the owner re-uploaded the playlists on 2026-10-20); a zone cache rule ("media: cache
  segments and playlists", hostname equals media.azamatos.com, eligible for cache, edge TTL from Cache-Control)
  makes Cloudflare cache them. CORS allows any origin for GET and HEAD with `Range`
  (`scripts/media/r2-cors.json`); R2 sends `Vary: Origin`, and Cloudflare keeps one cached copy per origin, so the
  CORS header survives caching. Free tier: 10 GB-month, 1M Class A and 10M Class B operations, free egress.

## Performance budgets

| What | Budget |
|---|---|
| Home route JavaScript | ≤ 100 KB brotli, every script `index.html` loads (`.size-limit.js` reads the list from the built page: on 2026-10-20 the bundler briefly split React into a chunk named `settings-*.js`, which a file-name pattern missed). 90.4 KB on 2026-10-20, mostly React and TanStack Router. Lazy chunks: the Run screen, the Report, the Runs list and Home's recent runs, and hls.js (179 KB gzip, loaded when a run starts) |
| Live charts during a run | ≤ 4 ms per frame; no long task over 50 ms; dropped video frames with charts on equal those with charts off (4× CPU throttling) |
| Memory | JS heap flat over a 10-minute run; event log for 10 minutes < 5 MB |
| Lighthouse | ≥ 95 in every category on Home and a Report |

## Tests

- **Vitest:** parser (fixtures from the third-party streams, our own and edge cases), codec names, lint rules,
  link scheduler (exact byte schedules for given curves, fair sharing, RTT, outages), metrics and score on
  synthetic logs, notes and ideas, URL codec, trace import.
- **Playwright today** (Chromium, Firefox, WebKit; axe on every screen): `shell.spec.ts` (routes, skip link,
  keyboard navigation), `shaper.spec.ts` (byte-exact shaped downloads within tolerance, fair sharing, Range,
  redirects, aborts, the `*` wildcard), `run.spec.ts` (a full run on the synthetic stream started by keyboard, its
  charts' text and a data table, a repeat run from saved downloads; skipped in a browser build that can't decode
  H.264 through MSE), `home.spec.ts` (Home's setup by keyboard: own stream link, network, player, Run, then Stop on
  the Run screen; a bad link explained; the "Try the tunnel" link), `report.spec.ts` (a run saved and opened by
  keyboard, every section of the report, Export JSON, Copy link, the Runs list, Home's recent runs, Delete; axe on
  each). Shared helpers in `tests/e2e/helpers.ts`.
  Planned: Home → Run → Report, the network editor by keyboard, Inspect the version with problems.
- **Test stream:** `tests/e2e/fixtures/make-stream.mjs` (ffmpeg `testsrc2` + a tone, 3 rungs, 2 s segments, 20 s)
  writes `media/e2e/ladder/`; Playwright's global setup builds it once; `tests/e2e/servers/files.mjs` serves it
  cross-origin on port 4013 under `/hls/`, next to deterministic `/bytes/<size>` files. CI installs ffmpeg.
- **Determinism job:** each preset run 5× in Chromium; the spread is recorded and published.
- **Lighthouse CI** on Home and a Report built from a stored run; **size-limit** per route.

## Deploying

- **App:** Cloudflare Pages project `rebuffer` (build `pnpm build`, output `dist`, production branch `main`),
  connected to the GitHub repo. **Every push to `main` deploys** (checked 2026-10-20: the deployment and Cloudflare's
  GitHub check appear within seconds, the build takes about a minute). On 2026-10-19 pushes didn't trigger builds;
  what fixed it isn't recorded. By hand, if ever needed: a clean build of the commit, then `pnpm exec wrangler pages
  deploy dist --project-name rebuffer --branch main --commit-hash <sha>`.
- **Headers:** `public/_headers` sets the CSP (`connect-src` and `media-src` open, because the lab plays any link)
  and `X-Robots-Tag: noindex` for `*.pages.dev` addresses, so only rebuffer.azamatos.com is indexed.
- **Media:** `node scripts/media/upload.mjs` uploads `media/out/<name>` with wrangler (1,740 files for Tears of
  Steel; master playlists last; `--playlists` for playlists only); `scripts/media/README.md` has the commands.
- **What wrangler's login can't do** (owner, in the dashboard): DNS records, enabling R2, cache rules, API tokens,
  and the GitHub app's repository access.

## Risks

- Service Worker lifecycle quirks (first visit, hard reload, multiple tabs): gate runs on a controller, key sessions
  by client id, document it.
- Real Safari behaviour of shaped responses: test by hand on the owner's Mac before launch (streamed responses, CORS
  on redirects, stream cancel on abort, idle-worker shutdown).
- A cross-origin gzip-compressed response (some playlists) can't be detected by the worker: its forwarded size is the
  compressed one while the simulation counts decoded bytes. Small for playlists; segments are never compressed.
- An abort during the simulated RTT relies on `request.signal`; if an engine doesn't fire it, the request keeps its
  share until the real fetch ends.
- Timer clamping in hidden tabs: flag the run; pause the clock if the tab is hidden for long.
- Streams without CORS can't be inspected or run: clear message, paste-text fallback for the inspector.
- hls.js upgrades can change behaviour: version pinned and saved with every run.
