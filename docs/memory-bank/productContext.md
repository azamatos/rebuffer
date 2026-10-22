# Product spec

**Agreed 2026-10-18. Built by 2026-10-20: every screen below, including Compare; a light theme next to the dark one.** Screens follow the design proposal (canvas linked in
`activeContext.md`), accepted on 2026-10-18. The app is Rebuffer, at rebuffer.azamatos.com. The header carries the
family wordmark shared with azamatos.com and pass.azamatos.com: `➜ ~ rebuffer.azamatos▊`.

## Words used here

- **Stream:** an HLS multivariant ("master") playlist: the sample, a third-party sample, or a link the visitor pastes.
- **Ladder:** the stream's qualities (renditions), each with a bitrate, resolution and codecs.
- **Network:** bandwidth over time plus latency. A preset, a curve drawn in the editor, or an imported trace.
- **Player setup:** the player (hls.js; Shaka later) and its settings. Presets plus custom values.
- **Run:** one stream × network × player setup, played in real time. It produces an event log, metrics and a score.

## The 30-second path

The home page has one big action, **Try the tunnel**: the sample stream, the "Train through a tunnel" network,
hls.js defaults. One press starts a run; the charts react within seconds; the report appears at the end
(about 90 s). Everything else is optional.

## Screens

### Home

- One-line pitch, **Try the tunnel**, and a three-step setup: Stream → Network → Player → **Run**.
- Each step shows the current choice and opens its picker.
- **Recent runs** (from IndexedDB) with score, network and date; open one to see its report.
- Short "How it works" strip and a link to About.

### Inspect (stream)

- Input: paste any HLS link, paste playlist text, drop a `.m3u8` file, or pick a sample (ours, or public test
  streams from Apple, Unified Streaming and Mux).
- **Ladder table:** bandwidth and average bandwidth, resolution, frame rate, codecs decoded to plain words
  (`avc1.640028` → "H.264 High, level 4.0"; `mp4a.40.2` → "AAC-LC"), and whether *this* browser can play it
  (Media Capabilities: supported, smooth, power-efficient).
- Audio and subtitle groups, I-frame playlists, encryption method, container (fMP4 or MPEG-TS).
- **Per rendition:** VOD or live, target duration, segment count, total length, segment durations as a small
  histogram, discontinuities.
- **Measured bitrate:** fetch the first few segments of each rendition and compare the real bitrate with the
  declared one.
