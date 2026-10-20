import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatClock, formatDuration, formatWhen } from "@/core/format/time";
import { computeMetrics, computeScore, topLevel, type RunMetrics } from "@/core/metrics";
import { savedRuns, type SavedRun } from "@/core/persist/runs";
import { describeHonesty, formatMbps } from "@/core/run/describe";
import { whatHappened } from "@/core/run/notes";
import { tryNext } from "@/core/run/ideas";
import { describeSettings, ideaSearch, playerChanges, savedRunSearch } from "@/core/run/report";
import { playerTitle } from "@/core/player/settings";
import { buildTimeline, type Timeline } from "@/core/run/timeline";
import { RunCharts } from "@/ui/run/RunCharts";
import { useNow } from "@/ui/runs/useNow";

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ready"; run: SavedRun };

export function ReportPage({ runId }: { runId: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    let current = true;
    savedRuns()
      .get(runId)
      .then(
        (run) => {
          if (current) setLoaded(run ? { status: "ready", run } : { status: "missing" });
        },
        () => {
          if (current) setLoaded({ status: "missing" });
        },
      );
    return () => {
      current = false;
    };
  }, [runId]);

  if (loaded.status === "ready") return <Report run={loaded.run} />;
  return (
    <section className="mx-auto max-w-[1360px] px-4 py-10 sm:px-8">
      <h1 className="text-[32px] font-semibold tracking-tight">Report</h1>
      {loaded.status === "loading" ? (
        <p className="mt-4 text-fg-2">Loading the report…</p>
      ) : (
        <p className="mt-4 text-fg-2">
          This browser has no run at this address. Runs are kept only in the browser that ran them.{" "}
          <Link
            to="/runs"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            See the runs saved here
          </Link>
          .
        </p>
      )}
    </section>
  );
}

const card = "rounded-2xl border border-line bg-surface";
const secondaryButton =
  "inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4 text-fg hover:border-fg-3";

const signed = (points: number) => {
  const rounded = Math.round(points);
  return rounded === 0 ? "0" : rounded > 0 ? `+${rounded}` : `−${-rounded}`;
};

const endings: Record<SavedRun["reason"], string> = {
  complete: "played to the end",
  stopped: "stopped early",
  error: "ended with an error",
};

