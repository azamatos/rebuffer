import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { computeMetrics, computeScore } from "../../src/core/metrics";
import { presets } from "../../src/core/netsim/presets";
import type { SavedRun } from "../../src/core/persist/runs";

// Every network preset, RUNS times in a row on the same page, one run at a time. The stream comes from a local server
// (tests/e2e/servers/files.mjs), so the real network never holds a run back: what varies is the simulation and the
// player. Results go to repeat-results/<preset>.json; tests/repeat/summarize.mjs turns them into a table.
const RUNS = Number(process.env.REPEAT_RUNS ?? 5);
const ONLY = process.env.REPEAT_NETWORKS?.split(",");
const STREAM = "http://localhost:4013/hls/repeat/master.m3u8";
const OUT = new URL("../../repeat-results/", import.meta.url);

/** What one run measured. */
export interface RepeatRun {
  score: number;
  firstFrameS: number | undefined;
  stalls: number;
  stallS: number;
  averageBitrate: number | undefined;
  switches: number;
  /** Downloads the real network (here, localhost) delivered later than the simulation released them. */
  late: number;
  requests: number;
}

for (const preset of presets.filter((network) => !ONLY || ONLY.includes(network.id))) {
  test(`${preset.name}: ${RUNS} runs`, async ({ page, browser }) => {
    test.setTimeout(RUNS * (preset.curve.lengthS + 60) * 1000);
    const runs: RepeatRun[] = [];
    let player = "";
    for (let i = 0; i < RUNS; i++) {
      await page.goto(`/run?stream=${encodeURIComponent(STREAM)}&network=${preset.id}&start=now`);
      const report = page.getByRole("link", { name: "See the report" });
      await expect(report).toBeVisible({ timeout: (preset.curve.lengthS + 45) * 1000 });
      const runId = (await report.getAttribute("href"))?.split("/").at(-1) ?? "";
      const saved = await page.evaluate(readSavedRun, runId);
      expect(saved.reason).toBe("complete");
      player = `${saved.player.name} ${saved.player.version}`;

      const metrics = computeMetrics(saved.events);
      runs.push({
        score: computeScore(metrics, saved.setup.network.curve).score,
        firstFrameS: metrics.firstFrameS,
        stalls: metrics.stalls.count,
        stallS: metrics.stalls.totalS,
        averageBitrate: metrics.averageBitrate,
        switches: metrics.switches.total,
        late: metrics.honesty.latency.late + metrics.honesty.bandwidth.late,
        requests: metrics.honesty.requests,
      });
    }

    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      new URL(`${preset.id}.json`, OUT),
      `${JSON.stringify(
        {
          network: { id: preset.id, name: preset.name, lengthS: preset.curve.lengthS },
          browser: `Chromium ${browser.version()}`,
          player,
          stream:
            "synthetic, 2:00, five qualities from 240p (0.47 Mbps) to 1080p (6 Mbps), 4 s segments",
          measuredAt: new Date().toISOString(),
          runs,
        },
        null,
        2,
      )}\n`,
    );
  });
}

/** Runs in the page: the saved run with this id, from the app's IndexedDB (src/core/persist/runs.ts). */
async function readSavedRun(id: string): Promise<SavedRun> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rebuffer");
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "IndexedDB didn't open"));
    };
  });
  return new Promise<SavedRun>((resolve, reject) => {
    const request = db.transaction("runs").objectStore("runs").get(`run/${id}`);
    request.onsuccess = () => {
      resolve(request.result as SavedRun);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "The run isn't saved"));
    };
  });
}
