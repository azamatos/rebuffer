# Sample media

The lab's own sample streams, built from Blender Studio's *Tears of Steel* (CC BY 3.0). Outputs go to `media/`,
which git ignores: media files never go into the repo (AGENTS.md rule 7).

## Encode

```sh
pnpm media:encode                 # the whole film: clean ladder + the version with problems (~1 GB)
pnpm media:encode --duration 30   # a quick local test of the first 30 s, written to media/test-out/
pnpm media:encode --only clean    # one version only (or --only problems)
```

Needs ffmpeg 7+ and `unzip`. Set `MEDIA_DEBUG=1` to print every command. The first run downloads the 584 MB source film and the official English subtitles
from download.blender.org into `media/source/`.

- `media/out/tears-of-steel/clean/`: fMP4 (CMAF), 4 s segments, five rungs from 0.4 to 5.0 Mbps, one AAC audio
  track, English WebVTT subtitles.
- `media/out/tears-of-steel/problems/`: MPEG-TS, 6 s segments, with four planted mistakes for the inspector
  (listed at the top of `encode.mjs`).

The film is re-encoded but never cut: its soundtrack is CC BY-ND. Test encodes made with `--duration` are for
local checks only; never upload them.

## Upload (the owner runs this)

The bucket lives in Cloudflare R2 behind `media.azamatos.com`. Credentials stay on the owner's machine (an R2 API
token configured as an rclone remote named `r2`); never paste them into chat or commit them.

```sh
# once: allow the app's origins to read the files
wrangler r2 bucket cors set <bucket> --file scripts/media/r2-cors.json

# each upload: long cache, immutable (file names never change for a given encode)
rclone copy media/out/tears-of-steel r2:<bucket>/tears-of-steel \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --progress
```

Re-encoding with different settings goes to a new folder name (for example `tears-of-steel-v2`), so cached files
are never stale.
