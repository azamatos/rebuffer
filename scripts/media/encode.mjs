#!/usr/bin/env node
/**
 * Builds the lab's sample streams from Blender Studio's "Tears of Steel" (CC BY 3.0).
 *
 *   node scripts/media/encode.mjs                 # the whole film, both versions
 *   node scripts/media/encode.mjs --duration 30   # a local test encode of the first 30 s (never upload it)
 *   node scripts/media/encode.mjs --only clean    # or --only problems
 *   node scripts/media/encode.mjs --only polish   # only re-apply the master playlist fixes to existing output
 *
 * Output (git-ignored):
 *   media/out/tears-of-steel/clean/      fMP4 (CMAF) ladder, 4 s segments, separate audio, English WebVTT
 *   media/out/tears-of-steel/problems/   MPEG-TS ladder with deliberate mistakes for the inspector demo
 *
 * The film is only re-encoded, never cut: its soundtrack is CC BY-ND (techContext.md, "Media and content").
 * Needs ffmpeg 7+ and unzip on PATH.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

const SOURCE_BASE = "https://download.blender.org/demo/movies/ToS";
const FILM_ZIP = "tears_of_steel_1080p.mov.zip";
const SUBTITLES = "subtitles/TOS-en.srt";

/** The ladder. Widths follow the 16:9 names (1080p…), heights keep the film's 2.4:1 frame. */
const LADDER = [
  { name: "1080p", width: 1920, kbps: 5000, profile: "high", level: "4.0" },
  { name: "720p", width: 1280, kbps: 2800, profile: "high", level: "3.1" },
  { name: "540p", width: 960, kbps: 1600, profile: "main", level: "3.1" },
  { name: "360p", width: 640, kbps: 800, profile: "main", level: "3.0" },
  { name: "240p", width: 426, kbps: 400, profile: "main", level: "3.0" },
];
const AUDIO_KBPS = 128;
const FPS = 24;

const { values: args } = parseArgs({
  options: {
    duration: { type: "string" },
    only: { type: "string" },
  },
});

const root = resolve(import.meta.dirname, "../..");
const sourceDir = join(root, "media/source");
const outRoot = join(root, args.duration ? "media/test-out" : "media/out", "tears-of-steel");
const duration = args.duration ? Number(args.duration) : undefined;
if (duration !== undefined && !(duration > 0)) throw new Error("--duration must be a positive number");

if (args.only === "polish") {
  for (const version of ["clean", "problems"]) await polishMaster(join(outRoot, version));
} else {
  await mkdir(sourceDir, { recursive: true });
  const film = await ensureFilm();
  const srt = await download(`${SOURCE_BASE}/${SUBTITLES}`, join(sourceDir, "TOS-en.srt"));
  if (args.only !== "problems") await encodeClean(film, srt);
  if (args.only !== "clean") await encodeProblems(film);
}
console.log(`\nDone: ${outRoot}`);

// --- the clean version -----------------------------------------------------------------------

async function encodeClean(input, subtitles) {
  const out = join(outRoot, "clean");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  console.log("\nEncoding the clean ladder (fMP4, 4 s segments)…");

  const gop = FPS * 4;
  await ffmpeg([
    ...inputArgs(input),
    "-filter_complex",
    splitAndScale(LADDER),
    ...LADDER.flatMap((rung, i) => [
      "-map",
      `[v${i}]`,
      ...videoArgs(i, rung, rung.kbps),
    ]),
    "-map",
    "0:a:0",
    "-c:a",
    "aac",
    "-b:a",
    `${AUDIO_KBPS}k`,
    "-ac",
    "2",
    "-g",
    String(gop),
    "-keyint_min",
    String(gop),
    "-sc_threshold",
    "0",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_flags",
    "independent_segments",
    "-hls_fmp4_init_filename",
    "init.mp4",
    "-hls_segment_filename",
    join(out, "%v/seg_%03d.m4s"),
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    [
      ...LADDER.map((rung, i) => `v:${i},agroup:aud,name:${rung.name}`),
      "a:0,agroup:aud,name:audio,language:en,default:yes",
    ].join(" "),
    join(out, "%v/index.m3u8"),
  ]);

  await addSubtitles(out, subtitles);
  await polishMaster(out);
}

