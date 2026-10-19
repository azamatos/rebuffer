import { expect, test, type Page } from "@playwright/test";
import { timeToDeliver, type NetworkCurve } from "../../src/core/netsim/curve";
import type { RequestEventMessage, WorkerMessage } from "../../src/core/netsim/protocol";

declare global {
  interface Window {
    shaperEvents?: RequestEventMessage[];
    shaperSessionId?: string;
  }
}

const FILES = "http://localhost:4013";
/** The same server under another origin, which the session doesn't shape. */
const OTHER_ORIGIN = "http://127.0.0.1:4013";
const MIB = 1024 * 1024;

const curve: NetworkCurve = {
  shape: "steps",
  rttMs: 100,
  lengthS: 60,
  points: [{ t: 0, mbps: 4 }],
};

/** Seconds from a request's start to its last byte: one RTT, then `concurrent` equal downloads share the curve. */
function expectedSeconds(bytes: number, concurrent = 1): number {
  const rtt = curve.rttMs / 1000;
  return timeToDeliver(curve, rtt, bytes * 8 * concurrent);
}

/**
 * The simulation never releases a byte ahead of the curve, so a download may only look early by
 * clock rounding (25 ms). It may run late by the 10 ms tick, the hops between page, worker and
 * network, and a busy CI machine: 10% or 150 ms, whichever is larger.
 */
function expectOnSchedule(measured: number, expected: number): void {
  const timing = `took ${measured.toFixed(3)} s, expected ${expected.toFixed(3)} s`;
  test.info().annotations.push({ type: "timing", description: timing });
  expect(measured, timing).toBeGreaterThan(expected - 0.025);
  expect(measured, timing).toBeLessThan(expected + Math.max(0.1 * expected, 0.15));
}

/** Registers /sw.js, waits until it controls the page, and starts a session for `origins`. */
async function startSession(page: Page, origins: string[]): Promise<void> {
  await page.goto("/about");
  await page.evaluate(
    async ({ curve, origins }) => {
      const container = navigator.serviceWorker;
      await container.register("/sw.js", { scope: "/" });
      const controller =
        container.controller ??
        (await new Promise<ServiceWorker>((resolve) => {
          container.addEventListener(
            "controllerchange",
            () => {
              if (container.controller) resolve(container.controller);
            },
            { once: true },
          );
        }));

      const sessionId = crypto.randomUUID();
      window.shaperSessionId = sessionId;
      window.shaperEvents = [];
      const ready = new Promise<void>((resolve, reject) => {
        container.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          if (message.sessionId !== sessionId) return;
          if (message.type === "request") window.shaperEvents?.push(message);
          if (message.type === "session-ready") resolve();
          if (message.type === "session-ended" && message.reason === "rejected") {
            reject(new Error(message.errors?.join(" ")));
          }
        });
      });
      container.startMessages();
      controller.postMessage({
        type: "start-session",
        sessionId,
        curve,
        origins,
        startAt: performance.timeOrigin + performance.now(),
      });
      await ready;
    },
    { curve, origins },
  );
}

interface Download {
  url: string;
  via: "xhr" | "fetch";
  range?: string;
  /** Abort after this many milliseconds. */
  abortAfterMs?: number;
  /** Post end-session after this many milliseconds. */
  endSessionAfterMs?: number;
}

interface Downloaded {
  seconds: number;
  status: number;
  size: number;
  /** Bytes that don't match the server's pattern (byte i is i % 251). */
  mismatches: number;
  progressEvents: number;
  lengthComputable: boolean;
  responseUrl: string;
  contentRange: string | null;
  aborted: boolean;
}

