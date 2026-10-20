import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatClock, formatDuration } from "@/core/format/time";
import { computeMetrics, computeScore, type RunMetrics } from "@/core/metrics";
import { ShapingError } from "@/core/netsim/client";
import { forgetSavedCopy, MAX_SAVED_BYTES } from "@/core/netsim/saved";
import {
  describeBrowser,
  newRunId,
  RUN_FORMAT,
  RUN_VERSION,
  savedRuns,
  type SavedRun,
} from "@/core/persist/runs";
import { summarize } from "@/core/persist/summary";
import type { NetworkCurve } from "@/core/netsim/curve";
import { networkById } from "@/core/netsim/networks";
import { curveFromParam } from "@/core/netsim/url";
import { PLAYER_PRESETS, PlayerUnsupportedError, type PlayerPreset } from "@/core/player";
import { playerTitle, settingsFromParam, type PlayerSettings } from "@/core/player/settings";
import { startRun, type Run, type RunResult } from "@/core/run/controller";
import {
  describeEvents,
  describeHonesty,
  describeNetworkCheck,
  formatMbps,
} from "@/core/run/describe";
import { eventsOfType, type RunEvent } from "@/core/run/events";
import { MAX_NETWORK_NAME } from "@/core/run/links";
import { CUSTOM_NETWORK_NAME, DEFAULT_NETWORK_ID, DEFAULT_PLAYER_ID } from "@/core/run/setup";
import { DEFAULT_STREAM, SAMPLE_STREAMS } from "@/core/samples";
import { Hint } from "@/ui/hints/Hint";
import { RunCharts } from "@/ui/run/RunCharts";

export interface RunSearch {
  stream?: string;
  network?: string;
  curve?: string;
  /** A drawn network's name; "Custom network" without one. */
  name?: string;
  player?: string;
  /** Player settings changed from the preset's, as `abrEwmaFastVoD:1.5` (the Report's "try next" ideas). */
  set?: string;
  /** Start as soon as the screen opens (Home's Run button); dropped from the URL once the run starts. */
  start?: string;
}

type Phase = "ready" | "starting" | "running" | "finished" | "failed";

/** The run's state as its chip says it: a word, a colour and a dot, which fade into the next state's. */
const PHASE_CHIPS: Record<Phase, { label: string; chip: string; dot: string }> = {
  ready: { label: "Ready", chip: "bg-fg/6 text-fg-2", dot: "bg-fg-3" },
  starting: { label: "Checking your connection…", chip: "bg-net/10 text-fg", dot: "bg-net" },
  running: {
    label: "Running",
    chip: "bg-accent/10 text-accent-hover",
    dot: "bg-accent",
  },
  finished: { label: "Finished", chip: "bg-toast text-toast-fg", dot: "bg-toast-icon" },
  failed: { label: "Couldn't run", chip: "bg-error/10 text-error-text", dot: "bg-error" },
};

interface ResolvedSetup {
  streamUrl: string;
  streamName: string;
  curve: NetworkCurve;
  /** The preset's id; undefined for a network drawn into the link. */
  networkId: string | undefined;
  networkName: string;
  player: PlayerPreset;
  /** Settings the link changes from the preset's. */
  changes: PlayerSettings;
}