/** Converts the official English .srt to WebVTT and adds it to the master playlist as a subtitle track. */
async function addSubtitles(out, srtPath) {
  const dir = join(out, "subs-en");
  await mkdir(dir, { recursive: true });
  const vttPath = join(dir, "en.vtt");
  await ffmpeg(["-i", srtPath, vttPath]);

  // Our fMP4 timeline starts at 0, so cue time 0 maps to media time 0.
  const vtt = await readFile(vttPath, "utf8");
  await writeFile(
    vttPath,
    vtt.replace(/^WEBVTT[^\n]*\n/, "WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:0,LOCAL:00:00:00.000\n"),
  );

  const length = duration ?? (await probeDuration(join(out, "master.m3u8")));
  await writeFile(
    join(dir, "index.m3u8"),
    [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${Math.ceil(length)}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-MEDIA-SEQUENCE:0",
      `#EXTINF:${length.toFixed(3)},`,
      "en.vtt",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
  );

  const masterPath = join(out, "master.m3u8");
  const lines = (await readFile(masterPath, "utf8")).split("\n");
  const media =
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="subs-en/index.m3u8"';
  const firstStreamInf = lines.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF:"));
  const patched = lines.map((line) => {
    if (line.startsWith("#EXT-X-STREAM-INF:")) return `${line},SUBTITLES="subs"`;
    // ffmpeg names the audio rendition after its stream index ("audio_5"); people read "English".
    if (line.startsWith("#EXT-X-MEDIA:TYPE=AUDIO")) return line.replace(/NAME="[^"]*"/, 'NAME="English"');
    return line;
  });
  patched.splice(firstStreamInf, 0, media);
  await writeFile(masterPath, patched.join("\n"));
}

// --- the version with problems ---------------------------------------------------------------

/**
 * The same film as MPEG-TS with 6 s segments and four planted mistakes, each one a finding the inspector
 * must report:
 *  1. Segment 12 lasts 6.6 s, but the playlist keeps EXT-X-TARGETDURATION at 6 (RFC 8216 §4.3.3.1).
 *  2. 720p is encoded at 3.2 Mbps but declares BANDWIDTH 2.8 Mbps (RFC 8216 §4.3.4.2).
 *  3. 540p and 240p lose their CODECS attribute.
 *  4. No I-frame playlists (ffmpeg doesn't write them), a note in Apple's authoring spec.
 */
async function encodeProblems(input) {
  const out = join(outRoot, "problems");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  console.log("\nEncoding the version with problems (MPEG-TS, 6 s segments)…");

  const ladder = LADDER.map((rung) => (rung.name === "720p" ? { ...rung, actualKbps: 3200 } : rung));
  // Keyframes every 6 s, except that the one at 72 s moves to 72.6 s, which makes segment 12 6.6 s long.
  const end = duration ?? 7200;
  const keyframes = [];
  for (let t = 0; t < end; t += 6) keyframes.push(t < 72 ? t : t + 0.6);

  await ffmpeg([
    ...inputArgs(input),
    "-filter_complex",
    splitAndScale(ladder),
    ...ladder.flatMap((rung, i) => [
      "-map",
      `[v${i}]`,
      ...videoArgs(i, rung, rung.actualKbps ?? rung.kbps),
      // Per stream: without a specifier ffmpeg applies forced keyframes to the first video stream only.
      `-force_key_frames:v:${i}`,
      keyframes.map((t) => t.toFixed(2)).join(","),
      // Forced keyframes must be IDR frames, or the HLS muxer won't cut segments at them.
      `-forced-idr:v:${i}`,
      "1",
      "-map",
      "0:a:0",
    ]),
    "-c:a",
    "aac",
    "-b:a",
    `${AUDIO_KBPS}k`,
    "-ac",
    "2",
    "-sc_threshold",
    "0",
    "-g",
    String(FPS * 30),
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "mpegts",
    "-hls_segment_filename",
    join(out, "%v/seg_%03d.ts"),
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    ladder.map((rung, i) => `v:${i},a:${i},name:${rung.name}`).join(" "),
    join(out, "%v/index.m3u8"),
  ]);

  // Mistake 1: keep the target duration at 6 although one segment is 6.6 s.
  for (const rung of ladder) {
    const path = join(out, rung.name, "index.m3u8");
    const playlist = await readFile(path, "utf8");
    await writeFile(path, playlist.replace(/#EXT-X-TARGETDURATION:\d+/, "#EXT-X-TARGETDURATION:6"));
  }

  // Mistakes 2 and 3 live in the master playlist.
  const masterPath = join(out, "master.m3u8");
  const lines = (await readFile(masterPath, "utf8")).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const uri = lines[i + 1] ?? "";
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    if (uri.startsWith("720p/")) {
      lines[i] = lines[i]
        .replace(/(^|[:,])BANDWIDTH=\d+/, "$1BANDWIDTH=2800000")
        .replace(/AVERAGE-BANDWIDTH=\d+/, "AVERAGE-BANDWIDTH=2500000");
    }
    if (uri.startsWith("540p/") || uri.startsWith("240p/")) {
      lines[i] = lines[i].replace(/,CODECS="[^"]*"/, "");
    }
  }
  await writeFile(masterPath, lines.join("\n"));
  await polishMaster(out);
}

/**
 * Adds what ffmpeg leaves out of the master playlist, so the inspector's findings point only at the planted
 * mistakes: EXT-X-INDEPENDENT-SEGMENTS (every segment starts with a keyframe), FRAME-RATE on video variants, and
 * the separate audio in BANDWIDTH and AVERAGE-BANDWIDTH (ffmpeg counts the video alone, but RFC 8216 §4.3.4.2 means
 * the whole variant: the inspector found this on 2026-10-20). Safe to run twice: the bit rates are measured afresh
 * from the segment files.
 */
async function polishMaster(dir) {
  const masterPath = join(dir, "master.m3u8");
  if (!existsSync(masterPath)) return;
  const lines = (await readFile(masterPath, "utf8")).split("\n");
  const audioUris = new Map(
    lines.flatMap((line) => {
      const group = /^#EXT-X-MEDIA:TYPE=AUDIO,.*GROUP-ID="([^"]+)".*URI="([^"]+)"/.exec(line);
      return group ? [[group[1], group[2]]] : [];
    }),
  );
  const polished = [];
  for (const [i, line] of lines.entries()) {
    let next =
      line.startsWith("#EXT-X-STREAM-INF:") && line.includes("RESOLUTION=") && !line.includes("FRAME-RATE=")
        ? line.replace(/(RESOLUTION=\d+x\d+)/, `$1,FRAME-RATE=${FPS.toFixed(3)}`)
        : line;
    const audio = /AUDIO="([^"]+)"/.exec(next)?.[1];
    if (next.startsWith("#EXT-X-STREAM-INF:") && audio && audioUris.has(audio)) {
      const { peak, average } = await variantBitrates(dir, lines[i + 1] ?? "", audioUris.get(audio));
      next = next
        .replace(/(^#EXT-X-STREAM-INF:|,)BANDWIDTH=\d+/, `$1BANDWIDTH=${peak}`)
        .replace(/AVERAGE-BANDWIDTH=\d+/, `AVERAGE-BANDWIDTH=${average}`);
    }
    polished.push(next);
  }
  if (!polished.includes("#EXT-X-INDEPENDENT-SEGMENTS")) {
    const version = polished.findIndex((line) => line.startsWith("#EXT-X-VERSION"));
    polished.splice(version + 1, 0, "#EXT-X-INDEPENDENT-SEGMENTS");
  }
  await writeFile(masterPath, polished.join("\n"));
}

/** Each segment's bit rate in a media playlist, from the files on disk, and the playlist's total bits and seconds. */
async function segmentBitrates(dir, playlistPath) {
  const folder = dirname(join(dir, playlistPath));
  const lines = (await readFile(join(dir, playlistPath), "utf8")).split("\n");
  const rates = [];
  let bits = 0;
  let seconds = 0;
  let duration;
  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) duration = Number.parseFloat(line.slice(8));
    else if (line && !line.startsWith("#") && duration) {
      const size = (await stat(join(folder, line))).size * 8;
      rates.push(size / duration);
      bits += size;
      seconds += duration;
    }
  }
  return { rates, bits, seconds };
}

