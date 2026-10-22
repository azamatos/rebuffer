# Repeatability

AGENTS.md rule 2: the same setup gives the same result within a measured margin. This job measures that margin.

- `pnpm repeat` runs every network preset five times in Chromium, one run at a time, on a synthetic stream (2:00,
  five qualities at our film's bitrates, 4 s segments; `tests/e2e/fixtures/make-stream.mjs --repeat`) served from
  a local server, so the real network never holds a run back. It takes about an hour.
- `REPEAT_RUNS=3` changes the number of runs; `REPEAT_NETWORKS=lift,tunnel` picks networks; `REPEAT_STREAM=<url>`
  measures another stream (its first run goes over the real network, the rest play the browser's saved copy).
- Each network's runs land in `repeat-results/<id>.json`; `tests/repeat/summarize.mjs` writes
  `repeat-results/summary.md` with the spread of each number.
- On GitHub, `.github/workflows/repeat.yml` runs it by hand (Actions → Repeatability) and every Monday.

The README and the About page quote the latest table; update both when it changes.