function Report({ run }: { run: SavedRun }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string>();
  const now = useNow();
  const metrics = useMemo(() => computeMetrics(run.events), [run]);
  const timeline = useMemo(() => buildTimeline(run.events), [run]);
  const notes = useMemo(() => whatHappened(timeline, run.setup.network.curve), [timeline, run]);
  const ideas = useMemo(
    () =>
      tryNext({
        metrics,
        timeline,
        curve: run.setup.network.curve,
        settings: run.setup.player.settings,
        presetId: run.setup.player.presetId,
        networkId: run.setup.network.id,
      }),
    [metrics, timeline, run],
  );
  const markers = useMemo(
    () => notes.map((note, i) => ({ t: note.start, label: String(i + 1) })),
    [notes],
  );
  const score = computeScore(metrics);
  const { network, player, streamName, streamUrl } = run.setup;
  const honesty = describeHonesty(metrics.honesty, network.curve);
  const simulationHeld =
    metrics.honesty.latency.late === 0 &&
    metrics.honesty.bandwidth.late === 0 &&
    metrics.honesty.hiddenS === 0;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rebuffer-run-${run.id}.json`;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    setNotice("Downloaded the run as JSON.");
  };

  const copyLink = async () => {
    const { href } = router.buildLocation({ to: "/run", search: savedRunSearch(run) });
    const link = new URL(href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Copied a link to this setup. It carries the setup, not these results.");
    } catch {
      setNotice(`This browser didn't let the lab copy. The link: ${link}`);
    }
  };

  const remove = async () => {
    await savedRuns().remove(run.id);
    await navigate({ to: "/runs" });
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-7 sm:px-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 font-mono text-[13px] tracking-[0.06em] text-accent">REPORT</p>
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
            {network.name} · hls.js {playerTitle(player.name, playerChanges(run))}
          </h1>
          <p className="mt-1 text-fg-2">
            {streamName} · {formatWhen(run.startedAt, now)} · {formatClock(metrics.endS)} run,{" "}
            {endings[run.reason]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/run"
            search={savedRunSearch(run, { start: true })}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4.5 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Run again
          </Link>
          <button type="button" onClick={exportJson} className={secondaryButton}>
            Export JSON
          </button>
          <button type="button" onClick={() => void copyLink()} className={secondaryButton}>
            Copy link
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-error/50 px-4 text-error-text hover:border-error"
          >
            Delete
          </button>
        </div>
        <p aria-live="polite" className="w-full text-sm text-fg-2 empty:hidden">
          {notice}
        </p>
      </section>

      <section aria-label="Results" className="flex flex-wrap items-stretch gap-4">
        <div className={`${card} flex flex-[1_1_300px] flex-col gap-3.5 p-5.5`}>
          <p className="text-sm text-fg-2">QoE score</p>
          <p className="text-[72px] leading-none font-semibold tracking-tight tabular-nums">
            {Math.round(score.score)}
            <span className="text-2xl font-medium tracking-normal text-fg-3"> / 100</span>
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
            <dt className="text-fg-2">Quality</dt>
            <dd className="text-right">{signed(score.quality)}</dd>
            <dt className="text-fg-2">Switches</dt>
            <dd className="text-right">{signed(-score.switching)}</dd>
            <dt className="text-fg-2">Stalls</dt>
            <dd className="text-right">{signed(-score.stalls)}</dd>
            <dt className="text-fg-2">Startup</dt>
            <dd className="text-right">{signed(-score.startup)}</dd>
          </dl>
          <p className="text-[13px] text-fg-3">
            Linear QoE model (Yin et al., 2015), scaled so 100 is top quality all the way with no
            stalls.{" "}
            <a
              href="#score"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              How it's computed
            </a>
          </p>
        </div>
        <Tiles metrics={metrics} timeline={timeline} />
      </section>

      <section aria-labelledby="timeline-h" className="flex flex-col gap-3">
        <h2 id="timeline-h" className="text-lg font-semibold">
          Timeline
        </h2>
        <RunCharts
          curve={network.curve}
          run={undefined}
          events={run.events}
          untilS={metrics.endS}
          markers={markers}
        />
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-labelledby="what-h" className={`${card} min-w-0 flex-[999_1_560px] p-5`}>
          <h2 id="what-h" className="mb-1 text-lg font-semibold">
            What happened
          </h2>
          <p className="mb-3.5 text-sm text-fg-3">
            The numbers match the markers on the bandwidth chart.
          </p>
          <ol className="flex flex-col gap-3.5">
            {notes.map((note, i) => (
              <li key={`${note.start}-${i}`} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="inline-flex size-6.5 flex-none items-center justify-center rounded-full bg-fg text-sm font-semibold text-ground"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-mono text-[13px] text-fg-3 tabular-nums">
                    {formatClock(note.start)}
                    {note.end - note.start >= 1 && `–${formatClock(note.end)}`}
                  </p>
                  <p className="mt-0.5">{note.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="try-h" className={`${card} min-w-0 flex-[1_1_380px] p-5`}>
          <h2 id="try-h" className="mb-1 text-lg font-semibold">
            Try next
          </h2>
          <p className="mb-3.5 text-sm text-fg-3">
            Ideas, not promises. Each one runs this setup again with one change.
          </p>
          <ul className="flex flex-col gap-2.5">
            {ideas.map((idea) => (
              <li
                key={idea.title}
                className="flex flex-wrap items-center justify-between gap-2.5 border-t border-white/6 pt-2.5"
              >
                <div className="min-w-0 flex-[1_1_200px]">
                  <p className="font-medium">{idea.title}</p>
                  <p className="font-mono text-[13px] text-fg-3">{idea.change}</p>
                </div>
                <Link
                  to="/run"
                  search={ideaSearch(run, idea)}
                  className="inline-flex min-h-9 items-center rounded-lg border border-line-strong px-3 text-sm text-fg hover:border-fg-3"
                >
                  Run<span className="sr-only">: {idea.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-labelledby="setup-h" className={`${card} min-w-0 flex-[999_1_560px] p-5`}>
          <h2 id="setup-h" className="mb-3 text-lg font-semibold">
            Setup
          </h2>
          <dl className="grid grid-cols-[minmax(90px,140px)_1fr] gap-x-5 gap-y-2.5 text-[15px]">
            <dt className="text-fg-2">Stream</dt>
            <dd className="min-w-0">
              {streamName}
              <span className="block truncate font-mono text-[13px] text-fg-3">{streamUrl}</span>
            </dd>
            <dt className="text-fg-2">Network</dt>
            <dd>
              {network.name} · {formatClock(network.curve.lengthS)} · RTT {network.curve.rttMs} ms
            </dd>
            <dt className="text-fg-2">Player</dt>
            <dd>
              {run.player.name} {run.player.version} · {player.name}
              <span className="mt-1 block font-mono text-[13px] leading-relaxed text-fg-2">
                {describeSettings(player.settings).join(" · ")}
              </span>
            </dd>
            <dt className="text-fg-2">Browser</dt>
            <dd>
              {run.environment.browser}
              {run.environment.playerSize &&
                ` · player ${run.environment.playerSize.width}×${run.environment.playerSize.height}`}
            </dd>
          </dl>
        </section>

        <section aria-labelledby="check-h" className={`${card} min-w-0 flex-[1_1_380px] p-5`}>
          <h2 id="check-h" className="mb-3 flex items-center gap-2 text-lg font-semibold">
            {simulationHeld ? (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <circle
                  cx="9"
                  cy="9"
                  r="8"
                  fill="none"
                  strokeWidth="1.6"
                  className="stroke-accent"
                />
                <path
                  d="M5.5 9.2 L8 11.5 L12.5 6.5"
                  fill="none"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-accent"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 0.8 L11.5 11 H0.5 Z" className="fill-warning" />
              </svg>
            )}
            Simulation check
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4.5 text-[15px] text-fg-2">
            {honesty.length === 0 ? (
              <li>No downloads went through the simulated network.</li>
            ) : (
              honesty.map((sentence) => <li key={sentence}>{sentence}</li>)
            )}
          </ul>
        </section>
      </div>

      <section id="score" aria-labelledby="score-h" className="border-t border-line pt-5">
        <h2 id="score-h" className="mb-2 text-lg font-semibold">
          How the score is computed
        </h2>
        <p className="max-w-[880px] text-fg-2">
          Each segment played earns its bitrate in Mbps. Each quality change costs the size of the
          jump, in Mbps. Each second of stall costs as much as a segment at the top quality, and so
          does each second before the first frame. The total is divided by what a perfect run would
          earn (top quality all the way, no stalls, an instant start) and shown out of 100. Model:
          Yin et al., “A Control-Theoretic Approach for Dynamic Adaptive Video Streaming over HTTP”,
          SIGCOMM 2015.
        </p>
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  alert = false,
}: {
  label: ReactNode;
  value: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-surface px-4 py-3.5 ${alert ? "border-error/50" : "border-line"}`}
    >
      <p className="text-[13px] text-fg-2">{label}</p>
      <p className="mt-0.5 mb-0.5 text-[26px] font-semibold tabular-nums">{value}</p>
      <p className="text-[13px] text-fg-3">{note}</p>
    </div>
  );
}

function Tiles({ metrics, timeline }: { metrics: RunMetrics; timeline: Timeline }) {
  const top = topLevel(metrics.levels);
  // Counted as the downloads chart and the notes count them, so a download the player dropped for the next one counts.
  const abandoned = timeline.downloads.filter((download) => download.state === "abandoned").length;
  return (
    <div className="grid min-w-0 flex-[999_1_640px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      <Tile
        label="First frame"
        value={metrics.firstFrameS === undefined ? "—" : `${metrics.firstFrameS.toFixed(2)} s`}
        note="From the start of the run to the first picture"
      />
      <Tile
        label="Stalls"
        value={
          metrics.stalls.count === 0
            ? "0"
            : `${metrics.stalls.count} · ${formatDuration(metrics.stalls.totalS)}`
        }
        note="Waiting for data after the first frame"
        alert={metrics.stalls.count > 0}
      />
      <Tile
        label="Rebuffer ratio"
        value={`${(metrics.rebufferRatio * 100).toFixed(1)}%`}
        note="Stall time ÷ (play time + stall time)"
      />
      <Tile
        label="Average bitrate"
        value={metrics.averageBitrate === undefined ? "—" : formatMbps(metrics.averageBitrate)}
        note="Of the quality on screen, over play time"
      />
      <Tile
        label="Quality switches"
        value={String(metrics.switches.total)}
        note={`${metrics.switches.up} up, ${metrics.switches.down} down`}
      />
      <Tile
        label="At top quality"
        value={`${Math.round(metrics.topQualityShare * 100)}%`}
        note={`${top?.name ?? "Top quality"} share of play time`}
      />
      <Tile
        label="Wasted data"
        value={`${(metrics.wastedBytes / 1e6).toFixed(1)} MB`}
        note={`${abandoned} abandoned ${abandoned === 1 ? "download" : "downloads"}`}
      />
    </div>
  );
}
