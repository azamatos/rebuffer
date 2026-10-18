import { validateCurve, type NetworkCurve } from "./curve";
import {
  workerMessage,
  type PageMessage,
  type RequestEventMessage,
  type WorkerMessage,
} from "./protocol";

export type ShapingErrorCode = "unsupported" | "hard-reload" | "timeout" | "rejected";

/** Why shaping couldn't start, with a message the Run screen can show as is. */
export class ShapingError extends Error {
  readonly code: ShapingErrorCode;

  constructor(code: ShapingErrorCode, message: string) {
    super(message);
    this.name = "ShapingError";
    this.code = code;
  }
}

/** Why a session ended: the page asked ("ended"), or the worker lost it ("lost"). */
export type SessionEndReason = "ended" | "lost";

export interface ShapingSession {
  readonly id: string;
  /** Epoch milliseconds at simulated time 0; request events count seconds from here. */
  readonly startAt: number;
  /** Calls `listener` for every request event; returns a function that stops it. */
  onRequestEvent(listener: (event: RequestEventMessage) => void): () => void;
  /** Calls `listener` once when the session ends, including when the worker lost it mid-run. */
  onEnd(listener: (reason: SessionEndReason) => void): () => void;
  /** Stops shaping; requests in flight finish at the real network's speed. */
  end(): Promise<void>;
}

export interface ShapingOptions {
  scriptUrl?: string;
  /** How long to wait for the worker at each step. */
  timeoutMs?: number;
}

const KEEP_ALIVE_MS = 10_000;

/** The page's own clock in epoch milliseconds, comparable with the worker's. */
const clock = () => performance.timeOrigin + performance.now();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(error());
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

function nextController(container: ServiceWorkerContainer): Promise<ServiceWorker> {
  return new Promise((resolve) => {
    const check = () => {
      if (!container.controller) return;
      container.removeEventListener("controllerchange", check);
      resolve(container.controller);
    };
    container.addEventListener("controllerchange", check);
    check();
  });
}

/**
 * Registers the worker if needed and waits until it controls this page. On a first visit that
 * takes a moment (install, activate, claim). After a hard reload the browser keeps the page
 * away from the worker until the next normal load, so there is nothing to wait for.
 */
async function controllerFor(
  container: ServiceWorkerContainer,
  scriptUrl: string,
  timeoutMs: number,
): Promise<ServiceWorker> {
  const existing = await container.getRegistration("/");
  const wasActive = existing?.active != null;
  try {
    await container.register(scriptUrl, { scope: "/" });
  } catch {
    throw new ShapingError(
      "unsupported",
      "This browser refused the network simulator's Service Worker (a private window or a privacy setting can block it).",
    );
  }
  if (container.controller) return container.controller;

  const hardReload = () =>
    new ShapingError("hard-reload", "Reload the page normally to start a run.");
  if (wasActive) return withTimeout(nextController(container), 1_000, hardReload);
  return withTimeout(
    nextController(container),
    timeoutMs,
    () =>
      new ShapingError(
        "timeout",
        "The network simulator didn't start. Reload the page and try again.",
      ),
  );
}

/**
 * Starts shaping this page's requests to `origins` (like "https://media.azamatos.com") on the
 * simulated network `curve`. Resolves once the worker has the session.
 */
export async function startShaping(
  curve: NetworkCurve,
  origins: readonly string[],
  options: ShapingOptions = {},
): Promise<ShapingSession> {
  const { scriptUrl = "/sw.js", timeoutMs = 10_000 } = options;
  if (!("serviceWorker" in navigator)) {
    throw new ShapingError(
      "unsupported",
      "This browser can't run the network simulator: it has no Service Workers here (a private window can turn them off).",
    );
  }
  const checked = validateCurve(curve);
  if (!checked.ok) throw new ShapingError("rejected", checked.errors.join(" "));

  const container = navigator.serviceWorker;
  const worker = await controllerFor(container, scriptUrl, timeoutMs);
  const id = crypto.randomUUID();
  const startAt = clock();
  const requestListeners = new Set<(event: RequestEventMessage) => void>();
  const endListeners = new Set<(reason: SessionEndReason) => void>();
  const timers: { keepAlive?: ReturnType<typeof setInterval> } = {};
  let finished = false;

  const post = (message: PageMessage) => {
    worker.postMessage(message);
  };

  function finish(reason: SessionEndReason): void {
    if (finished) return;
    finished = true;
    clearInterval(timers.keepAlive);
    container.removeEventListener("message", onMessage);
    container.removeEventListener("controllerchange", onControllerChange);
    for (const listener of endListeners) listener(reason);
  }

  let settleReady: ((message: WorkerMessage) => void) | undefined;
  let settleEnded: (() => void) | undefined;

  function onMessage(event: MessageEvent): void {
    const parsed = workerMessage.safeParse(event.data);
    if (!parsed.success || parsed.data.sessionId !== id) return;
    const message = parsed.data;
    if (message.type === "request") {
      for (const listener of requestListeners) listener(message);
    } else if (message.type === "session-ready") {
      settleReady?.(message);
    } else {
      settleReady?.(message);
      settleEnded?.();
      finish(message.reason === "lost" ? "lost" : "ended");
    }
  }

  /** A new worker took over (an update): it doesn't know this session. */
  function onControllerChange(): void {
    finish("lost");
  }

  container.addEventListener("message", onMessage);
  container.startMessages();
  const ready = new Promise<WorkerMessage>((resolve) => {
    settleReady = resolve;
  });
  const { points, ...rest } = checked.curve;
  post({
    type: "start-session",
    sessionId: id,
    curve: { ...rest, points: [...points] },
    origins: [...origins],
    startAt,
  });

  const answer = await withTimeout(ready, timeoutMs, () => {
    finish("ended");
    return new ShapingError(
      "timeout",
      "The network simulator didn't answer. Reload the page and try again.",
    );
  });
  if (answer.type === "session-ended") {
    const errors = answer.errors?.join(" ") ?? "";
    throw new ShapingError("rejected", errors || "The network simulator refused this network.");
  }

  container.addEventListener("controllerchange", onControllerChange);
  timers.keepAlive = setInterval(() => {
    post({ type: "keep-alive", sessionId: id });
  }, KEEP_ALIVE_MS);

  return {
    id,
    startAt,
    onRequestEvent(listener) {
      requestListeners.add(listener);
      return () => requestListeners.delete(listener);
    },
    onEnd(listener) {
      endListeners.add(listener);
      return () => endListeners.delete(listener);
    },
    async end() {
      if (finished) return;
      const ended = new Promise<void>((resolve) => {
        settleEnded = resolve;
      });
      post({ type: "end-session", sessionId: id });
      await withTimeout(
        ended,
        timeoutMs,
        () => new ShapingError("timeout", "The network simulator didn't answer."),
      ).catch(() => undefined);
      finish("ended");
    },
  };
}