- **Warnings**, each with severity, the line it comes from, a plain explanation and the rule it breaks (RFC 8216
  or Apple's HLS authoring spec). Examples: a segment longer than the target duration, missing `CODECS`,
  declared bandwidth below the measured peak, a big gap between two rungs of the ladder.
- **Run this stream** goes to Home with the stream chosen.
- Blocked by CORS: a clear message ("this server doesn't let browsers read it") and the paste-text option.
- **Built 2026-10-20:** all of the above, with these choices: "Run this stream" opens the Run screen with the
  stream; measured peaks come from the sizes of the first 3 segments of each playlist (HEAD requests), with a
  separate audio track added segment by segment; a finding repeated across playlists is listed once with every
  file and line; under-declared variants offer "Run it on a N Mbps network" (a steady network 10% over what they
  declare). The link lives in the address (`/inspect?url=`).
- **Polished 2026-10-21 (M4.5):** the three ways in are tabs (Link, Paste text, File with a drop zone), each saying
  what it takes; samples, finding counts and the Segments panel's playlists are chips, each playlist's chip marked
  with its worst finding (its own, or its measured bandwidth against what it declares).

### Network

- Presets as cards with a sparkline (curves in `src/core/netsim/presets.ts`; the tunnel: 6 Mbps, 2.5 from 0:20, 1.2
  from 0:30, nothing 0:42–0:54, a ramp back to 3 by 1:00 and to 6 by 1:03): Home fibre, Busy café Wi-Fi, 4G commute,
  Train through a tunnel, Rural 3G,
  Lift (sudden drop), Evening congestion (our own synthetic curves).
- **Recorded traces:** real 4G recordings (train, car, tram…) from the Irish 4G dataset, CC BY 4.0, with credit.
- **Curve editor:** bandwidth (Mbps, log scale) over time. Add, move and delete points with the mouse **or the
  keyboard** (arrows move the selected point, Tab between points, Delete removes). Step or linear between points.
- The stream's ladder is drawn as horizontal lines over the curve, so you see where the network falls below each
  quality.
- Latency (RTT, ms) and run length. Import a trace as JSON, CSV or HAR (DevTools' "Export HAR": the throughput the
  page got, with a note that it isn't the line's capacity; built 2026-10-22); export CSV. JSON export was dropped on
  2026-10-22 (the owner's call): it did what CSV does, and nothing else reads it.
- **A network has a length, and a run lasts exactly that long** (or until the video ends; our film is 12:14, so runs
  end with the network). The length is what the curve covers: the simulator needs a bandwidth for every second, and
  a fixed length makes runs comparable. Presets run 1:00–2:00 (the Tunnel, the default, 1:30: long enough for the
  drop, the dead zone and the recovery); the recorded traces are 90 s excerpts. The editor's Length field takes 1 s
  to 1 hour (`CURVE_LIMITS.maxLengthS`); after the last point, its value holds to the end. (The owner asked why 1:30
  on 2026-10-20.)
- **Built 2026-10-20:** the list (presets, four recorded traces: train, car, bus and walking, 90 s each, with their
  credit; "Yours", saved in this browser; "+ New network"), the editor (log-scale chart with our film's five
  qualities as dashed lines; points moved by arrows, Shift for 5 s or the next quality line; `[` `]` for the point
  before or after, since Tab must leave the editor; N adds, Delete removes, Cmd/Ctrl+Z undoes; drag or double-click
  with a pointer; changes read out; a points table), the chosen point's time and bandwidth, the whole network's
  name, latency and length, steps or slopes, import JSON or CSV, export JSON and CSV, Save to my networks, Use in a
  run. The Report's "Change network" opens a run's network here and keeps its stream and player.
- **Polished 2026-10-21 (M4.5):** the list is compact rows in a sidebar that stays in view on wide screens; the
  editor's header holds Steps | Slopes, undo, redo, a `?` list of the keys (also the `?` key), **Save** and **Run
  with this network**; the points table is behind Chart | Table; import and export are one **Import / Export** menu.

### Player setup

- Player: hls.js (Shaka Player later).
- Presets: **hls.js defaults**, **Low-memory TV** (small buffers, capped to the player size), **Quality first**,
  **Fast start** (start at the lowest quality).
- Advanced: start level, max buffer length, back buffer, ABR bandwidth factors, cap to player size. Each setting
  has a one-line explanation and its default.

### Run (live)

- The video, with the current quality, resolution and bitrate over it.
- **Live tiles:** time to first frame, stalls (count and seconds), average bitrate, quality switches.
- **Charts on one shared time axis:**
  1. Network: available bandwidth (area), the player's estimate (line) and the selected quality's bitrate (steps).
  2. Buffer: seconds of video ahead (area), stalls as marked bands.
  3. Requests: one bar per segment download, coloured by quality.
  **Built 2026-10-20:** the network area fills up to the playhead and the rest of the curve is dashed (before a run
  the chart previews the whole network); the bandwidth axis is logarithmic, labelled by the ladder; stalls are red
  bands on the first two charts; the downloads lane shows video segments only, abandoned ones as dashed outlines.
  Each chart has a sentence (its accessible name, refreshed 4 times a second) and a data table behind a Chart | Table
  toggle in its header (since 2026-10-21; the table takes the chart's place).
- **Polished 2026-10-21 (M4.5):** the run's state is a chip (Ready, Checking your connection…, Running, Finished,
  Couldn't run); the progress bar glides with the run's clock; the first-run hint is one line; the event log sits
  under the video and tiles, newest first, and ends where the charts do.
- **Event log:** quality switches, stalls, abandoned downloads, errors; also announced in a polite live region.
- Controls: Stop, Restart. The run ends at the end of the network curve or the video.
- Before the run, a quick check measures the visitor's real latency to the stream's host. If it is above the
  simulated RTT, the screen says so while the run plays: the simulation can't start a download sooner than the real
  network answers.
- At the end, the result says in plain words whether the simulation held, keeping the causes apart: downloads that
  **started late** because the real latency is above the simulated one, downloads that **arrived late** because the
  real network couldn't keep up with the simulated bandwidth (with the speed it managed), and time the tab spent in
  the background.
- **Saved downloads (built 2026-10-20):** the browser keeps what runs download (up to 300 MB, what was used longest
  ago goes first; never what the server marks `no-store`, never a live playlist), and later runs take those
  downloads from there, still through the simulated network. Repeat runs of a setup then don't depend on the real
  network. Everything else goes over the real network, not the browser's own cache. The result says how many
  downloads came from the saved copy, and a button forgets it. When the stream is saved, the heads-up about real
  latency says that only the saved downloads skip it.

### Report

- **Score** (see Metrics) and tiles with one-line explanations.
- The same three charts, static, zoomable, with notes the lab writes: "0:42–0:54: bandwidth fell below the
  lowest quality (0.4 Mbps); the buffer ran out at 0:51; a stall of 2.1 s".
- Setup summary. Actions: **Run again**, **Change network**, **Compare with…**, **Copy link** (the link carries the
  setup, not the results) and **More actions** (Export JSON, Export HAR, Delete); Copy link and Export confirm in a toast. Export HAR
  (2026-10-22) saves the run's downloads as the simulation timed them, for DevTools' Network panel ("Import HAR
  file"); the file says the times are simulated.
- **Polished 2026-10-21 (M4.5):** the simulation check is a line under the title (a banner with details when the
  real network or a background tab shaped the run); the score shows its breakdown as bars; an eighth tile gives the
  real network's speed while downloading; "What happened" is one row per note; "Try next" a row of cards; each chart
  has Chart | Table in its header.
- **Built 2026-10-20 (first slice):** the score with its breakdown (quality, switches, stalls, startup), seven tiles
  with a line each, the three charts drawn from the saved log (each with its sentence and data table), the setup
  (stream, network, every player setting, browser and player size), the simulation check, how the score is
  computed; Run again (starts at once), Export JSON, Copy link, Delete. Runs are saved in IndexedDB (the newest 50);
  `/runs` lists them and Home shows the newest five under "Recent runs". The Run screen offers "See the report" at
  the end rather than opening it by itself, so the live result stays in view.
- **"What happened" (built 2026-10-20):** up to seven numbered notes, matching numbered markers on the bandwidth
  chart: the first frame, each stretch with no signal (how far the buffer ran down, whether playback carried on or
  stalled), groups of quality switches (with the network's low point, or the player's estimate when the network
  carried enough), abandoned downloads, and other stalls. A note names a cause only when the numbers show one; a
  stall the simulated network doesn't explain points to the simulation check.
- **"Try next" (built 2026-10-20):** up to three ideas, each this setup again with one change, started at once:
  stalls suggest more headroom (`abrBandWidthFactor` → 0.8), a longer buffer when it had filled (`maxBufferLength` ×2)
  or faster reactions (`abrEwmaFastVoD` → 1.5); six or more switches, a slower climb (`abrBandWidthUpFactor` → 0.5);
  a first frame after 2 s, the lowest quality first; a smooth run, the Low-memory TV preset or the tunnel. Changed
  settings travel in the run link as `set=` and show in headings ("hls.js defaults · abrBandWidthFactor 0.8").
- **Zoom (built 2026-10-20):** buttons above the charts (Zoom in, Zoom out, Earlier, Later, Whole run) with the
  stretch on view read out ("Showing 0:42–0:54 of 1:30"); a drag across any chart picks a stretch, a double-click
  shows the whole run; each note's "Show ↗" (named "Show on the chart" for screen readers) zooms to it, moves focus
  to the charts and rings the chart for a moment. The three charts
  zoom together, down to 4 s; the time axis, markers, sentences and tables follow the view, and the vertical scales
  stay those of the whole run.
- **Change network** (built 2026-10-20) opens the network editor with the run's network; **Compare with…** (built
  2026-10-20) opens Compare with this run as A.

### Compare (built 2026-10-20, `/runs/compare`)

- Two saved runs side by side: metric tiles with differences, charts overlaid on one time axis.
- **Built:** two pickers (native selects) and Swap; without a choice, the newest run is B and the one before it A;
  from a report, the newest other run is B. A card per run with its report; "What changed" (stream, network, player
  setup, each setting, hls.js version, browser; "the same setup" points to the run-to-run spread on About); every
  number with B against A in words and a verdict with a shape and a word (▲ better, ▼ worse, = same); three charts
  (quality on screen with the network, buffer, stall lanes), A as a solid line in the text colour and B dashed in the
  accent, each with a sentence, and one table for both runs. The Runs page links to it.

### About (built 2026-10-20)

- How the simulation works and its limits; how each metric is computed; sources.
- Credits: *Tears of Steel* and its licence; trace datasets if used; open-source libraries.
- Link to the source code and to azamatos.com.

## Metrics

| Metric | Definition |
|---|---|
| Time to first frame | From pressing Run to the first rendered frame |
| Stalls | Count and total seconds of playback waiting for data after the first frame (seeks excluded) |
| Rebuffer ratio | Stall time ÷ (play time + stall time) |
| Average bitrate | Time-weighted bitrate of the quality on screen |
| Quality switches | Changes of the quality on screen; up and down counted separately |
| Time at top quality | Share of play time at the highest quality that fits the player |
| Wasted data | Bytes downloaded but never played (abandoned or replaced segments) |
| Score | A published QoE model (proposal: the linear model from Yin et al., SIGCOMM 2015: bitrate utility minus penalties for switches, stalls and startup). The formula is shown in the report. |

## Content and licences

- **Sample:** the whole *Tears of Steel* (Blender Foundation, CC BY 3.0), re-encoded into a ladder but never cut:
  its soundtrack is CC BY-ND. Runs use the first minutes. Shown with "(CC) Blender Foundation | mango.blender.org"
  and "re-encoded for streaming".
- A second version of the same film with a deliberately flawed playlist and ladder, for the inspector's findings.
- **Recorded traces:** excerpts of the Irish 4G dataset (Raca et al., MMSys 2018, CC BY 4.0), converted, with
  attribution on the Networks screen and the About page. Only datasets whose licence allows redistribution.
- Third-party test streams appear only as labelled "try this" links that we don't host; they may disappear.
- Never commercial content, other services' artwork, or a past client's name, design or code.

## Privacy

Stream links, setups and runs stay in the visitor's browser (IndexedDB). Downloaded media is kept in the browser's
Cache Storage for repeat runs (up to 300 MB; the result has a button that forgets it). The only requests leave for
the stream's own host and our static files. Analytics: Cloudflare Web Analytics, no cookies.

## Accessibility

- Every screen works with the keyboard alone, including the curve editor.
- Every chart has a text alternative: a summary sentence and a data table.
- Live updates go to a polite live region (switches and stalls only, not every number).
- Contrast at least 4.5:1 in both themes (axe checks every screen in each), visible focus, `prefers-reduced-motion`
  respected.
- **Light and dark (built 2026-10-20):** System (the default), Light or Dark, from three radios in the header; kept
  in this browser.
- **First-run hint (built 2026-10-20):** the Run screen explains what each chart shows until "Got it".
