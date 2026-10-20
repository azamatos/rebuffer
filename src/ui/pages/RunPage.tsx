import { useEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDuration } from "@/core/format/time";
import { computeMetrics, computeScore, type RunMetrics } from "@/core/metrics";
import { ShapingError } from "@/core/netsim/client";
import type { NetworkCurve } from "@/core/netsim/curve";
import { presetById } from "@/core/netsim/presets";
import { curveFromParam } from "@/core/netsim/url";
import { PLAYER_PRESETS, PlayerUnsupportedError, type PlayerPreset } from "@/core/player";
import { startRun, type Run, type RunResult } from "@/core/run/controller";
import {
  describeEvents,
  describeHonesty,
  describeNetworkCheck,
  formatMbps,
} from "@/core/run/describe";
import { eventsOfType, type RunEvent } from "@/core/run/events";
import { DEFAULT_STREAM, SAMPLE_STREAMS } from "@/core/samples";
import { RunCharts } from "@/ui/run/RunCharts";

export interface RunSearch {
  stream?: string;
  network?: string;
  curve?: string;
  player?: string;
}

type Phase = "ready" | "starting" | "running" | "finished" | "failed";

interface ResolvedSetup {
  streamUrl: string;
  streamName: string;
  curve: NetworkCurve;
  networkName: string;
  player: PlayerPreset;
}

