import type { NetworkCurve } from "@/core/netsim/curve";
import {
  abortRequest,
  addRequest,
  advance,
  createLink,
  finishSupply,
  supplyBytes,
  type Delivery,
} from "@/core/netsim/link";
import { ALL_OTHER_ORIGINS, type RequestPhase, type WorkerMessage } from "@/core/netsim/protocol";
import { isPlainGet } from "@/core/netsim/saved";
import { createByteQueue, type ByteQueue } from "./bytes";
import type { SavedCopy } from "./saved";

/** How often the link releases bytes. Short enough for smooth progress events, long enough to be cheap. */
const TICK_MS = 10;
/** Statuses whose responses must not carry a body (the Fetch spec's "null body status"). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

export interface SessionOptions {
  id: string;
  curve: NetworkCurve;
  origins: readonly string[];
  /** Epoch milliseconds at simulated time 0. */
  startAt: number;
  post: (message: WorkerMessage) => void;
  /** Downloads saved by earlier runs: answers from here skip the real network, and new downloads are saved. */
  saved?: SavedCopy;
}

export interface Session {
  readonly id: string;
  /** Whether this session shapes the request: GET or HEAD, CORS or same-origin, to one of its origins. */
  shapes(request: Request): boolean;
  respond(request: Request): Promise<Response>;
  /**
   * Stops shaping. Requests already in flight aren't cut off: what the link holds goes out at once
   * and the rest follows at the real network's speed, so a player that keeps running doesn't break.
   */
  end(): void;
}

/** One shaped request: the real response flows into `queue`; the link decides when it leaves. */
interface Shaped {
  readonly id: string;
  readonly url: string;
  readonly queue: ByteQueue;
  readonly upstream: AbortController;
  readonly body: ReadableStream<Uint8Array>;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
  init: ResponseInit | undefined;
  /** Set when the real server redirected: the page gets the redirect and follows it itself. */
  redirectTo: string | undefined;
  hasBody: boolean;
  totalBytes: number | undefined;
  released: number;
  /** Simulated-clock seconds when the real response arrived, and when its last byte did. */
  realFirstByteAt: number | undefined;
  realEndAt: number | undefined;
  /** Answered from the copy saved by an earlier run, not the real network. */
  fromSaved: boolean;
  responded: boolean;
  supplyDone: boolean;
  /** Off the link: the session ended, so bytes pass straight through. */
  passthrough: boolean;
  /** Closed, failed or aborted: nothing more to do. */
  settled: boolean;
}

function pending(): {
  promise: Promise<Response>;
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
} {
  const handlers: { resolve?: (response: Response) => void; reject?: (reason: unknown) => void } =
    {};
  const promise = new Promise<Response>((resolve, reject) => {
    handlers.resolve = resolve;
    handlers.reject = reject;
  });
  const { resolve, reject } = handlers;
  if (!resolve || !reject) throw new Error("A promise didn't hand over its resolvers.");
  return { promise, resolve, reject };
}

function streamWithController(onCancel: () => void): {
  body: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
} {
  const holder: { controller?: ReadableStreamDefaultController<Uint8Array> } = {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      holder.controller = controller;
    },
    cancel: onCancel,
  });
  if (!holder.controller) throw new Error("A stream didn't hand over its controller.");
  return { body, controller: holder.controller };
}

type Lateness = Pick<Delivery, "firstByteLateMs" | "bodyLateMs">;

const ON_TIME: Lateness = { firstByteLateMs: 0, bodyLateMs: 0 };

/** Reads the flag through a call: it changes while `pump` awaits, which narrowing can't see. */
const isSettled = (shaped: Shaped) => shaped.settled;

function contentLength(headers: Headers): number | undefined {
  const value = headers.get("content-length");
  if (value === null) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

/** The real response's headers, minus those that no longer describe the body we stream. */
function responseHeaders(upstream: Headers): Headers {
  const headers = new Headers(upstream);
  // fetch() has already decoded a compressed body, so its encoding and compressed length are wrong now.
  if (headers.has("content-encoding")) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return headers;
}

/**
 * A redirect the page follows itself, so it ends up with the final URL (hls.js resolves segment
 * paths against it). WebKit applies CORS to it, so it carries the page's own origin.
 */
function redirectTo(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Access-Control-Allow-Origin": self.location.origin,
      "Access-Control-Allow-Credentials": "true",
    },
  });
}

