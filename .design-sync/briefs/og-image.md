# Rebuffer: the link preview image needs a real design

Rebuffer is a browser-only lab for HLS video streaming. A visitor picks a stream and a simulated network (a train
through a tunnel, a busy café, rural 3G, or a curve they draw), presses Run, and a real player (hls.js) plays through
it while live charts show what it does: the network's bandwidth, the quality on screen, the buffer, every stall. A
report scores the run out of 100, and Compare sets two runs side by side. Live at https://rebuffer.azamatos.com. This
project holds the app's tokens in both themes, its fonts, its stylesheet and its parts.

## What this image is for

It's the picture that appears when someone shares a link to Rebuffer: in a LinkedIn post (the owner's launch post),
in Telegram, Slack, X, iMessage and WhatsApp. It has one job: make a developer who scrolls past want to open the
link. It's seen small: often 300 to 500 px wide in a chat, about 550 px in a LinkedIn feed.

## What's wrong with the current one (`public/og.png`, the owner: "this image is awful")

- The chart is a cropped fragment in the bottom-right corner: a blue area that drops to nothing, with green and pink
  lines over it. Without labels it reads as random lines, not as "a network failing and a player reacting".
- The left half below the text is empty dark space; the image looks unfinished.
- The line under the headline is too small to read at chat size.
- The headline repeats the page title, which every app already prints above or below the image, so the image adds
  little.

## Facts it can draw on

- The app's look: the dark "instrument panel" (default) with one mint accent, and a light theme. The wordmark
  `➜ ~ rebuffer.azamatos▊` in Space Mono (shared with azamatos.com). Text in Geist.
- Chart colours mean one thing everywhere: blue the network, pink the player's estimate, green the quality on
  screen, purple the buffer, red a stall.
- Real shapes it could show: the tunnel preset is 6 Mbps, weaker from 0:20, no signal from 0:42 to 0:54, back to 6
  Mbps by 1:03. A typical run on it steps down from 720p to 360p, plays from its buffer through the dead zone, and
  climbs back. A stall is a red band. The report's score is out of 100.
- Anything that looks like data should be true to how the app behaves. If it shows a number, make it one the app
  could show, and don't present it as a measurement of a real network.

## Limits

- 1200 × 630 px, one image. LinkedIn and X show it about 1.91:1, X and some apps crop the edges a little, Telegram
  shows it whole. Nothing important near the edges.
- It's rendered by our own script: `scripts/og/card.html` is opened in Chromium at 1200 × 630 and photographed
  (`scripts/og/render.mjs`), so the design needs to work as one HTML page with CSS and inline SVG, using the app's
  fonts (Geist, Space Mono). No photos of people, no stock art, no other services' logos or artwork, no screenshots of
  the film (its soundtrack licence is CC BY-ND; the film itself is CC BY, but keep the image ours).
- Readable at 400 px wide: text that matters must survive being shrunk to a third.
- One image for every app, so it can't follow the viewer's theme: choose one.

## What to send back

The image (an HTML page we can render at 1200 × 630), with a note wherever you chose something this brief left open.
I'll check it at chat size and in LinkedIn's Post Inspector before it goes live.