/** Runs the downloads at the same time in the page and measures each one. */
function download(page: Page, downloads: Download[]): Promise<Downloaded[]> {
  return page.evaluate((downloads) => {
    function check(data: ArrayBuffer, offset: number): number {
      const bytes = new Uint8Array(data);
      let mismatches = 0;
      for (let i = 0; i < bytes.length; i++) if (bytes[i] !== (offset + i) % 251) mismatches++;
      return mismatches;
    }

    function viaXhr(item: (typeof downloads)[number]): Promise<Downloaded> {
      return new Promise((resolve, reject) => {
        const started = performance.now();
        const xhr = new XMLHttpRequest();
        let progressEvents = 0;
        let lengthComputable = false;
        xhr.open("GET", item.url);
        xhr.responseType = "arraybuffer";
        if (item.range) xhr.setRequestHeader("Range", item.range);
        xhr.onprogress = (event) => {
          progressEvents++;
          lengthComputable ||= event.lengthComputable;
        };
        const finish = (aborted: boolean) => {
          const data = aborted ? new ArrayBuffer(0) : (xhr.response as ArrayBuffer);
          const offset = Number(/^bytes=(\d+)-/.exec(item.range ?? "")?.[1] ?? 0);
          resolve({
            seconds: (performance.now() - started) / 1000,
            status: xhr.status,
            size: data.byteLength,
            mismatches: check(data, offset),
            progressEvents,
            lengthComputable,
            responseUrl: xhr.responseURL,
            contentRange: aborted ? null : xhr.getResponseHeader("Content-Range"),
            aborted,
          });
        };
        xhr.onload = () => {
          finish(false);
        };
        xhr.onabort = () => {
          finish(true);
        };
        xhr.onerror = () => {
          reject(new Error(`XHR to ${item.url} failed`));
        };
        xhr.send();
        if (item.abortAfterMs !== undefined) {
          setTimeout(() => {
            xhr.abort();
          }, item.abortAfterMs);
        }
      });
    }

    async function viaFetch(item: (typeof downloads)[number]): Promise<Downloaded> {
      const started = performance.now();
      const response = await fetch(item.url);
      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
      }
      return {
        seconds: (performance.now() - started) / 1000,
        status: response.status,
        size: data.byteLength,
        mismatches: check(data.buffer, 0),
        progressEvents: chunks.length,
        lengthComputable: response.headers.has("Content-Length"),
        responseUrl: response.url,
        contentRange: response.headers.get("Content-Range"),
        aborted: false,
      };
    }

    for (const item of downloads) {
      if (item.endSessionAfterMs === undefined) continue;
      setTimeout(() => {
        navigator.serviceWorker.controller?.postMessage({
          type: "end-session",
          sessionId: window.shaperSessionId,
        });
      }, item.endSessionAfterMs);
    }
    return Promise.all(
      downloads.map((item) => (item.via === "xhr" ? viaXhr(item) : viaFetch(item))),
    );
  }, downloads);
}

const unique = (path: string, origin = FILES) => `${origin}${path}?n=${Math.random()}`;

function eventsFor(page: Page, url: string): Promise<RequestEventMessage[]> {
  return page.evaluate(
    (url) => (window.shaperEvents ?? []).filter((event) => event.url === url),
    url,
  );
}

