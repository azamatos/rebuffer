// A cross-origin file server for the shaper tests, on port 4013 (no dependencies).
//   GET /bytes/<size>      <size> deterministic bytes: byte i is i % 251, so a lost or reordered
//                          chunk shows up in a checksum. Supports Range and HEAD.
//   GET /redirect/<size>   302 to /bytes/<size>
//   GET /hls/<path>        files of the synthetic test stream in media/e2e/ (tests/e2e/fixtures/make-stream.mjs)
//   GET /slow/<ms>/<path>  any of the above, answered <ms> later: a server farther away than the simulated RTT.
//                          Relative links in a playlist keep the prefix, so a whole stream can be slow.
//   GET /keep/<path>       any of the above, cacheable: the lab may save it for repeat runs.
//   GET /                  "ok", for Playwright's readiness check
// Every response allows any origin. Outside /keep/ none may be stored, so each download really goes over the wire.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 4013);
const MAX_SIZE = 64 * 1024 * 1024;
const HLS_ROOT = resolve(import.meta.dirname, "../../../media/e2e");
const HLS_TYPES = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4s": "video/iso.segment",
  ".mp4": "video/mp4",
  ".ts": "video/mp2t",
  ".vtt": "text/vtt",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  "Cache-Control": "no-store",
};

function bytes(start, end) {
  const body = Buffer.alloc(end - start);
  for (let i = start; i < end; i++) body[i - start] = i % 251;
  return body;
}

/** Parses one "bytes=a-b", "bytes=a-" or "bytes=-n" range; returns [start, end) or null if unsatisfiable. */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size : Math.min(size, Number(match[2]) + 1);
  }
  return start < end ? [start, end] : null;
}

/** The common headers; `keep` lets caches store the response. */
const commonHeaders = (keep) =>
  keep ? { ...corsHeaders, "Cache-Control": "public, max-age=3600" } : corsHeaders;

function sendBytes(request, response, size, keep) {
  const range = request.headers.range;
  let [start, end, status] = [0, size, 200];
  const headers = {
    ...commonHeaders(keep),
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  if (range) {
    const parsed = parseRange(range, size);
    if (!parsed) {
      response.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }).end();
      return;
    }
    [start, end] = parsed;
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end - 1}/${size}`;
  }
  headers["Content-Length"] = String(end - start);
  response.writeHead(status, headers);
  response.end(request.method === "HEAD" ? undefined : bytes(start, end));
}

async function sendHlsFile(response, path, keep) {
  const file = normalize(join(HLS_ROOT, path));
  const type = HLS_TYPES[extname(file)];
  if (!file.startsWith(HLS_ROOT + "/") || !type) {
    response.writeHead(404, { ...corsHeaders, "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      ...commonHeaders(keep),
      "Content-Type": type,
      "Content-Length": body.length,
    });
    response.end(body);
  } catch {
    response.writeHead(404, { ...corsHeaders, "Content-Type": "text/plain" }).end("Not found");
  }
}

function handle(request, response, url, keep = false) {
  const slow = /^\/slow\/(\d+)(\/.*)$/.exec(url.pathname);
  if (slow) {
    url.pathname = slow[2];
    setTimeout(
      () => {
        handle(request, response, url, keep);
      },
      Math.min(Number(slow[1]), 10_000),
    );
    return;
  }
  const kept = /^\/keep(\/.*)$/.exec(url.pathname);
  if (kept) {
    url.pathname = kept[1];
    handle(request, response, url, true);
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, { ...corsHeaders, "Access-Control-Allow-Methods": "GET, HEAD" }).end();
    return;
  }
  if (url.pathname.startsWith("/hls/")) {
    void sendHlsFile(response, url.pathname.slice("/hls/".length), keep);
    return;
  }
  const match = /^\/(bytes|redirect)\/(\d+)$/.exec(url.pathname);
  const size = match ? Number(match[2]) : NaN;
  if (url.pathname === "/") {
    response.writeHead(200, { ...corsHeaders, "Content-Type": "text/plain" }).end("ok");
  } else if (!match || size > MAX_SIZE) {
    response.writeHead(404, { ...corsHeaders, "Content-Type": "text/plain" }).end("Not found");
  } else if (match[1] === "redirect") {
    response.writeHead(302, { ...corsHeaders, Location: `/bytes/${size}${url.search}` }).end();
  } else {
    sendBytes(request, response, size, keep);
  }
}

const server = createServer((request, response) => {
  handle(request, response, new URL(request.url ?? "/", "http://localhost"));
});

server.listen(PORT, () => {
  console.log(`Test files on http://localhost:${PORT}`);
});
