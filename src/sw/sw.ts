/**
 * The network shaper. A page starts a session (a curve and the origins to shape); from then on its
 * requests to those origins are answered from here, released at the pace the curve allows.
 * Everything else, and every page without a session, goes to the network untouched.
 */
import { describeIssues } from "@/core/netsim/curve";
import { pageMessage, type WorkerMessage } from "@/core/netsim/protocol";
import { openSavedCopy } from "./saved";
import { createSession, type Session } from "./session";

declare const self: ServiceWorkerGlobalScope;

/** Sessions by the id of the page (client) that started them, so two tabs never mix. */
const sessions = new Map<string, Session>();
const saved = openSavedCopy();

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function sessionIdOf(data: unknown): string {
  if (typeof data !== "object" || data === null || !("sessionId" in data)) return "";
  return typeof data.sessionId === "string" ? data.sessionId : "";
}

/** Drops the sessions of pages that have closed. */
async function forgetClosedPages(): Promise<void> {
  const open = new Set((await self.clients.matchAll({ type: "window" })).map(({ id }) => id));
  for (const [clientId, session] of sessions) {
    if (open.has(clientId)) continue;
    session.end();
    sessions.delete(clientId);
  }
}

self.addEventListener("message", (event) => {
  const client = event.source;
  if (!(client instanceof Client)) return;
  const reply = (message: WorkerMessage) => {
    client.postMessage(message);
  };

  const parsed = pageMessage.safeParse(event.data);
  if (!parsed.success) {
    reply({
      type: "session-ended",
      sessionId: sessionIdOf(event.data),
      reason: "rejected",
      errors: describeIssues(parsed.error.issues),
    });
    return;
  }

  const message = parsed.data;
  const current = sessions.get(client.id);
  switch (message.type) {
    case "start-session": {
      current?.end();
      const { sessionId, curve, origins, startAt } = message;
      sessions.set(
        client.id,
        createSession({ id: sessionId, curve, origins, startAt, post: reply, saved }),
      );
      reply({ type: "session-ready", sessionId });
      event.waitUntil(forgetClosedPages());
      return;
    }
    case "end-session":
      if (current?.id === message.sessionId) {
        current.end();
        sessions.delete(client.id);
      }
      reply({ type: "session-ended", sessionId: message.sessionId, reason: "ended" });
      return;
    case "keep-alive":
      if (current?.id !== message.sessionId) {
        reply({ type: "session-ended", sessionId: message.sessionId, reason: "lost" });
      }
      return;
  }
});

self.addEventListener("fetch", (event) => {
  const session = sessions.get(event.clientId);
  if (!session?.shapes(event.request)) return;
  event.respondWith(session.respond(event.request));
});