/** Turns the URL's search params into a run setup, or explains what's wrong with them. */
function resolveSetup(
  search: RunSearch,
): { ok: true; setup: ResolvedSetup } | { ok: false; error: string } {
  const streamUrl = search.stream ?? DEFAULT_STREAM.url;
  const sample = SAMPLE_STREAMS.find((stream) => stream.url === streamUrl);

  let curve: NetworkCurve;
  let networkName: string;
  if (search.curve) {
    const parsed = curveFromParam(search.curve);
    if (!parsed.ok)
      return { ok: false, error: `The network in this link is broken: ${parsed.errors.join(" ")}` };
    curve = parsed.curve;
    networkName = "Custom network";
  } else {
    const preset = presetById(search.network ?? "tunnel");
    if (!preset)
      return { ok: false, error: `There's no network called “${search.network ?? ""}”.` };
    curve = preset.curve;
    networkName = preset.name;
  }

  const player = PLAYER_PRESETS.find((preset) => preset.id === (search.player ?? "defaults"));
  if (!player)
    return { ok: false, error: `There's no player setup called “${search.player ?? ""}”.` };

  return {
    ok: true,
    setup: {
      streamUrl,
      streamName: sample?.name ?? new URL(streamUrl).host,
      curve,
      networkName,
      player,
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ShapingError || error instanceof PlayerUnsupportedError)
    return error.message;
  return "The run couldn't start. Check the stream link and try again.";
}

export function RunPage({ search }: { search: RunSearch }) {
  const resolved = useMemo(() => resolveSetup(search), [search]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const runRef = useRef<Run | undefined>(undefined);
  // The run's handle, so the charts can follow it; its data never goes through React state.
  const [run, setRun] = useState<Run>();
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string>();
  const [events, setEvents] = useState<readonly RunEvent[]>([]);
  const [result, setResult] = useState<RunResult>();

  // Live data stays out of React state; the screen copies it four times a second.
  useEffect(() => {
    if (phase !== "running") return;
    const timer = setInterval(() => {
      if (runRef.current) setEvents([...runRef.current.events]);
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, [phase]);

  useEffect(
    () => () => {
      runRef.current?.stop();
    },
    [],
  );

  if (!resolved.ok) {
    return (
      <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8">
        <h1 className="text-[32px] font-semibold tracking-tight">Run</h1>
        <p role="alert" className="mt-4 text-error-text">
          {resolved.error}
        </p>
      </section>
    );
  }
  const { setup } = resolved;

  const start = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPhase("starting");
    setError(undefined);
    setResult(undefined);
    setEvents([]);
    try {
      const run = await startRun(
        { streamUrl: setup.streamUrl, curve: setup.curve, settings: setup.player.settings },
        video,
      );
      runRef.current = run;
      setRun(run);
      setPhase("running");
      const finished = await run.finished;
      setEvents(finished.events);
      setResult(finished);
      setPhase("finished");
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("failed");
    }
  };

  const metrics = events.length > 0 ? computeMetrics(events) : undefined;
  const elapsed = Math.min(metrics?.endS ?? 0, setup.curve.lengthS);
  const lines = describeEvents(events).reverse();
  const headsUp = describeNetworkCheck(eventsOfType(events, "network-check")[0], setup.curve.rttMs);

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 py-6 sm:px-8">
      <section
        aria-label="Run status"
        className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[14px] border border-line bg-surface px-5 py-3.5"
      >
        <div className="min-w-0 flex-[1_1_360px]">
          <h1 className="text-lg font-semibold">
            {setup.streamName} · {setup.networkName} · hls.js {setup.player.name.toLowerCase()}
          </h1>
          <div className="mt-1.5 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Run progress"
              aria-valuemin={0}
              aria-valuemax={setup.curve.lengthS}
              aria-valuenow={Math.round(elapsed)}
              aria-valuetext={`${formatClock(elapsed)} of ${formatClock(setup.curve.lengthS)}`}
              className="h-1.5 flex-auto overflow-hidden rounded-full bg-white/8"
            >
              <div
                className="h-1.5 bg-accent"
                style={{ width: `${(100 * elapsed) / setup.curve.lengthS}%` }}
              />
            </div>
            <span className="font-mono text-[13px] text-fg-2 tabular-nums">
              {formatClock(elapsed)} / {formatClock(setup.curve.lengthS)}
            </span>
          </div>
        </div>
        <p role="status" className="text-sm text-fg-2">
          {phase === "ready" && "Ready."}
          {phase === "starting" && "Checking your connection, then starting the network simulator…"}
          {phase === "running" && "Running."}
          {phase === "finished" && "Finished."}
          {phase === "failed" && "Couldn't run."}
        </p>
        <div className="flex gap-2">
          {phase === "running" ? (
            <button
              type="button"
              onClick={() => runRef.current?.stop()}
              className="min-h-10 rounded-lg bg-fg px-4 font-medium text-ground"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={phase === "starting"}
              className="min-h-10 rounded-lg bg-accent px-4 font-semibold text-accent-ink disabled:opacity-60"
            >
              {phase === "finished" || phase === "failed" ? "Run again" : "Start run"}
            </button>
          )}
        </div>
      </section>

      {headsUp && (
        <p className="rounded-xl border border-warning/50 px-4 py-3 text-sm text-warning-text">
          {headsUp}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-error/50 px-4 py-3 text-error-text">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4">
          <div className="relative aspect-video overflow-hidden rounded-[14px] border border-line bg-[#0b0d10]">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label={`Video: ${setup.streamName}`}
              className="h-full w-full"
            />
          </div>
          {metrics && <Tiles metrics={metrics} />}
          {result && <Outcome result={result} />}
        </div>

        <RunCharts curve={setup.curve} run={run} events={events} untilS={elapsed} />
      </div>

      <section
        aria-labelledby="log-h"
        className="rounded-[14px] border border-line bg-surface px-5 py-4"
      >
        <h2 id="log-h" className="mb-2 text-[15px] font-semibold">
          Event log
        </h2>
        {lines.length === 0 ? (
          <p className="text-sm text-fg-3">Events appear here once the run starts.</p>
        ) : (
          <ol className="text-sm tabular-nums">
            {lines.map((line, i) => (
              <li key={`${line.t}-${i}`} className="flex gap-4 border-t border-white/6 py-2">
                <span
                  className={`w-14 flex-none font-mono ${line.kind === "stall" || line.kind === "error" ? "text-error-text" : "text-fg-3"}`}
                >
                  {line.time}
                </span>
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-3.5 ${alert ? "border-error/50" : "border-line"}`}
    >
      <p className="text-[13px] text-fg-2">{label}</p>
      <p className="mt-0.5 text-[26px] font-semibold tabular-nums">
        {value}
        {detail && <span className="text-base font-medium text-fg-2"> · {detail}</span>}
      </p>
    </div>
  );
}

function Tiles({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile
        label="First frame"
        value={metrics.firstFrameS === undefined ? "—" : `${metrics.firstFrameS.toFixed(2)} s`}
      />
      <Tile
        label="Stalls"
        value={String(metrics.stalls.count)}
        {...(metrics.stalls.count > 0 ? { detail: formatDuration(metrics.stalls.totalS) } : {})}
        alert={metrics.stalls.count > 0}
      />
      <Tile
        label="Average bitrate"
        value={metrics.averageBitrate === undefined ? "—" : formatMbps(metrics.averageBitrate)}
      />
      <Tile
        label="Quality switches"
        value={String(metrics.switches.total)}
        detail={`${metrics.switches.up} up, ${metrics.switches.down} down`}
      />
    </div>
  );
}

function Outcome({ result }: { result: RunResult }) {
  const metrics = computeMetrics(result.events);
  const score = computeScore(metrics);
  const honesty = describeHonesty(metrics.honesty, result.setup.curve);
  return (
    <section
      aria-label="Result"
      className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-5 py-4"
    >
      <p className="text-sm text-fg-2">QoE score</p>
      <p className="text-5xl font-semibold tabular-nums">
        {Math.round(score.score)}
        <span className="text-xl font-medium text-fg-3"> / 100</span>
      </p>
      {honesty.length > 0 && <p className="text-sm text-fg-2">{honesty.join(" ")}</p>}
      <p className="text-xs text-fg-3">
        Player: {result.player.name} {result.player.version}
      </p>
    </section>
  );
}
