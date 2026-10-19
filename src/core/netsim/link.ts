import { bitsBetween, timeToDeliver, upTimeBetween, type NetworkCurve } from "./curve";

/**
 * One download on the link. Bytes move through three counters: `supplied` (arrived from the real
 * network), `sent` (let through by the simulation, fractional) and `released` (whole bytes handed out).
 */
export interface LinkRequest {
  readonly id: string;
  readonly startedAt: number;
  /** One RTT after the start: the earliest moment a byte may flow. */
  readonly readyAt: number;
  supplied: number;
  sent: number;
  released: number;
  /** Known once the real response has ended. */
  total: number | undefined;
  firstByteAt: number | undefined;
  doneAt: number | undefined;
  /** When the request ran out of real bytes while the simulation could have sent more. */
  starvingSince: number | undefined;
  /**
   * How long the real network kept the first byte waiting after the simulated RTT, while the
   * simulated link was up: the real latency was above the simulated one.
   */
  firstByteLateMs: number;
  /**
   * How long the real network kept later bytes waiting, while the simulated link was up: the real
   * connection couldn't keep up with the simulated bandwidth.
   */
  bodyLateMs: number;
}

/**
 * One bottleneck link shared by concurrent downloads. A plain state object: the functions below
 * change it deterministically and never read a clock, so a test can step through exact schedules.
 */
export interface Link {
  readonly curve: NetworkCurve;
  /** Simulated time in seconds up to which the link has been advanced. */
  now: number;
  readonly requests: Map<string, LinkRequest>;
}

/** What one request may release after an `advance`. */
export interface Delivery {
  id: string;
  /** Whole bytes to hand to the consumer now. */
  bytes: number;
  /** Bytes released so far, including these. */
  released: number;
  firstByteLateMs: number;
  bodyLateMs: number;
  /** Set when the first byte flowed during this step. */
  firstByteAt?: number;
  /** Set when the last byte flowed during this step; the request has then left the link. */
  doneAt?: number;
}

/** Below this many bytes a request counts as empty, so float dust never stalls the schedule. */
const EMPTY_BYTES = 1e-3;
/** Rounding allowance when turning fractional progress into whole bytes. */
const WHOLE_BYTE_SLACK = 1e-6;

export function createLink(curve: NetworkCurve, now = 0): Link {
  return { curve, now, requests: new Map() };
}

export function addRequest(link: Link, request: { id: string; startedAt: number }): LinkRequest {
  if (link.requests.has(request.id)) {
    throw new Error(`Request ${request.id} is already on the link.`);
  }
  const added: LinkRequest = {
    id: request.id,
    startedAt: request.startedAt,
    readyAt: request.startedAt + link.curve.rttMs / 1000,
    supplied: 0,
    sent: 0,
    released: 0,
    total: undefined,
    firstByteAt: undefined,
    doneAt: undefined,
    starvingSince: undefined,
    firstByteLateMs: 0,
    bodyLateMs: 0,
  };
  link.requests.set(request.id, added);
  return added;
}

function requestOn(link: Link, id: string): LinkRequest {
  const request = link.requests.get(id);
  if (!request) throw new Error(`Request ${id} isn't on the link.`);
  return request;
}

/**
 * Records `bytes` that arrived from the real network. They count as available from the link's
 * current time (the last `advance`), so a 10 ms tick bounds how early that can be.
 */
export function supplyBytes(link: Link, id: string, bytes: number): void {
  const request = requestOn(link, id);
  if (request.total !== undefined) {
    throw new Error(`Request ${id} already finished; it can't take more bytes.`);
  }
  request.supplied += bytes;
}

/** Records that the real response ended after `totalBytes`, which must match what was supplied. */
export function finishSupply(link: Link, id: string, totalBytes: number): void {
  const request = requestOn(link, id);
  if (totalBytes !== request.supplied) {
    throw new RangeError(
      `Request ${id} received ${request.supplied} bytes but finished with ${totalBytes}.`,
    );
  }
  request.total = totalBytes;
}

