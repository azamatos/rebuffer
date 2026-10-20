# Recorded traces

`irish-4g.json` holds four 90 s excerpts of real 4G recordings, used as networks on the Networks screen and in run
links (`network=irish-4g-train`, `-car`, `-bus`, `-walking`).

**Source:** Darijo Raca, Jason J. Quinlan, Ahmed H. Zahran, Cormac J. Sreenan, “Beyond Throughput: a 4G LTE Dataset
with Channel and Context Metrics”, ACM MMSys 2018. Dataset: https://doi.org/10.5281/zenodo.1219679, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

**What we changed:** we took 90 s excerpts of the download throughput (`DL_bitrate`), one sample per second, in Mbps,
holding the last value over gaps in a recording. Every other column (location, cell, signal) is left out. The
latency (60 ms) is ours: the recordings don't measure one.

**Rebuild:** `pnpm traces:convert` downloads the dataset (2.2 MB) into `media/traces-source/` (git-ignored) and
writes `irish-4g.json`. The excerpts and why they were chosen are listed at the top of
`scripts/traces/convert-irish4g.mjs`.
