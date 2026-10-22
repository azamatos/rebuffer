import { RUN_VERSION, type SavedRun } from "@/core/persist/runs";
import { eventsOfType } from "./events";

/**
 * A run's downloads as a HAR file (HTTP Archive 1.2), to open in a browser's developer tools ("Import HAR file") as a
 * waterfall. Its times are what the simulated network gave the player, not a measurement of a real network, and the
 * file says so (AGENTS.md rule 2). It holds addresses, statuses, sizes and times: no headers, cookies or bodies.
 */

export interface HarEntry {
  pageref: string;
  startedDateTime: string;
  /** ms */
  time: number;
  request: {
    method: "GET";
    url: string;
    httpVersion: string;
    cookies: [];
    headers: [];
    queryString: { name: string; value: string }[];
    headersSize: -1;
    bodySize: 0;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: [];
    headers: [];
    content: { size: number; mimeType: string };
    redirectURL: string;
    headersSize: -1;
    bodySize: number;
    /** Chrome's own field, which its Network panel shows as the size. */
    _transferSize: number;
    /** Chrome's own field: why the request failed. */
    _error?: string;
  };
  cache: Record<string, never>;
  /** ms; -1 is "doesn't apply". The simulation has no DNS, connection or TLS of its own: its latency is in `wait`. */
  timings: {
    blocked: -1;
    dns: -1;
    connect: -1;
    ssl: -1;
    send: 0;
    wait: number;
    receive: number;
  };
  comment?: string;
}

export interface Har {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    browser: { name: string; version: string };
    pages: {
      startedDateTime: string;
      id: string;
      title: string;
      pageTimings: { onContentLoad: -1; onLoad: -1 };
    }[];
    entries: HarEntry[];
    comment: string;
  };
}

const PAGE_ID = "run";

/** Media types by file extension; a run's log doesn't keep the server's Content-Type. */
const MEDIA_TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
  m4v: "video/mp4",
  m4a: "audio/mp4",
  ts: "video/mp2t",
  aac: "audio/aac",
  vtt: "text/vtt",
  webvtt: "text/vtt",
};

/** One download, put together from its events. */
interface Download {
  url: string;
  start: number;
  firstByte: number | undefined;
  /** When it ended, failed or was given up; undefined if the run ended first. */
  end: number | undefined;
  outcome: "end" | "abort" | "error" | undefined;
  status: number | undefined;
  bytes: number;
  saved: boolean;
}

/** Seconds to HAR's milliseconds, to the microsecond. */
const ms = (seconds: number) => Math.round(Math.max(0, seconds) * 1e6) / 1e3;

function mediaType(url: string): string {
  try {
    const extension = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
    return (extension && MEDIA_TYPES[extension]) ?? "";
  } catch {
    return "";
  }
}

function queryString(url: string): { name: string; value: string }[] {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function downloads(run: SavedRun): Download[] {
  const byId = new Map<string, Download>();
  for (const event of eventsOfType(run.events, "request")) {
    let download = byId.get(event.id);
    if (!download) {
      download = {
        url: event.url,
        start: event.t,
        firstByte: undefined,
        end: undefined,
        outcome: undefined,
        status: undefined,
        bytes: 0,
        saved: false,
      };
      byId.set(event.id, download);
    }
    download.bytes = Math.max(download.bytes, event.bytes);
    download.status = event.status ?? download.status;
    download.saved ||= event.saved === true;
    if (event.phase === "first-byte") download.firstByte ??= event.t;
    if (event.phase === "end" || event.phase === "abort" || event.phase === "error") {
      download.end ??= event.t;
      download.outcome ??= event.phase;
    }
  }
  return [...byId.values()].sort((a, b) => a.start - b.start);
}

function entry(run: SavedRun, download: Download, runEnd: number): HarEntry {
  const end = Math.max(download.end ?? runEnd, download.start);
  const firstByte =
    download.firstByte === undefined ? undefined : Math.min(download.firstByte, end);
  const wait = ms((firstByte ?? end) - download.start);
  const receive = firstByte === undefined ? 0 : ms(end - firstByte);
  const done = download.outcome === "end";
  const comments: string[] = [];
  if (download.outcome === undefined) comments.push("Still downloading when the run ended.");
  if (done && download.status === undefined) {
    comments.push("Runs before 2026-10-22 didn't record the status: 200 is assumed.");
  }
  if (download.saved) {
    comments.push(
      "Answered from the copy this browser saved in an earlier run; the simulated network still timed it.",
    );
  }
  const error =
    download.outcome === "error" ? "net::ERR_FAILED" : done ? undefined : "net::ERR_ABORTED";
  return {
    pageref: PAGE_ID,
    startedDateTime: new Date(run.startedAt + download.start * 1000).toISOString(),
    time: Math.round((wait + receive) * 1e3) / 1e3,
    request: {
      method: "GET",
      url: download.url,
      httpVersion: "",
      cookies: [],
      headers: [],
      queryString: queryString(download.url),
      headersSize: -1,
      bodySize: 0,
    },
    response: {
      status: done ? (download.status ?? 200) : 0,
      statusText: "",
      httpVersion: "",
      cookies: [],
      headers: [],
      content: { size: download.bytes, mimeType: mediaType(download.url) },
      redirectURL: "",
      headersSize: -1,
      bodySize: download.bytes,
      _transferSize: download.bytes,
      ...(error === undefined ? {} : { _error: error }),
    },
    cache: {},
    timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait, receive },
    ...(comments.length > 0 ? { comment: comments.join(" ") } : {}),
  };
}

export function runToHar(run: SavedRun): Har {
  const runEnd = run.events.reduce((latest, event) => Math.max(latest, event.t), 0);
  const { streamName, network, player } = run.setup;
  return {
    log: {
      version: "1.2",
      creator: { name: "Rebuffer", version: String(RUN_VERSION) },
      browser: { name: run.environment.browser, version: "" },
      pages: [
        {
          startedDateTime: new Date(run.startedAt).toISOString(),
          id: PAGE_ID,
          title: `${streamName} on ${network.name}, ${player.name}`,
          pageTimings: { onContentLoad: -1, onLoad: -1 },
        },
      ],
      entries: downloads(run).map((download) => entry(run, download, runEnd)),
      comment: `A Rebuffer run (https://rebuffer.azamatos.com): ${run.player.name} ${run.player.version} played ${streamName} through a simulated network, ${network.name}. The times are what the simulation gave the player, not a measurement of a real network.`,
    },
  };
}
