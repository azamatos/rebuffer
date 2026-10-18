import { z } from "zod";
import { curveSchema } from "./curve";

/** An origin as `new URL(...).origin` writes it: scheme, host and port, nothing else. */
const originSchema = z.string().refine(
  (value) => {
    try {
      return new URL(value).origin === value;
    } catch {
      return false;
    }
  },
  { error: (issue) => `"${String(issue.input)}" isn't an origin like https://media.example.com.` },
);

const sessionId = z.string().min(1);

/** Page → Service Worker: shape this page's requests to these origins from `startAt` on. */
export const startSessionMessage = z.object({
  type: z.literal("start-session"),
  sessionId,
  curve: curveSchema,
  origins: z.array(originSchema),
  /** Epoch milliseconds (`performance.timeOrigin + performance.now()`) at simulated time 0. */
  startAt: z.number(),
});

/** Page → Service Worker: stop shaping new requests. */
export const endSessionMessage = z.object({ type: z.literal("end-session"), sessionId });

/**
 * Page → Service Worker: the run is still going. Browsers stop an idle Service Worker after about
 * 30 s, and its sessions with it; a ping every few seconds keeps it alive through quiet spells.
 */
export const keepAliveMessage = z.object({ type: z.literal("keep-alive"), sessionId });

export const pageMessage = z.discriminatedUnion("type", [
  startSessionMessage,
  endSessionMessage,
  keepAliveMessage,
]);

export const requestPhase = z.enum(["start", "first-byte", "end", "abort", "error"]);

/** Service Worker → page: one step in the life of a shaped request. */
export const requestEventMessage = z.object({
  type: z.literal("request"),
  sessionId,
  requestId: z.string(),
  url: z.string(),
  phase: requestPhase,
  /** Simulated seconds since `startAt`. */
  at: z.number(),
  /** Bytes released to the page so far. */
  bytes: z.number(),
  /** The response size, when the server said (Content-Length) or once it ended. */
  totalBytes: z.number().optional(),
  /** How long the real network kept this request waiting while the simulated link was up. */
  lateMs: z.number(),
});

export const sessionReadyMessage = z.object({ type: z.literal("session-ready"), sessionId });

/**
 * Service Worker → page: the session is over. "ended" answers end-session; "rejected" means the
 * start-session message was invalid (see `errors`); "lost" means the worker no longer knows it,
 * usually because the browser restarted the worker.
 */
export const sessionEndedMessage = z.object({
  type: z.literal("session-ended"),
  sessionId: z.string(),
  reason: z.enum(["ended", "rejected", "lost"]),
  errors: z.array(z.string()).optional(),
});

export const workerMessage = z.discriminatedUnion("type", [
  requestEventMessage,
  sessionReadyMessage,
  sessionEndedMessage,
]);

export type StartSessionMessage = z.infer<typeof startSessionMessage>;
export type EndSessionMessage = z.infer<typeof endSessionMessage>;
export type KeepAliveMessage = z.infer<typeof keepAliveMessage>;
export type PageMessage = z.infer<typeof pageMessage>;
export type RequestPhase = z.infer<typeof requestPhase>;
export type RequestEventMessage = z.infer<typeof requestEventMessage>;
export type SessionReadyMessage = z.infer<typeof sessionReadyMessage>;
export type SessionEndedMessage = z.infer<typeof sessionEndedMessage>;
export type WorkerMessage = z.infer<typeof workerMessage>;
