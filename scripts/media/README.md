# Sample media

The lab's own sample streams, built from Blender Studio's *Tears of Steel* (CC BY 3.0). Outputs go to `media/`,
which git ignores: media files never go into the repo (AGENTS.md rule 7).

## Encode

```sh
pnpm media:encode                 # the whole film: clean ladder + the version with problems (~1 GB)
pnpm media:encode --duration 30   # a quick local test of the first 30 s, written to media/test-out/
pnpm media:encode --only clean    # one version only (or --only problems)
pnpm media:encode --only polish   # re-apply the master playlist fixes to existing output
```

Needs ffmpeg 7+ and `unzip`. Set `MEDIA_DEBUG=1` to print every command. The first run downloads the 584 MB source film and the official English subtitles
from download.blender.org into `media/source/`.

- `media/out/tears-of-steel/clean/`: fMP4 (CMAF), 4 s segments, five rungs from 0.4 to 5.0 Mbps, one AAC audio
  track, English WebVTT subtitles.
- `media/out/tears-of-steel/problems/`: MPEG-TS, 6 s segments, with four planted mistakes for the inspector
  (listed at the top of `encode.mjs`).

The film is re-encoded but never cut: its soundtrack is CC BY-ND. Test encodes made with `--duration` are for
local checks only; never upload them.

## Upload

The bucket `azamatos-media` (Cloudflare R2) serves `media.azamatos.com`. The upload uses wrangler, so the owner's
`wrangler login` is all it needs; no R2 token is created or stored.

```sh
node scripts/media/upload.mjs --dry-run   # what would go where, with content types and cache headers
node scripts/media/upload.mjs             # media/out/tears-of-steel → azamatos-media/tears-of-steel
```

Segments are cached for a year (`immutable`), playlists for a day (since 2026-10-20); master playlists go last. To
replace a playlist at once, a purge by URL isn't enough: R2 answers browsers with `Vary: Origin`, so Cloudflare keeps
a copy per page origin, and the dashboard's URL purge clears only the copy without one (seen 2026-10-20). Purge
everything, or purge by URL through the API with the `Origin` header, or wait a day. `--playlists` uploads playlists only, `--only clean` one version. CORS lets any
site read the files (GET and HEAD, `Range`), like public test streams; it's set once:

```sh
pnpm exec wrangler r2 bucket cors set azamatos-media --file scripts/media/r2-cors.json
```

Re-encoding with different settings goes to a new folder name (for example `tears-of-steel-v2`), so cached segments
are never stale.