/** A variant's peak and average bit rate with its separate audio: segment by segment, as RFC 8216 defines them. */
async function variantBitrates(dir, videoPath, audioPath) {
  const video = await segmentBitrates(dir, videoPath);
  const audio = await segmentBitrates(dir, audioPath);
  const audioPeak = Math.max(...audio.rates);
  const peak = Math.max(...video.rates.map((rate, i) => rate + (audio.rates[i] ?? audioPeak)));
  return {
    peak: Math.ceil(peak),
    average: Math.round((video.bits + audio.bits) / video.seconds),
  };
}

// --- ffmpeg helpers ---------------------------------------------------------------------------

function inputArgs(input) {
  return ["-hide_banner", "-y", "-i", input, ...(duration ? ["-t", String(duration)] : [])];
}

function splitAndScale(ladder) {
  const split = `[0:v]split=${ladder.length}${ladder.map((_, i) => `[s${i}]`).join("")}`;
  const scales = ladder.map((rung, i) => `[s${i}]scale=${rung.width}:-2:flags=lanczos[v${i}]`);
  return [split, ...scales].join(";");
}

function videoArgs(index, rung, kbps) {
  return [
    `-c:v:${index}`,
    "libx264",
    `-preset:v:${index}`,
    "slow",
    `-profile:v:${index}`,
    rung.profile,
    `-level:v:${index}`,
    rung.level,
    `-b:v:${index}`,
    `${kbps}k`,
    `-maxrate:v:${index}`,
    `${Math.round(kbps * 1.07)}k`,
    `-bufsize:v:${index}`,
    `${Math.round(kbps * 1.5)}k`,
    `-pix_fmt:v:${index}`,
    "yuv420p",
  ];
}

