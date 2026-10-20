#!/usr/bin/env node
// Builds synthetic HLS streams for the tests from ffmpeg's test pattern and a tone: fMP4 with a separate audio track,
// like our real sample. Written to media/e2e/<name>/ (git-ignored; media never goes into git). Needs ffmpeg on PATH.
//   node make-stream.mjs            ladder: 20 s, three rungs (0.3, 1 and 2 Mbps), 2 s segments; the e2e tests
//   node make-stream.mjs --repeat   repeat: 2:00, five rungs at our film's bitrates, 4 s segments; the repeatability
//                                   job (tests/repeat/). Noise in the picture makes every rung fill its bitrate.
// Add --force to build it again.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const streams = {
  ladder: {
    durationS: 20,
    segmentS: 2,
    audioKbps: 64,
    noise: false,
    rungs: [
      { name: "720p", size: "1280x720", kbps: 2000 },
      { name: "480p", size: "854x480", kbps: 1000 },
      { name: "240p", size: "426x240", kbps: 300 },
    ],
  },
  // Video bitrates of our Tears of Steel encode (src/core/samples.ts, DEFAULT_LADDER, less its 128 kbps audio).
  repeat: {
    durationS: 120,
    segmentS: 4,
    audioKbps: 128,
    noise: true,
    rungs: [
      { name: "1080p", size: "1920x1080", kbps: 6000 },
      { name: "720p", size: "1280x720", kbps: 3300 },
      { name: "540p", size: "960x540", kbps: 1920 },
      { name: "360p", size: "640x360", kbps: 940 },
      { name: "240p", size: "426x240", kbps: 470 },
    ],
  },
};

const name = process.argv.includes("--repeat") ? "repeat" : "ladder";
const { durationS, segmentS, audioKbps, noise, rungs } = streams[name];
const out = resolve(import.meta.dirname, `../../../media/e2e/${name}`);
const force = process.argv.includes("--force");
if (existsSync(join(out, "master.m3u8")) && !force) process.exit(0);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const [width, height] = rungs[0].size.split("x");
const keyframes = String(24 * segmentS);
const args = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  `testsrc2=size=${width}x${height}:rate=24:duration=${durationS}`,
  "-f",
  "lavfi",
  "-i",
  `sine=frequency=440:sample_rate=48000:duration=${durationS}`,
  "-filter_complex",
  `[0:v]${noise ? "noise=alls=24:allf=t," : ""}split=${rungs.length}${rungs.map((_, i) => `[s${i}]`).join("")};` +
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
  `${audioKbps}k`,
  "-preset",
  "veryfast",
  "-pix_fmt",
  "yuv420p",
  "-g",
  keyframes,
  "-keyint_min",
  keyframes,
  "-sc_threshold",
  "0",
  "-f",
  "hls",
  "-hls_time",
  String(segmentS),
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
  console.error("Couldn't build the test stream. Is ffmpeg installed?");
  process.exit(result.status ?? 1);
}
console.log(`Test stream in ${out}`);