export function createSession(options: SessionOptions): Session {
  const link = createLink(options.curve);
  const origins = new Set(options.origins);
  const inFlight = new Map<string, Shaped>();
  let lastId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;

  const now = () => (performance.timeOrigin + performance.now() - options.startAt) / 1000;

  function post(shaped: Shaped, phase: RequestPhase, at: number, lateness: Lateness): void {
    if (ended) return;
    const { totalBytes, realFirstByteAt, realEndAt, fromSaved } = shaped;
    options.post({
      type: "request",
      sessionId: options.id,
      requestId: shaped.id,
      url: shaped.url,
      phase,
      at,
      bytes: shaped.released,
      ...(totalBytes === undefined ? {} : { totalBytes }),
      firstByteLateMs: lateness.firstByteLateMs,
      bodyLateMs: lateness.bodyLateMs,
      ...(realFirstByteAt === undefined ? {} : { realFirstByteAt }),
      ...(realEndAt === undefined ? {} : { realEndAt }),
      ...(fromSaved ? { saved: true } : {}),
    });
  }

  function respondNow(shaped: Shaped): void {
    if (shaped.responded || !shaped.init) return;
    shaped.responded = true;
    shaped.resolve(
      shaped.redirectTo === undefined
        ? new Response(shaped.hasBody ? shaped.body : null, shaped.init)
        : redirectTo(shaped.redirectTo),
    );
  }

  function close(shaped: Shaped): void {
    shaped.settled = true;
    inFlight.delete(shaped.id);
    if (shaped.hasBody) shaped.controller.close();
  }

  function stop(shaped: Shaped, phase: "abort" | "error", reason: unknown): void {
    if (shaped.settled) return;
    shaped.settled = true;
    inFlight.delete(shaped.id);
    shaped.upstream.abort();
    const state = shaped.passthrough ? undefined : abortRequest(link, shaped.id);
    if (shaped.responded) shaped.controller.error(reason);
    else shaped.reject(reason);
    post(shaped, phase, now(), state ?? ON_TIME);
  }

  function deliver(shaped: Shaped, delivery: Delivery): void {
    shaped.released = delivery.released;
    if (delivery.firstByteAt !== undefined) {
      respondNow(shaped);
      post(shaped, "first-byte", delivery.firstByteAt, delivery);
    }
    for (const chunk of shaped.queue.take(delivery.bytes)) shaped.controller.enqueue(chunk);
    if (delivery.doneAt !== undefined) {
      shaped.totalBytes = delivery.released;
      close(shaped);
      post(shaped, "end", delivery.doneAt, delivery);
    }
  }

  function tick(): void {
    timer = undefined;
    for (const delivery of advance(link, now())) {
      const shaped = inFlight.get(delivery.id);
      if (!shaped) continue;
      try {
        deliver(shaped, delivery);
      } catch (error) {
        // One broken response (say, a stream the page dropped) mustn't stall the others.
        stop(shaped, "error", error);
      }
    }
    if (link.requests.size > 0) schedule();
  }

  function schedule(): void {
    timer ??= setTimeout(tick, TICK_MS);
  }

  async function pump(shaped: Shaped, request: Request): Promise<void> {
    const plain = isPlainGet(request);
    const saved = plain ? await options.saved?.find(request.url) : undefined;
    if (isSettled(shaped)) return;
    const response = saved ?? (await fetch(request, { signal: shaped.upstream.signal }));
    if (shaped.settled) return;
    shaped.fromSaved = saved !== undefined;
    if (!saved && plain) options.saved?.keep(request.url, response);
    // The real network's timings; a saved copy has none.
    const real = () => (shaped.fromSaved ? undefined : now());
    shaped.realFirstByteAt = real();
    shaped.totalBytes = contentLength(response.headers);
    shaped.init = {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response.headers),
    };
    if (response.redirected) shaped.redirectTo = response.url;
    shaped.hasBody =
      shaped.redirectTo === undefined &&
      request.method !== "HEAD" &&
      !NULL_BODY_STATUSES.has(response.status) &&
      response.body !== null;

    if (!shaped.hasBody || !response.body) {
      void response.body?.cancel();
      shaped.supplyDone = true;
      shaped.realEndAt = shaped.realFirstByteAt;
      if (shaped.passthrough) {
        respondNow(shaped);
        close(shaped);
      } else {
        finishSupply(link, shaped.id, 0);
      }
      return;
    }

    if (shaped.passthrough) respondNow(shaped);
    const reader = response.body.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (isSettled(shaped)) return;
      if (done) break;
      total += value.byteLength;
      if (shaped.passthrough) {
        shaped.controller.enqueue(value);
      } else {
        shaped.queue.push(value);
        supplyBytes(link, shaped.id, value.byteLength);
      }
    }
    shaped.supplyDone = true;
    shaped.realEndAt = real();
    if (shaped.passthrough) close(shaped);
    else finishSupply(link, shaped.id, total);
  }

  function respond(request: Request): Promise<Response> {
    const id = String(++lastId);
    const startedAt = now();
    addRequest(link, { id, startedAt });
    const { promise, resolve, reject } = pending();
    const abort = () => {
      stop(shaped, "abort", new DOMException("The request was aborted.", "AbortError"));
    };
    const { body, controller } = streamWithController(abort);
    const shaped: Shaped = {
      id,
      url: request.url,
      queue: createByteQueue(),
      upstream: new AbortController(),
      body,
      controller,
      resolve,
      reject,
      init: undefined,
      redirectTo: undefined,
      hasBody: false,
      totalBytes: undefined,
      released: 0,
      realFirstByteAt: undefined,
      realEndAt: undefined,
      fromSaved: false,
      responded: false,
      supplyDone: false,
      passthrough: false,
      settled: false,
    };
    inFlight.set(id, shaped);
    post(shaped, "start", startedAt, ON_TIME);
    request.signal.addEventListener("abort", abort, { once: true });
    pump(shaped, request).catch((error: unknown) => {
      stop(shaped, "error", error instanceof TypeError ? error : new TypeError(String(error)));
    });
    schedule();
    return promise;
  }

  return {
    id: options.id,
    shapes(request) {
      if (ended) return false;
      if (request.method !== "GET" && request.method !== "HEAD") return false;
      if (request.mode !== "cors" && request.mode !== "same-origin") return false;
      const origin = new URL(request.url).origin;
      if (origins.has(ALL_OTHER_ORIGINS)) return origin !== self.location.origin;
      return origins.has(origin);
    },
    respond,
    end() {
      ended = true;
      clearTimeout(timer);
      timer = undefined;
      for (const shaped of inFlight.values()) {
        abortRequest(link, shaped.id);
        shaped.passthrough = true;
        respondNow(shaped);
        if (shaped.responded) {
          for (const chunk of shaped.queue.drain()) shaped.controller.enqueue(chunk);
          if (shaped.supplyDone) close(shaped);
        }
      }
    },
  };
}
