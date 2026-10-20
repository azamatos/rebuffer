# Rebuffer

> **Status: early development, live at [rebuffer.azamatos.com](https://rebuffer.azamatos.com).** A run already
> plays a real stream through the simulated network, with live charts, and scores it; the report, the network editor
> and the inspector are in progress.

See how a video player survives a bad network, in your browser. Pick a stream, pick a network ("train through a
tunnel", "busy café Wi-Fi", or a bandwidth curve you draw), press **Run**, and watch a real hls.js player fight
it: the bandwidth it gets, the quality it picks, the buffer draining, every stall. Then get a report with the
numbers viewers feel: time to first frame, stalls, average quality, quality switches.

## What you can do (planned)

- **Run** any HLS stream through a simulated network, with live charts and an event log.
- **Draw a network**: a bandwidth curve with the stream's quality ladder drawn over it, so you see where each
  quality stops fitting. Works with the keyboard too.
- **Tune the player**: hls.js defaults, a low-memory TV preset, or your own buffer and ABR settings.
- **Read the report**: a score from a published QoE model, notes on what happened when, export as JSON, share
  the setup as a link.
- **Inspect a playlist**: the ladder, codecs in plain words, tracks, segments, measured vs declared bitrates,
  and warnings with explanations.

Everything runs in your browser. There's no backend, and stream links you enter stay on your machine.

## Why it's hard (and what this shows)

- **A network simulator in a web page.** Segment bytes are released on the schedule a real link would allow,
  shared fairly between parallel downloads, so the player's own bandwidth estimator sees a realistic network.
- **Honest numbers.** The same setup gives the same result within a measured margin, and a run says so when
  your real connection was the bottleneck.
- **Live charts next to a playing video** at 60 fps, without stealing frames from the decoder.

## Content

The sample film is _Tears of Steel_, (CC) Blender Foundation | mango.blender.org, used under CC BY 3.0 and
re-encoded for streaming. Recorded network traces come from the Irish 4G dataset (Raca et al., 2018, CC BY 4.0),
excerpted and converted.

## Run it locally

Needs Node 22.12+ and pnpm 10.

```sh
pnpm install
pnpm dev          # http://localhost:4002
pnpm test         # unit tests
pnpm e2e          # keyboard and accessibility tests in Chromium, Firefox and WebKit
```

## Docs

- `AGENTS.md`: instructions for coding agents.
- `docs/memory-bank/`: the brief, product spec, technical plan, roadmap and current state.

Built by [Azamat Jorayev](https://azamatos.com), who has built HLS players for a video platform with 100k+
users and Smart TV apps.