/** Turns the URL's search params into a run setup, or explains what's wrong with them. */
function resolveSetup(
  search: RunSearch,
): { ok: true; setup: ResolvedSetup } | { ok: false; error: string } {
  const streamUrl = search.stream ?? DEFAULT_STREAM.url;
  const sample = SAMPLE_STREAMS.find((stream) => stream.url === streamUrl);

  let curve: NetworkCurve;
  let networkName: string;
  let networkId: string | undefined;
  if (search.curve) {
    const parsed = curveFromParam(search.curve);
    if (!parsed.ok)
      return { ok: false, error: `The network in this link is broken: ${parsed.errors.join(" ")}` };
    curve = parsed.curve;
    networkName = search.name?.trim().slice(0, MAX_NETWORK_NAME) || CUSTOM_NETWORK_NAME;
  } else {
    const preset = networkById(search.network ?? DEFAULT_NETWORK_ID);
    if (!preset)
      return { ok: false, error: `There's no network called “${search.network ?? ""}”.` };
    curve = preset.curve;
    networkName = preset.name;
    networkId = preset.id;
  }

  const player = PLAYER_PRESETS.find(
    (preset) => preset.id === (search.player ?? DEFAULT_PLAYER_ID),
  );
  if (!player)
    return { ok: false, error: `There's no player setup called “${search.player ?? ""}”.` };
  const changes = settingsFromParam(search.set ?? "");
  if (!changes.ok)
    return { ok: false, error: `The player settings in this link are broken: ${changes.error}` };

  return {
    ok: true,
    setup: {
      streamUrl,
      streamName: sample?.name ?? new URL(streamUrl).host,
      curve,
      networkId,
      networkName,
      player,
      changes: changes.settings,
    },
  };
}

const settingsOf = (setup: ResolvedSetup): PlayerSettings => ({
  ...setup.player.settings,
  ...setup.changes,
});

/** A finished run as the browser keeps it. */
function toSavedRun(setup: ResolvedSetup, result: RunResult, video: HTMLVideoElement): SavedRun {
  return {
    format: RUN_FORMAT,
    version: RUN_VERSION,
    id: newRunId(),
    startedAt: result.startedAt,
    savedAt: Date.now(),
    setup: {
      streamUrl: setup.streamUrl,
      streamName: setup.streamName,
      network: { id: setup.networkId, name: setup.networkName, curve: setup.curve },
      player: {
        presetId: setup.player.id,
        name: setup.player.name,
        settings: settingsOf(setup),
      },
    },
    player: result.player,
    environment: {
      browser: describeBrowser(navigator.userAgent),
      playerSize:
        video.clientWidth > 0
          ? { width: video.clientWidth, height: video.clientHeight }
          : undefined,
    },
    reason: result.reason,
    events: result.events,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ShapingError || error instanceof PlayerUnsupportedError)
    return error.message;
  return "The run couldn't start. Check the stream link and try again.";
}

const runRoute = getRouteApi("/run");

/** The Run screen as the router shows it: the setup comes from the URL. */
export function RunRoute() {
  return <RunPage search={runRoute.useSearch()} />;
}

export function RunPage({ search }: { search: RunSearch }) {
  const resolved = useMemo(() => resolveSetup(search), [search]);
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
  return <RunScreen setup={resolved.setup} autostart={search.start !== undefined} />;
}

