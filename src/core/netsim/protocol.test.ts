import { describe, expect, it } from "vitest";
import { describeIssues } from "./curve";
import { pageMessage, workerMessage } from "./protocol";

const curve = { shape: "steps", rttMs: 100, lengthS: 30, points: [{ t: 0, mbps: 4 }] };

describe("page messages", () => {
  it("accept a valid start-session", () => {
    const message = {
      type: "start-session",
      sessionId: "s1",
      curve,
      origins: ["https://media.azamatos.com", "http://localhost:4013"],
      startAt: 1_760_000_000_000,
    };
    expect(pageMessage.parse(message)).toEqual(message);
  });

  it("reject origins with a path and invalid curves, in plain words", () => {
    const result = pageMessage.safeParse({
      type: "start-session",
      sessionId: "s1",
      curve: { ...curve, points: [{ t: 0, mbps: -1 }] },
      origins: ["https://media.azamatos.com/ToS/"],
      startAt: 0,
    });
    expect(result.success).toBe(false);
    expect(result.error && describeIssues(result.error.issues)).toEqual([
      "Point 1: bandwidth can't be negative.",
      '"https://media.azamatos.com/ToS/" isn\'t an origin like https://media.example.com.',
    ]);
  });

  it("accept end-session and keep-alive, and nothing unknown", () => {
    expect(pageMessage.parse({ type: "end-session", sessionId: "s1" }).type).toBe("end-session");
    expect(pageMessage.parse({ type: "keep-alive", sessionId: "s1" }).type).toBe("keep-alive");
    expect(pageMessage.safeParse({ type: "shape-everything" }).success).toBe(false);
  });
});

describe("worker messages", () => {
  it("accept request events with and without a total and the real timings", () => {
    const event = {
      type: "request",
      sessionId: "s1",
      requestId: "7",
      url: "https://media.azamatos.com/ToS/720p/seg-3.m4s",
      phase: "first-byte",
      at: 12.48,
      bytes: 0,
      firstByteLateMs: 0,
      bodyLateMs: 0,
    };
    expect(workerMessage.parse(event)).toEqual(event);
    const end = {
      ...event,
      phase: "end",
      totalBytes: 1_400_000,
      status: 200,
      realFirstByteAt: 12.1,
      realEndAt: 12.9,
    };
    expect(workerMessage.parse(end)).toEqual(end);
    expect(workerMessage.safeParse({ ...event, phase: "paused" }).success).toBe(false);
  });

  it("accept the session acknowledgements", () => {
    expect(workerMessage.parse({ type: "session-ready", sessionId: "s1" }).type).toBe(
      "session-ready",
    );
    expect(
      workerMessage.parse({
        type: "session-ended",
        sessionId: "s1",
        reason: "rejected",
        errors: ["A network needs at least one point."],
      }),
    ).toMatchObject({ reason: "rejected" });
  });
});