test.describe("the network shaper", () => {
  test("slows an XHR download to the simulated curve", async ({ page }) => {
    await startSession(page, [FILES]);
    const url = unique(`/bytes/${MIB}`);
    const [result] = await download(page, [{ url, via: "xhr" }]);

    expect(result).toMatchObject({ status: 200, size: MIB, mismatches: 0, lengthComputable: true });
    expect(result?.progressEvents).toBeGreaterThanOrEqual(10);
    expectOnSchedule(result?.seconds ?? 0, expectedSeconds(MIB));

    await expect
      .poll(async () => (await eventsFor(page, url)).map(({ phase }) => phase))
      .toEqual(["start", "first-byte", "end"]);
    const [start, firstByte, end] = await eventsFor(page, url);
    expect((firstByte?.at ?? 0) - (start?.at ?? 0)).toBeCloseTo(curve.rttMs / 1000, 6);
    expect((end?.at ?? 0) - (start?.at ?? 0)).toBeCloseTo(expectedSeconds(MIB), 6);
    expect(end).toMatchObject({ bytes: MIB, totalBytes: MIB });
    expect(end?.firstByteLateMs).toBeLessThan(50);
    expect(end?.bodyLateMs).toBeLessThan(50);
    // The local server is faster than the simulated network: its bytes were all in before the link let them out.
    expect(end?.realFirstByteAt).toBeGreaterThanOrEqual(start?.at ?? Infinity);
    expect(end?.realEndAt).toBeLessThanOrEqual(end?.at ?? 0);
  });

  test("slows a fetch download to the simulated curve", async ({ page }) => {
    await startSession(page, [FILES]);
    const [result] = await download(page, [{ url: unique(`/bytes/${MIB}`), via: "fetch" }]);

    expect(result).toMatchObject({ status: 200, size: MIB, mismatches: 0, lengthComputable: true });
    expect(result?.progressEvents).toBeGreaterThanOrEqual(10);
    expectOnSchedule(result?.seconds ?? 0, expectedSeconds(MIB));
  });

  test("shares the link between two downloads at once", async ({ page }) => {
    await startSession(page, [FILES]);
    const results = await download(page, [
      { url: unique(`/bytes/${MIB}`), via: "xhr" },
      { url: unique(`/bytes/${MIB}`), via: "fetch" },
    ]);

    for (const result of results) {
      expect(result).toMatchObject({ size: MIB, mismatches: 0 });
      expectOnSchedule(result.seconds, expectedSeconds(MIB, 2));
    }
  });

  test("leaves other origins alone", async ({ page }) => {
    await startSession(page, [FILES]);
    const url = unique(`/bytes/${MIB}`, OTHER_ORIGIN);
    const [result] = await download(page, [{ url, via: "xhr" }]);

    expect(result).toMatchObject({ status: 200, size: MIB, mismatches: 0 });
    expect(result?.seconds).toBeLessThan(expectedSeconds(MIB) / 4);
    expect(await eventsFor(page, url)).toEqual([]);
  });

  test("with the wildcard, shapes every origin except the app's own", async ({ page }) => {
    await startSession(page, ["*"]);
    const remote = unique(`/bytes/${MIB}`, OTHER_ORIGIN);
    const [result] = await download(page, [{ url: remote, via: "xhr" }]);
    expectOnSchedule(result?.seconds ?? 0, expectedSeconds(MIB));

    const own = new URL("/favicon.svg", page.url()).href;
    const [app] = await download(page, [{ url: own, via: "fetch" }]);
    expect(app?.seconds).toBeLessThan(0.1);
    expect(await eventsFor(page, own)).toEqual([]);
  });

  test("forwards Range requests", async ({ page }) => {
    await startSession(page, [FILES]);
    const [result] = await download(page, [
      { url: unique(`/bytes/${MIB}`), via: "xhr", range: "bytes=1000-50999" },
    ]);

    expect(result).toMatchObject({
      status: 206,
      size: 50_000,
      mismatches: 0,
      contentRange: `bytes 1000-50999/${MIB}`,
    });
    expectOnSchedule(result?.seconds ?? 0, expectedSeconds(50_000));
  });

  test("passes redirects on, so the page sees the final URL", async ({ page }) => {
    await startSession(page, [FILES]);
    const [result] = await download(page, [{ url: unique("/redirect/50000"), via: "xhr" }]);

    expect(result).toMatchObject({ status: 200, size: 50_000, mismatches: 0 });
    expect(result?.responseUrl).toMatch(/^http:\/\/localhost:4013\/bytes\/50000\?n=/);
    // Two round trips, as on a real network: the redirect, then the file.
    expectOnSchedule(result?.seconds ?? 0, curve.rttMs / 1000 + expectedSeconds(50_000));
  });

  test("reports a download the page aborts", async ({ page }) => {
    await startSession(page, [FILES]);
    const url = unique(`/bytes/${MIB}`);
    const [result] = await download(page, [{ url, via: "xhr", abortAfterMs: 500 }]);

    expect(result?.aborted).toBe(true);
    await expect
      .poll(async () => (await eventsFor(page, url)).map(({ phase }) => phase))
      .toEqual(["start", "first-byte", "abort"]);
  });

  test("lets downloads in flight finish at full speed after the session ends", async ({ page }) => {
    await startSession(page, [FILES]);
    const [result] = await download(page, [
      { url: unique(`/bytes/${MIB}`), via: "xhr", endSessionAfterMs: 500 },
    ]);

    expect(result).toMatchObject({ status: 200, size: MIB, mismatches: 0 });
    expect(result?.seconds).toBeLessThan(expectedSeconds(MIB) / 2);
  });
});
