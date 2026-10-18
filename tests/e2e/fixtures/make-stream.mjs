#!/usr/bin/env node
// Builds a small synthetic HLS stream for the end-to-end tests: 20 s of ffmpeg's test pattern and a tone, three
// rungs (0.3, 1 and 2 Mbps), fMP4 with 2 s segments and a separate audio track, like our real sample. Written to
// media/e2e/ladder/ (git-ignored; media never goes into git). Needs ffmpeg on PATH.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(import.meta.dirname, "../../../media/e2e/ladder");
const force = process.argv.includes("--force");
if (existsSync(join(out, "master.m3u8")) && !force) process.exit(0);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const rungs = [
  { name: "720p", size: "1280x720", kbps: 2000 },
  { name: "480p", size: "854x480", kbps: 1000 },
  { name: "240p", size: "426x240", kbps: 300 },
];

const args = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=1280x720:rate=24:duration=20",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=48000:duration=20",
  "-filter_complex",
  `[0:v]split=${rungs.length}${rungs.map((_, i) => `[s${i}]`).join("")};` +
    rungs.map((rung, i) => `[s${i}]scale=${rung.size.replace("x", ":")}[v${i}]`).join(";"),
  ...rungs.flatMap((rung, i) => [
    "-map",
    `[v${i}]`,
    `-c:v:${i}`,
    "libx264",
    `-b:v:${i}`,
    `${rung.kbps}k`,
    `-maxrate:v:${i}`,
    `${rung.kbps}k`,
    `-bufsize:v:${i}`,
    `${rung.kbps}k`,
  ]),
  "-map",
  "1:a",
  "-c:a",
  "aac",
  "-b:a",
  "64k",
  "-preset",
  "veryfast",
  "-pix_fmt",
  "yuv420p",
  "-g",
  "48",
  "-keyint_min",
  "48",
  "-sc_threshold",
  "0",
  "-f",
  "hls",
  "-hls_time",
  "2",
  "-hls_playlist_type",
  "vod",
  "-hls_segment_type",
  "fmp4",
  "-hls_segment_filename",
  join(out, "%v/seg_%03d.m4s"),
  "-master_pl_name",
  "master.m3u8",
  "-var_stream_map",
  [
    ...rungs.map((rung, i) => `v:${i},agroup:aud,name:${rung.name}`),
    "a:0,agroup:aud,name:audio,language:en,default:yes",
  ].join(" "),
  join(out, "%v/index.m3u8"),
];

const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.status !== 0) {
  console.error("Couldn't build the e2e test stream. Is ffmpeg installed?");
  process.exit(result.status ?? 1);
}
console.log(`Test stream in ${out}`);