/** Books a wait that ends at `until`: before the first byte it's latency, after it bandwidth. */
function commitLateness(link: Link, request: LinkRequest, until: number): void {
  if (request.starvingSince === undefined) return;
  const lateMs = upTimeBetween(link.curve, request.starvingSince, until) * 1000;
  if (request.firstByteAt === undefined) request.firstByteLateMs += lateMs;
  else request.bodyLateMs += lateMs;
  request.starvingSince = undefined;
}

/** Takes a request off the link (the player gave up on it); returns its final state. */
export function abortRequest(link: Link, id: string): LinkRequest | undefined {
  const request = link.requests.get(id);
  if (!request) return undefined;
  commitLateness(link, request, link.now);
  link.requests.delete(id);
  return request;
}

const buffered = (request: LinkRequest) => request.supplied - request.sent;

/**
 * Sorts the requests at time `t`: who sends, who waits for real bytes, who is done.
 * Returns the senders and the next time a waiting request becomes ready.
 */
function settle(link: Link, t: number): { senders: LinkRequest[]; nextReadyAt: number } {
  const senders: LinkRequest[] = [];
  let nextReadyAt = Infinity;
  for (const request of link.requests.values()) {
    if (request.doneAt !== undefined) continue;
    if (request.readyAt > t) {
      nextReadyAt = Math.min(nextReadyAt, request.readyAt);
      continue;
    }
    if (buffered(request) > EMPTY_BYTES) {
      commitLateness(link, request, t);
      request.firstByteAt ??= t;
      senders.push(request);
      continue;
    }
    request.sent = request.supplied;
    if (request.total === undefined) {
      request.starvingSince ??= t;
    } else if (request.total > 0) {
      // Every byte went through; only the end-of-response signal was pending, which isn't lateness.
      request.doneAt = request.starvingSince ?? t;
      request.starvingSince = undefined;
    } else {
      commitLateness(link, request, t);
      request.firstByteAt ??= t;
      request.doneAt = t;
    }
  }
  return { senders, nextReadyAt };
}

/**
 * Runs the link up to `now` and returns what each request may release. Senders share the
 * bandwidth equally; a request with nothing to send (not ready, waiting for real bytes, or done)
 * leaves its share to the others.
 */
export function advance(link: Link, now: number): Delivery[] {
  if (!Number.isFinite(now)) throw new RangeError("The link can only advance to a finite time.");
  const startedBefore = new Set<string>();
  for (const request of link.requests.values()) {
    if (request.firstByteAt !== undefined) startedBefore.add(request.id);
  }

  let t = link.now;
  for (;;) {
    const { senders, nextReadyAt } = settle(link, t);
    if (t >= now) break;

    let next = Math.min(now, nextReadyAt);
    let emptiest: LinkRequest | undefined;
    for (const request of senders) {
      if (!emptiest || buffered(request) < buffered(emptiest)) emptiest = request;
    }
    if (emptiest) {
      const emptyAt = timeToDeliver(link.curve, t, buffered(emptiest) * 8 * senders.length);
      if (emptyAt <= next) next = emptyAt;
      else emptiest = undefined;
      const share = bitsBetween(link.curve, t, next) / 8 / senders.length;
      for (const request of senders) {
        request.sent = Math.min(request.supplied, request.sent + share);
      }
      // Guarantees progress even when float error leaves a few bits behind.
      if (emptiest) emptiest.sent = emptiest.supplied;
    }
    t = next;
  }
  link.now = Math.max(link.now, now);

  const deliveries: Delivery[] = [];
  for (const request of link.requests.values()) {
    const whole = Math.min(request.supplied, Math.floor(request.sent + WHOLE_BYTE_SLACK));
    const bytes = whole - request.released;
    request.released = whole;
    const firstByteAt = startedBefore.has(request.id) ? undefined : request.firstByteAt;
    if (bytes === 0 && firstByteAt === undefined && request.doneAt === undefined) continue;
    deliveries.push({
      id: request.id,
      bytes,
      released: whole,
      firstByteLateMs: request.firstByteLateMs,
      bodyLateMs: request.bodyLateMs,
      ...(firstByteAt === undefined ? {} : { firstByteAt }),
      ...(request.doneAt === undefined ? {} : { doneAt: request.doneAt }),
    });
    if (request.doneAt !== undefined) link.requests.delete(request.id);
  }
  return deliveries;
}
