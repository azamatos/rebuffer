# Technical plan

**Agreed 2026-10-18; the M0 scaffold exists, the lab itself isn't built yet.** Versions and API facts were checked on 2026-10-18 (`npm view`,
package sources, a scratch Playwright test). Items marked **open** wait for the owner (`activeContext.md`).

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
| Charts | uPlot + our own canvas lane | 1.6.32 | Small, fast canvas time series with stepped paths and draw hooks. Quiet since 2025-03, so it sits behind our own chart interface |
| Validation | zod | 4.6 | Imported traces, exported runs, URL state |
| Storage | idb-keyval (IndexedDB) | 6.3 | Saved runs and networks; small API |
| Unit tests | Vitest | 5.0 | Core logic, with fake timers for the simulator |
| E2E and a11y | Playwright + @axe-core/playwright | 1.64 / 4.14 | Chromium, Firefox, WebKit |
| Budgets | size-limit, Lighthouse CI | 14.2 / 0.15 | Bundle size per route; Lighthouse ≥ 95 |
| Lint, format | ESLint flat + typescript-eslint, Prettier | 10.13 / 3.9 | Owner's default |
| Runtime | Node ≥ 22.12, pnpm 10 | — | Owner's default; Vite 8 needs Node 20.19+ or 22.12+ |
| Hosting | Cloudflare Pages at rebuffer.azamatos.com, R2 at media.azamatos.com, Web Analytics | wrangler 4.151 | Free tiers; R2 is the route Cloudflare's terms allow for video |
| Fonts | Geist (variable) and Space Mono, self-hosted via Fontsource | 5.3 | Same faces as azamatos.com; no third-party font requests |

## How the network is simulated

**Decision proposed: a Service Worker shapes the player's own requests.**

- During a run, the page registers a *session* with the Service Worker: the network curve, the latency, the stream's
  origin and the start time. The SW intercepts requests from that page to that origin and answers each one with a
  `Response` whose body it releases on the schedule the curve allows. Bytes come from the real network (and
  Cache Storage for repeat runs).
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
  simulation released them. If the real network was late, the request and the run are flagged. Hidden tabs
  (throttled timers) are flagged too. Repeat runs of each preset in CI measure the spread that the README states.
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

`/` home and setup · `/run` live run · `/runs` saved runs and reports · `/networks` network editor · `/inspect`
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
    persist/       IndexedDB (runs, networks), URL setup codec
  sw/              Service Worker: shaping transport (imports core/netsim), cache for repeat runs
  charts/          uPlot wrappers, request lane on canvas, ring buffers, rAF loop
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
5. Charts read ring buffers fed from the log on `requestAnimationFrame`; React renders only the frame around them
   and the tiles (throttled to 4 Hz).
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
- **Ladder** (H.264 High + AAC-LC, fMP4/CMAF, 4 s segments): 1920 wide 5.0 Mbps, 1280 2.8, 960 1.6, 640 0.8,
  426 0.4. Labels use the width class (1080p, 720p…) and the inspector shows the real 2.4:1 size. About 1 GB in R2
  for the whole film.
- **"With problems" variant** for the inspector: MPEG-TS, 6 s segments, one 6.6 s segment, under-declared bandwidth,
  missing `CODECS` on two rungs. Made by the same script.
- **Recorded traces:** excerpts of the Irish 4G dataset (Raca et al., MMSys 2018, CC BY 4.0, Zenodo 1219679), and maybe
  Lumos5G (CC BY 4.0), converted to our JSON with attribution and "excerpted and converted". Not bundled: Riiser
  HSDPA and Ghent 4G (no licence), Mahimahi (GPL repo), Puffer (no licence), NYU-METS (ODbL share-alike: only in
  its own folder if ever).
- **Third-party test streams** offered as links (all CORS-open on 2026-10-18, no SLA): Apple bipbop 16×9 (TS, 5
  rungs, subtitles, I-frames), Apple advanced fMP4 example, Unified Streaming Tears of Steel (TS, 5 rungs, 4 s),
  Mux Big Buck Bunny (TS, 10 s). Bitmovin's demo streams refuse other origins: don't use.
- **Hosting:** R2 bucket on `media.azamatos.com` (media files only; `r2.dev` is rate-limited and for development
  only), long cache headers, CORS for the app's origins (`scripts/media/r2-cors.json`). Free tier: 10 GB-month, 1M Class A and 10M
  Class B operations, free egress. **Open:** the owner creates the bucket; Cloudflare may require a payment method
  on file to enable R2 (not verified).

## Performance budgets

| What | Budget |
|---|---|
| Home route JavaScript | ≤ 100 KB brotli (`.size-limit.json`). 85.4 KB on 2026-10-18, almost all React and TanStack Router. The Run screen is a lazy chunk (34 KB gzip) and hls.js another (179 KB gzip, loaded when a run starts) |
| Live charts during a run | ≤ 4 ms per frame; no long task over 50 ms; dropped video frames with charts on equal those with charts off (4× CPU throttling) |
| Memory | JS heap flat over a 10-minute run; event log for 10 minutes < 5 MB |
| Lighthouse | ≥ 95 in every category on Home and a Report |

## Tests

- **Vitest:** parser (fixtures from the third-party streams, our own and edge cases), codec names, lint rules,
  link scheduler (exact byte schedules for given curves, fair sharing, RTT, outages), metrics and score on
  synthetic logs, notes and ideas, URL codec, trace import.
- **Playwright** (keyboard only, axe on every screen): Home → Try the tunnel (a 20 s CI curve) → Report; network
  editor moved point by point with arrows; Inspect the "with problems" sample → findings; SW shaping test (1 MB
  through a known curve, duration within tolerance) in Chromium, Firefox and WebKit.
- **CI test stream:** ffmpeg `testsrc` + sine, 3 rungs, 2 s segments, 30 s, generated in CI (media never in git).
- **Determinism job:** each preset run 5× in Chromium; the spread is recorded and published.
- **Lighthouse CI** on Home and a Report built from a stored run; **size-limit** per route.

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
