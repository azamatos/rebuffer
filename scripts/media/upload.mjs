#!/usr/bin/env node
/**
 * Uploads encoded streams to the R2 bucket behind media.azamatos.com with wrangler, so no separate R2 token is
 * needed: the owner's `wrangler login` is enough.
 *
 *   node scripts/media/upload.mjs                 # media/out/tears-of-steel → azamatos-media/tears-of-steel
 *   node scripts/media/upload.mjs --dry-run       # list what would be uploaded
 *   node scripts/media/upload.mjs --only clean    # one version
 *   node scripts/media/upload.mjs --playlists     # playlists only (say, to change their cache time)
 *
 * Segments never change for a given encode, so they're cached for a year. Playlists of a finished film don't change
 * either, but they're cached for a day only, so a fixed playlist shows up by the next day (or at once after a purge
 * in Cloudflare). Master playlists go last, so a half-uploaded stream is never advertised.
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};
const IMMUTABLE = "public, max-age=31536000, immutable";
const PLAYLIST = "public, max-age=86400";

const { values: args } = parseArgs({
  options: {
    bucket: { type: "string", default: "azamatos-media" },
    name: { type: "string", default: "tears-of-steel" },
    only: { type: "string" },
    playlists: { type: "boolean", default: false },
    concurrency: { type: "string", default: "8" },
    "dry-run": { type: "boolean", default: false },
  },
});

const root = resolve(import.meta.dirname, "../..");
const source = join(root, "media/out", args.name);
const wrangler = join(root, "node_modules/.bin/wrangler");

const files = (await readdir(source, { recursive: true }))
  .map((file) => join(source, file))
  .filter((path) => TYPES[extname(path)])
  .filter((path) => !args.only || relative(source, path).startsWith(`${args.only}/`))
  .filter((path) => !args.playlists || extname(path) === ".m3u8")
  // Masters last: nothing points at a stream until all of it is there.
  .sort((a, b) => Number(a.endsWith("master.m3u8")) - Number(b.endsWith("master.m3u8")));

console.log(`${files.length} files from ${source} to ${args.bucket}/${args.name}`);
let done = 0;
let failed = 0;
const queue = [...files];
await Promise.all(
  Array.from({ length: Number(args.concurrency) }, async () => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      const key = `${args.name}/${relative(source, path)}`;
      const type = TYPES[extname(path)];
      const cache = extname(path) === ".m3u8" ? PLAYLIST : IMMUTABLE;
      if (args["dry-run"]) {
        console.log(`${key}  ${type}  ${cache}`);
        continue;
      }
      const ok = await upload(key, path, type, cache);
      if (!ok) failed++;
      done++;
      if (done % 100 === 0 || done === files.length) console.log(`${done}/${files.length} uploaded`);
    }
  }),
);
if (failed > 0) {
  console.error(`${failed} files failed; run again to retry them.`);
  process.exit(1);
}

async function upload(key, path, type, cache, attempt = 1) {
  const code = await run(wrangler, [
    "r2",
    "object",
    "put",
    `${args.bucket}/${key}`,
    "--file",
    path,
    "--remote",
    "--content-type",
    type,
    "--cache-control",
    cache,
  ]);
  if (code === 0) return true;
  if (attempt < 3) return upload(key, path, type, cache, attempt + 1);
  console.error(`Failed: ${key}`);
  return false;
}

function run(command, commandArgs) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, commandArgs, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", () => resolvePromise(1));
    child.on("exit", (code) => {
      if (code !== 0) console.error(stderr.trim().split("\n").slice(-3).join("\n"));
      resolvePromise(code ?? 1);
    });
  });
}
