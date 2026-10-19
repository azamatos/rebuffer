import { afterEach, describe, expect, it, vi } from "vitest";
import { ShapingError, startShaping } from "./client";
import type { NetworkCurve } from "./curve";
import type { PageMessage, WorkerMessage } from "./protocol";

const curve: NetworkCurve = {
  shape: "steps",
  rttMs: 100,
  lengthS: 30,
  points: [{ t: 0, mbps: 4 }],
};

/** Stands in for navigator.serviceWorker: a worker that answers like src/sw/sw.ts. */
class FakeContainer extends EventTarget {
  controller: { postMessage: (message: PageMessage) => void } | null = null;
  posted: PageMessage[] = [];
  answer: (message: PageMessage) => WorkerMessage | undefined = (message) =>
    message.type === "start-session"
      ? { type: "session-ready", sessionId: message.sessionId }
      : message.type === "end-session"
        ? { type: "session-ended", sessionId: message.sessionId, reason: "ended" }
        : undefined;
  private readonly worker = {
    postMessage: (message: PageMessage) => {
      this.posted.push(message);
      const reply = this.answer(message);
      if (reply) {
        setTimeout(() => {
          this.send(reply);
        }, 0);
      }
    },
  };

  constructor(private readonly visit: "first" | "controlled" | "hard-reload") {
    super();
    if (visit === "controlled") this.controller = this.worker;
  }

  getRegistration(): Promise<{ active: object | null } | undefined> {
    return Promise.resolve(this.visit === "first" ? undefined : { active: {} });
  }

  register(): Promise<object> {
    if (this.visit === "first") {
      setTimeout(() => {
        this.takeOver();
      }, 5);
    }
    return Promise.resolve({});
  }

  startMessages(): void {
    // Messages flow as soon as they are sent here.
  }

  send(message: WorkerMessage): void {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }

  takeOver(): void {
    this.controller = this.worker;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

function install(container: FakeContainer | undefined): void {
  vi.stubGlobal("navigator", container ? { serviceWorker: container } : {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("startShaping", () => {
  it("waits for the worker on a first visit, then starts a session", async () => {
    const container = new FakeContainer("first");
    install(container);
    const session = await startShaping(curve, ["https://media.azamatos.com"]);

    expect(container.posted).toEqual([
      {
        type: "start-session",
        sessionId: session.id,
        curve,
        origins: ["https://media.azamatos.com"],
        startAt: session.startAt,
      },
    ]);
  });

  it("passes this session's request events on and ignores others", async () => {
    const container = new FakeContainer("controlled");
    install(container);
    const session = await startShaping(curve, ["https://media.azamatos.com"]);
    const listener = vi.fn();
    session.onRequestEvent(listener);
    const event = {
      type: "request",
      sessionId: session.id,
      requestId: "1",
      url: "https://media.azamatos.com/a.m4s",
      phase: "end",
      at: 2.5,
      bytes: 1000,
      totalBytes: 1000,
      firstByteLateMs: 0,
      bodyLateMs: 0,
    } as const;
    container.send(event);
    container.send({ ...event, sessionId: "another-tab" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("ends the session and tells its listeners", async () => {
    const container = new FakeContainer("controlled");
    install(container);
    const session = await startShaping(curve, ["https://media.azamatos.com"]);
    const ended = vi.fn();
    session.onEnd(ended);
    await session.end();

    expect(container.posted.at(-1)).toEqual({ type: "end-session", sessionId: session.id });
    expect(ended).toHaveBeenCalledWith("ended");
  });

  it("reports a session the worker lost or a new worker took over", async () => {
    const container = new FakeContainer("controlled");
    install(container);
    const first = await startShaping(curve, ["https://media.azamatos.com"]);
    const firstEnded = vi.fn();
    first.onEnd(firstEnded);
    container.send({ type: "session-ended", sessionId: first.id, reason: "lost" });
    expect(firstEnded).toHaveBeenCalledWith("lost");

    const second = await startShaping(curve, ["https://media.azamatos.com"]);
    const secondEnded = vi.fn();
    second.onEnd(secondEnded);
    container.takeOver();
    expect(secondEnded).toHaveBeenCalledWith("lost");
  });

  it("asks for a normal reload when a hard reload left the page uncontrolled", async () => {
    vi.useFakeTimers();
    install(new FakeContainer("hard-reload"));
    const started = startShaping(curve, ["https://media.azamatos.com"]);
    const check = expect(started).rejects.toEqual(
      new ShapingError("hard-reload", "Reload the page normally to start a run."),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await check;
  });

  it("rejects an invalid network before talking to the worker", async () => {
    const container = new FakeContainer("controlled");
    install(container);
    const started = startShaping({ ...curve, points: [] }, ["https://media.azamatos.com"]);

    await expect(started).rejects.toMatchObject({
      code: "rejected",
      message: "A network needs at least one point.",
    });
    expect(container.posted).toEqual([]);
  });

  it("passes on the worker's reasons for refusing a session", async () => {
    const container = new FakeContainer("controlled");
    container.answer = (message) => ({
      type: "session-ended",
      sessionId: "sessionId" in message ? message.sessionId : "",
      reason: "rejected",
      errors: ['"ftp://x" isn\'t an origin like https://media.example.com.'],
    });
    install(container);

    await expect(startShaping(curve, ["ftp://x"])).rejects.toMatchObject({
      code: "rejected",
      message: '"ftp://x" isn\'t an origin like https://media.example.com.',
    });
  });

  it("explains a browser without Service Workers", async () => {
    install(undefined);
    await expect(startShaping(curve, [])).rejects.toMatchObject({ code: "unsupported" });
  });
});