function ffmpeg(ffmpegArgs) {
  return run("ffmpeg", ["-loglevel", "warning", "-stats", ...ffmpegArgs]);
}

/** Sums the EXTINF durations of the first media playlist the master points to. */
async function probeDuration(masterPath) {
  const master = await readFile(masterPath, "utf8");
  const first = master.split("\n").find((line) => line && !line.startsWith("#"));
  if (!first) throw new Error(`No media playlist in ${masterPath}`);
  const media = await readFile(join(masterPath, "..", first), "utf8");
  return [...media.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
}

// --- downloads --------------------------------------------------------------------------------

async function ensureFilm() {
  const existing = (await readdir(sourceDir)).find((f) => f.endsWith(".mov"));
  if (existing) return join(sourceDir, existing);

  const zip = await download(`${SOURCE_BASE}/${FILM_ZIP}`, join(sourceDir, FILM_ZIP));
  await run("unzip", ["-o", "-q", zip, "-d", sourceDir]);
  const mov = (await readdir(sourceDir, { recursive: true })).find((f) => f.endsWith(".mov"));
  if (!mov) throw new Error(`No .mov inside ${FILM_ZIP}`);
  return join(sourceDir, mov);
}

async function download(url, path) {
  if (existsSync(path)) return path;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${path}.part`));
  await run("mv", [`${path}.part`, path]);
  return path;
}

function run(command, commandArgs) {
  return new Promise((resolvePromise, reject) => {
    if (process.env.MEDIA_DEBUG) console.log([command, ...commandArgs].join(" "));
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
