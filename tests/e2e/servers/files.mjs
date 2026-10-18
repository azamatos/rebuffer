// A cross-origin file server for the shaper tests, on port 4013 (no dependencies).
//   GET /bytes/<size>      <size> deterministic bytes: byte i is i % 251, so a lost or reordered
//                          chunk shows up in a checksum. Supports Range and HEAD.
//   GET /redirect/<size>   302 to /bytes/<size>
//   GET /                  "ok", for Playwright's readiness check
// Every response allows any origin and is never cached, so each download really goes over the wire.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4013);
const MAX_SIZE = 64 * 1024 * 1024;

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

function sendBytes(request, response, size) {
  const range = request.headers.range;
  let [start, end, status] = [0, size, 200];
  const headers = {
    ...corsHeaders,
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "OPTIONS") {
    response.writeHead(204, { ...corsHeaders, "Access-Control-Allow-Methods": "GET, HEAD" }).end();
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
    sendBytes(request, response, size);
  }
});

server.listen(PORT, () => {
  console.log(`Test files on http://localhost:${PORT}`);
});