function RunScreen({ setup, autostart }: { setup: ResolvedSetup; autostart: boolean }) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const runRef = useRef<Run | undefined>(undefined);
  // The run's handle, so the charts can follow it; its data never goes through React state.
  const [run, setRun] = useState<Run>();
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string>();
  const [events, setEvents] = useState<readonly RunEvent[]>([]);
  const [result, setResult] = useState<RunResult>();
  // Where the finished run was saved, or false if the browser wouldn't keep it.
  const [savedId, setSavedId] = useState<string | false>();

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

  const start = async () => {
    const video = videoRef.current;
    if (!video) return;
    setPhase("starting");
    setError(undefined);
    setResult(undefined);
    setSavedId(undefined);
    setEvents([]);
    try {
      const run = await startRun(
        { streamUrl: setup.streamUrl, curve: setup.curve, settings: settingsOf(setup) },
        video,
      );
      runRef.current = run;
      setRun(run);
      setPhase("running");
      const finished = await run.finished;
      setEvents(finished.events);
      setResult(finished);
      setPhase("finished");
      const saved = toSavedRun(setup, finished, video);
      try {
        await savedRuns().save(saved, summarize(saved));
        setSavedId(saved.id);
      } catch {
        setSavedId(false);
      }
    } catch (caught) {
      setError(errorMessage(caught));
      setPhase("failed");
    }
  };

  // Home's Run button opens the screen with `start`: run once, then drop it, so a reload or a copied link doesn't.
  const autostarted = useRef(false);
  const startNow = useEffectEvent(() => {
    void start();
  });
  useEffect(() => {
    if (!autostart || autostarted.current) return;
    autostarted.current = true;
    startNow();
    void navigate({
      to: "/run",
      search: (previous) => {
        const next = { ...previous };
        delete next.start;
        return next;
      },
      replace: true,
    });
  }, [autostart, navigate]);

  const metrics = events.length > 0 ? computeMetrics(events) : undefined;
  const lengthS = setup.curve.lengthS;
  const elapsed = Math.min(metrics?.endS ?? 0, lengthS);

  // The progress bar follows the run's clock every frame while it runs, so it glides instead of stepping with the
  // four copies a second; React never sets its scale, so the two don't fight.
  const fillRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (phase !== "running" && fillRef.current)
      fillRef.current.style.scale = `${elapsed / lengthS} 1`;
  });
  useEffect(() => {
    if (phase !== "running" || !run) return;
    let frame = 0;
    const draw = () => {
      const s = (performance.timeOrigin + performance.now() - run.startedAt) / 1000;
      if (fillRef.current)
        fillRef.current.style.scale = `${Math.min(Math.max(s, 0), lengthS) / lengthS} 1`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [phase, run, lengthS]);
  const chronological = describeEvents(events);
  const lines = [...chronological].reverse();
  // Switches and stalls are read out as they happen (polite); the rest of the log is there to read on demand.
  const spoken = chronological.filter((line) => line.kind === "switch" || line.kind === "stall");
  const headsUp = describeNetworkCheck(eventsOfType(events, "network-check")[0], setup.curve.rttMs);

  const chip = PHASE_CHIPS[phase];

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-5 sm:px-8">
      <section
        aria-label="Run status"
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-line bg-surface px-[18px] py-3.5"
      >
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h1 className="text-[17px] font-semibold">
              {setup.streamName} · {setup.networkName} · hls.js{" "}
              {playerTitle(setup.player.name, setup.changes)}
            </h1>
            <p
              role="status"
              className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[13px] font-medium transition-colors duration-200 motion-reduce:transition-none ${chip.chip}`}
            >
              <span
                aria-hidden="true"
                className={`size-[7px] rounded-full transition-colors duration-200 motion-reduce:transition-none ${chip.dot}`}
              />
              {chip.label}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="Run progress"
              aria-valuemin={0}
              aria-valuemax={lengthS}
              aria-valuenow={Math.round(elapsed)}
              aria-valuetext={`${formatClock(elapsed)} of ${formatClock(lengthS)}`}
              className="h-1.5 flex-auto overflow-hidden rounded-full bg-fg/8"
            >
              <div ref={fillRef} className="h-1.5 origin-left rounded-full bg-accent" />
            </div>
            <span className="font-mono text-[13px] whitespace-nowrap text-fg-2 tabular-nums">
              {formatClock(elapsed)} / {formatClock(lengthS)}
            </span>
          </div>
        </div>
        {phase === "running" ? (
          <button
            type="button"
            onClick={() => runRef.current?.stop()}
            className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-fg px-4 font-medium text-ground"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={phase === "starting"}
            className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-60"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" />
            </svg>
            {phase === "finished" || phase === "failed" ? "Run again" : "Start run"}
          </button>
        )}
      </section>

      {headsUp && (
        <p className="rounded-[10px] border border-warning/50 px-3.5 py-2.5 text-sm text-warning-text">
          {headsUp}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[10px] border border-error/50 px-3.5 py-2.5 text-error-text"
        >
          {error}
        </p>
      )}

      <Hint id="run-charts" title="What to watch">
        First run? On the charts, the blue area is the network, pink dashes the player&apos;s
        estimate, green steps the quality on screen, purple the buffer, red bands stalls.
      </Hint>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-[#0b0d10]">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label={`Video: ${setup.streamName}`}
              className="h-full w-full"
            />
          </div>
          {metrics && <Tiles metrics={metrics} />}
          {result && <Outcome result={result} savedId={savedId} />}
          <section
            aria-labelledby="log-h"
            className="flex max-h-96 min-h-24 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:max-h-none lg:flex-[1_1_0px]"
          >
            <h2 id="log-h" className="px-3.5 pt-3 pb-2 text-sm font-semibold">
              Event log <span className="font-normal text-fg-3">· newest first</span>
            </h2>
            <div role="log" aria-label="Switches and stalls" className="sr-only">
              {spoken.map((line, i) => (
                <p key={`${line.t}-${i}`}>
                  {line.time}: {line.text}
                </p>
              ))}
            </div>
            {lines.length === 0 ? (
              <p className="px-3.5 pb-3 text-sm text-fg-3">
                Events appear here once the run starts.
              </p>
            ) : (
              <ol
                tabIndex={0}
                aria-labelledby="log-h"
                className="min-h-0 flex-auto overflow-auto px-3.5 pb-2.5 text-sm tabular-nums"
              >
                {lines.map((line, i) => (
                  <li key={`${line.t}-${i}`} className="flex gap-3 border-t border-fg/6 py-2">
                    <span
                      className={`w-14 flex-none font-mono text-xs ${line.kind === "stall" || line.kind === "error" ? "text-error-text" : "text-fg-3"}`}
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

        <RunCharts curve={setup.curve} run={run} events={events} untilS={elapsed} />
      </div>
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
      className={`rounded-[10px] border bg-surface px-3 py-2.5 ${alert ? "border-error/50" : "border-line"}`}
    >
      <p className="text-xs text-fg-2">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">
        {value}
        {detail && <span className="text-[13px] font-normal text-fg-2"> · {detail}</span>}
      </p>
    </div>
  );
}

function Tiles({ metrics }: { metrics: RunMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-2">
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

function Outcome({ result, savedId }: { result: RunResult; savedId: string | false | undefined }) {
  const metrics = computeMetrics(result.events);
  const score = computeScore(metrics);
  const honesty = describeHonesty(metrics.honesty, result.setup.curve);
  return (
    <section
      aria-label="Result"
      className="fade-in flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3.5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-fg-2">QoE score</p>
          <p className="mt-1 text-5xl leading-none font-semibold tabular-nums">
            {Math.round(score.score)}
            <span className="text-lg font-medium text-fg-3"> / 100</span>
          </p>
        </div>
        {savedId && (
          <Link
            to="/runs/$runId"
            params={{ runId: savedId }}
            className="inline-flex min-h-10 items-center rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            See the report
          </Link>
        )}
      </div>
      {honesty.length > 0 && <p className="text-sm text-fg-2">{honesty.join(" ")}</p>}
      {savedId === false && (
        <p className="text-sm text-warning-text">
          This browser didn't let the lab save the run, so it has no report page.
        </p>
      )}
      <SavedCopyNote />
      <p className="text-xs text-fg-3">
        Player: {result.player.name} {result.player.version}
      </p>
    </section>
  );
}

/** What the browser keeps between runs, and a way to forget it. */
function SavedCopyNote() {
  const [state, setState] = useState<"kept" | "forgotten" | "failed">("kept");
  const forget = async () => {
    try {
      await forgetSavedCopy();
      setState("forgotten");
    } catch {
      setState("failed");
    }
  };
  return (
    <p aria-live="polite" className="text-xs text-fg-3">
      {state === "forgotten" ? (
        "Forgotten: the next run downloads everything over your real network again."
      ) : (
        <>
          {state === "failed" && "This browser didn't let the lab forget its downloads. "}
          This browser keeps what runs download (up to {MAX_SAVED_BYTES / 1024 / 1024} MB, unless
          the stream's server forbids it), so running a setup again doesn't depend on your real
          network.{" "}
          <button
            type="button"
            onClick={() => void forget()}
            className="text-fg-2 underline underline-offset-2 hover:text-fg"
          >
            Forget saved downloads
          </button>
        </>
      )}
    </p>
  );
}
