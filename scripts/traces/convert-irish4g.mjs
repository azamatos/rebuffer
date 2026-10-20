// Turns excerpts of the Irish 4G dataset into the lab's recorded-trace networks: content/traces/irish-4g.json.
//
// Dataset: Raca, Quinlan, Zahran, Sreenan, "Beyond Throughput: a 4G LTE Dataset with Channel and Context Metrics",
// ACM MMSys 2018. CC BY 4.0. https://doi.org/10.5281/zenodo.1219679
//
// The zip (2.2 MB) is downloaded once into media/traces-source/ (git-ignored). Only the download throughput
// (DL_bitrate) of each excerpt is kept, one sample per second; location, cell and signal columns are left out.
//
//   pnpm traces:convert
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const SOURCE = join(ROOT, "media/traces-source/irish-4g");
const ZIP_URL = "https://zenodo.org/api/records/1219679/files/LTE_Dataset.zip/content";
const OUT = join(ROOT, "content/traces/irish-4g.json");

/** Seconds per excerpt: as long as the tunnel preset, so runs of either take as long. */
const LENGTH_S = 90;
/** The recordings have no latency; this typical 4G round trip is our assumption, and the descriptions say so. */
const RTT_MS = 60;

// Chosen on 2026-10-20 for a story against our film's ladder (0.47–6 Mbps): a scan of every 90 s window (by elapsed
// time, gaps held) for a usable average, at least 8 s below 1 Mbps and 15 s above 6 Mbps; then a look at each.
const EXCERPTS = [
  {
    id: "irish-4g-train",
    name: "Train, 4G",
    file: "train/A_2018.02.02_11.21.55.csv",
    fromS: 170,
    description: "5–19 Mbps for 45 s, then 1–3 Mbps, then no signal for the last 15 s.",
  },
  {
    id: "irish-4g-car",
    name: "Car, 4G",
    file: "car/A_2017.12.06_14.30.04.csv",
    fromS: 350,
    description: "Weak at first, 10 s with no signal from 0:15, then 3–9 Mbps, fading at the end.",
  },
  {
    id: "irish-4g-bus",
    name: "Bus, 4G",
    file: "bus/A_2018.01.25_19.50.40.csv",
    fromS: 40,
    description: "1–2 Mbps for over a minute, then a climb to 5–14 Mbps.",
  },
  {
    id: "irish-4g-walking",
    name: "Walking, 4G",
    file: "pedestrian/A_2017.11.30_08.18.06.csv",
    fromS: 500,
    description: "Around 1 Mbps for 40 s, then a climb to 7–12 Mbps.",
  },
];

function ensureDataset() {
  if (existsSync(join(SOURCE, "Dataset"))) return;
  mkdirSync(SOURCE, { recursive: true });
  const zip = join(SOURCE, "LTE_Dataset.zip");
  console.log(`Downloading ${ZIP_URL}`);
  execFileSync("curl", ["-sSfL", "--max-time", "120", "-o", zip, ZIP_URL]);
  execFileSync("unzip", ["-q", "-o", zip, "-d", SOURCE]);
}

/** "2017.11.25_12.05.26" → seconds since the epoch (the clock's own zone doesn't matter: only differences count). */
function seconds(stamp) {
  const match = /^(\d{4})\.(\d\d)\.(\d\d)_(\d\d)\.(\d\d)\.(\d\d)$/.exec(stamp);
  if (!match) throw new Error(`Unexpected timestamp ${JSON.stringify(stamp)}`);
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
}

/** One sample per second (the first row of each), as seconds from the recording's start and Mbps. */
function readSamples(path) {
  const [header, ...rows] = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  const time = columns.indexOf("Timestamp");
  const rate = columns.indexOf("DL_bitrate");
  const samples = [];
  let start;
  let previous;
  for (const row of rows) {
    const cells = row.split(",");
    const t = seconds(cells[time]);
    if (t === previous) continue;
    previous = t;
    start ??= t;
    const kbps = Number(cells[rate]);
    if (Number.isFinite(kbps)) samples.push({ t: t - start, mbps: Math.round(kbps / 10) / 100 });
  }
  return samples;
}

/** The excerpt from `fromS` for LENGTH_S seconds as steps; a gap in the recording holds the value before it. */
function excerpt(samples, fromS) {
  const before = samples.findLast((sample) => sample.t <= fromS);
  if (!before) throw new Error(`No sample at or before ${fromS} s`);
  const points = [{ t: 0, mbps: before.mbps }];
  for (const sample of samples) {
    if (sample.t <= fromS || sample.t >= fromS + LENGTH_S) continue;
    const t = sample.t - fromS;
    if (sample.mbps !== points.at(-1).mbps) points.push({ t, mbps: sample.mbps });
  }
  return points;
}

ensureDataset();
const traces = EXCERPTS.map(({ file, fromS, ...rest }) => {
  const points = excerpt(readSamples(join(SOURCE, "Dataset", file)), fromS);
  return {
    ...rest,
    source: { file, fromS },
    curve: { shape: "steps", rttMs: RTT_MS, lengthS: LENGTH_S, points },
  };
});

mkdirSync(join(ROOT, "content/traces"), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      format: "rebuffer-traces",
      version: 1,
      dataset: "Beyond Throughput: a 4G LTE Dataset with Channel and Context Metrics",
      authors: "Darijo Raca, Jason J. Quinlan, Ahmed H. Zahran, Cormac J. Sreenan",
      citation: "Raca et al., ACM MMSys 2018",
      licence: "CC BY 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://doi.org/10.5281/zenodo.1219679",
      changes: `${LENGTH_S} s excerpts of the download throughput (DL_bitrate), one sample per second, in Mbps. The latency (${RTT_MS} ms) is ours: the recordings don't have one.`,
      traces,
    },
    null,
    2,
  )}\n`,
);
for (const trace of traces) {
  const rates = trace.curve.points.map((point) => point.mbps);
  console.log(
    `${trace.id}: ${trace.curve.points.length} points, ${Math.min(...rates)}–${Math.max(...rates)} Mbps`,
  );
}
console.log(`Wrote ${OUT}`);
