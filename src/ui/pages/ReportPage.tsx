import { getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { formatClock, formatDuration, formatWhen } from "@/core/format/time";
import { computeMetrics, computeScore, topLevel, type RunMetrics } from "@/core/metrics";
import { savedRuns, type SavedRun } from "@/core/persist/runs";
import { describeHonesty, formatMbps, honestyWarning } from "@/core/run/describe";
import { whatHappened, type Note } from "@/core/run/notes";
import { noteRange, wholeRange, type TimeRange } from "@/core/run/range";
import { tryNext } from "@/core/run/ideas";
import { describeSettings, ideaSearch, playerChanges, savedRunSearch } from "@/core/run/report";
import { playerTitle } from "@/core/player/settings";
import { buildTimeline, type Timeline } from "@/core/run/timeline";
import { flash } from "@/ui/feedback/flash";
import { toast } from "@/ui/feedback/toast";
import { MenuItem, Popover } from "@/ui/menu/Popover";
import { ZoomBar } from "@/ui/report/ZoomBar";
import { RunCharts } from "@/ui/run/RunCharts";
import { useNow } from "@/ui/runs/useNow";

type Loaded = { status: "loading" } | { status: "missing" } | { status: "ready"; run: SavedRun };

const reportRoute = getRouteApi("/runs/$runId");

/** The Report as the router shows it: the run's id comes from the address. */
export function ReportRoute() {
  return <ReportPage runId={reportRoute.useParams().runId} />;
}

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

  // Keyed by the run, so another report starts afresh (the whole run on view, no notice).
  if (loaded.status === "ready") return <Report key={loaded.run.id} run={loaded.run} />;
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

const card = "rounded-xl border border-line bg-surface";
const secondaryButton =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3";

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
  // Only when the clipboard refuses: the link stays on screen to copy by hand.
  const [copyFailed, setCopyFailed] = useState<string>();
  const [range, setRange] = useState<TimeRange>(() => wholeRange(run.setup.network.curve.lengthS));
  const timelineRef = useRef<HTMLElement>(null);
  const timelineHeading = useRef<HTMLHeadingElement>(null);
  const scoreRef = useRef<HTMLDetailsElement>(null);
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
  const warning = honestyWarning(metrics.honesty);
  const settings = describeSettings(player.settings);

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
    toast("Downloaded the run as JSON.");
  };

  const copyLink = async () => {
    const { href } = router.buildLocation({ to: "/run", search: savedRunSearch(run) });
    const link = new URL(href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(link);
      setCopyFailed(undefined);
      toast("Copied a link to this setup. It carries the setup, not these results.");
    } catch {
      setCopyFailed(link);
    }
  };

  // A note's "Show on the chart": zoom to it and take the reader to the charts, by keyboard as well.
  const showNote = (note: Note) => {
    // The charts redraw for the new stretch first, so the page doesn't change under the scroll.
    flushSync(() => {
      setRange(noteRange(note.start, note.end, network.curve.lengthS));
    });
    const heading = timelineHeading.current;
    // WebKit doesn't scroll to a heading it focuses, so scroll there explicitly.
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
    flash(timelineRef.current?.querySelector("figure"));
  };

  // The score card's link opens the explanation at the bottom and takes the reader there.
  const showScoreMethod = () => {
    const details = scoreRef.current;
    if (!details) return;
    details.open = true;
    const summary = details.querySelector("summary");
    summary?.focus({ preventScroll: true });
    details.scrollIntoView({ block: "center" });
    flash(details);
  };

  const remove = async () => {
    await savedRuns().remove(run.id);
    await navigate({ to: "/runs" });
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8">
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="mb-0.5 font-mono text-xs tracking-[0.06em] text-accent">REPORT</p>
          <h1 className="text-[28px] font-semibold tracking-tight">
            {network.name} · hls.js {playerTitle(player.name, playerChanges(run))}
          </h1>
          <p className="mt-0.5 text-fg-2">
            {streamName} · {formatWhen(run.startedAt, now)} · {formatClock(metrics.endS)} run,{" "}
            {endings[run.reason]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/run"
            search={savedRunSearch(run, { start: true })}
            className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Run again
          </Link>
          <Link to="/networks" search={{ run: run.id }} className={secondaryButton}>
            Change network
          </Link>
          <Link to="/runs/compare" search={{ a: run.id }} className={secondaryButton}>
            Compare with…
          </Link>
          <button type="button" onClick={() => void copyLink()} className={secondaryButton}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="fill-none stroke-current"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M6.5 9.5 L9.5 6.5 M7 4.5 L8.5 3 A2.5 2.5 0 0 1 13 6.5 L11.5 8 M9 11.5 L7.5 13 A2.5 2.5 0 0 1 3 9.5 L4.5 8" />
            </svg>
            Copy link
          </button>
          <Popover
            label="More actions"
            align="end"
            buttonClassName={`${secondaryButton} px-3 aria-expanded:border-fg-3`}
            button={
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
                <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
              </svg>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    exportJson();
                    close();
                  }}
                >
                  Export JSON
                </MenuItem>
                <MenuItem
                  danger
                  onSelect={() => {
                    void remove();
                  }}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
        {copyFailed && (
          <p role="alert" className="w-full text-sm break-all text-fg-2">
            This browser didn&apos;t let the lab copy. The link: {copyFailed}
          </p>
        )}
      </section>

      <section aria-label="Simulation check">
        {warning ? (
          <details className="group rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5">
            <summary className="flex cursor-pointer list-none items-start gap-2.5 [&::-webkit-details-marker]:hidden">
              <svg
                width="16"
                height="16"
                viewBox="0 0 12 12"
                aria-hidden="true"
                className="mt-1 flex-none"
              >
                <path d="M6 0.8 L11.5 11 H0.5 Z" className="fill-warning" />
              </svg>
              <span className="min-w-0 flex-auto">
                <strong className="font-semibold">Simulation check:</strong> {warning}
              </span>
              <span className="inline-flex flex-none items-center gap-1 pt-0.5 text-sm text-warning-text">
                Details
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                >
                  <path
                    d="M2 3.5 L5 6.5 L8 3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </span>
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-11 text-sm text-fg-2">
              {honesty.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="flex items-start gap-2 text-sm text-fg-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 18 18"
              aria-hidden="true"
              className="flex-none"
            >
              <circle cx="9" cy="9" r="8" fill="none" strokeWidth="1.6" className="stroke-accent" />
              <path
                d="M5.5 9.2 L8 11.5 L12.5 6.5"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-accent"
              />
            </svg>
            <span>
              <span className="font-medium text-fg">Simulation check:</span>{" "}
              {honesty.length === 0
                ? "No downloads went through the simulated network."
                : honesty.join(" ")}
            </span>
          </p>
        )}
      </section>

      <section aria-label="Results" className="flex flex-wrap items-stretch gap-3">
        <div
          className={`${card} flex max-w-full flex-[1_1_300px] flex-col gap-2.5 px-[18px] py-4 sm:max-w-[360px]`}
        >
          <p className="text-[13px] text-fg-2">QoE score</p>
          <p className="text-[56px] leading-none font-semibold tracking-tight tabular-nums">
            {Math.round(score.score)}
            <span className="text-xl font-medium tracking-normal text-fg-3"> / 100</span>
          </p>
          <dl className="flex flex-col gap-1.5 text-[13px] tabular-nums">
            <ScorePart label="Quality" points={score.quality} bar="bg-onscreen" />
            <ScorePart label="Switches" points={-score.switching} bar="bg-fg-3" />
            <ScorePart label="Stalls" points={-score.stalls} bar="bg-error" />
            <ScorePart label="Startup" points={-score.startup} bar="bg-fg-3" />
          </dl>
          <a
            href="#score"
            onClick={(event) => {
              event.preventDefault();
              showScoreMethod();
            }}
            className="w-fit text-[13px] text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            How the score is computed
          </a>
        </div>
        <Tiles metrics={metrics} timeline={timeline} />
      </section>

      <section ref={timelineRef} aria-labelledby="timeline-h" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2
              id="timeline-h"
              ref={timelineHeading}
              tabIndex={-1}
              className="scroll-mt-4 text-lg font-semibold outline-none"
            >
              Timeline
            </h2>
            <p className="text-[13px] text-fg-3">
              Drag across a chart to zoom in; double-click to see the whole run.
            </p>
          </div>
          <ZoomBar range={range} lengthS={network.curve.lengthS} onChange={setRange} />
        </div>
        <RunCharts
          curve={network.curve}
          run={undefined}
          events={run.events}
          untilS={metrics.endS}
          markers={markers}
          range={range}
          onPick={setRange}
        />
      </section>

      <section aria-labelledby="what-h" className={`${card} px-[18px] pt-3.5 pb-2`}>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="what-h" className="text-lg font-semibold">
            What happened
          </h2>
          <p className="text-[13px] text-fg-3">The numbers match the markers on the chart.</p>
        </div>
        <ol>
          {notes.map((note, i) => (
            <li
              key={`${note.start}-${i}`}
              className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-t border-fg/6 py-2.5 sm:grid-cols-[22px_92px_minmax(0,1fr)_auto]"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-[22px] items-center justify-center rounded-full bg-fg text-xs font-semibold text-ground"
              >
                {i + 1}
              </span>
              <span className="pt-1 font-mono text-xs text-fg-3 tabular-nums">
                {formatClock(note.start)}
                {note.end - note.start >= 1 && `–${formatClock(note.end)}`}
              </span>
              <span className="col-span-2 col-start-2 max-sm:row-start-2 sm:col-span-1 sm:col-start-3">
                {note.text}
              </span>
              <button
                type="button"
                onClick={() => {
                  showNote(note);
                }}
                className="col-start-3 row-start-1 rounded-md px-1.5 py-0.5 text-[13px] font-medium whitespace-nowrap text-accent-hover hover:bg-accent/10 sm:col-start-4"
              >
                <span aria-hidden="true">Show ↗</span>
                <span className="sr-only">
                  Show on the chart: note {i + 1}, {formatClock(note.start)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="try-h" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="try-h" className="text-lg font-semibold">
            Try next
          </h2>
          <p className="text-[13px] text-fg-3">
            Ideas, not promises. Each one runs this setup again with one change.
          </p>
        </div>
        <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => (
            <li key={idea.title} className={`${card} flex items-center gap-3 px-3.5 py-3`}>
              <div className="min-w-0 flex-auto">
                <p className="font-semibold">{idea.title}</p>
                <p className="font-mono text-xs text-fg-2">{idea.change}</p>
              </div>
              <Link
                to="/run"
                search={ideaSearch(run, idea)}
                className="inline-flex min-h-9 flex-none items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm text-fg hover:border-fg-3"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />
                </svg>
                Run<span className="sr-only">: {idea.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="setup-h" className={`${card} px-[18px] py-3.5`}>
        <h2 id="setup-h" className="mb-2 text-lg font-semibold">
          Setup
        </h2>
        <dl className="grid gap-x-6 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-fg-3">Stream</dt>
            <dd>
              {streamName}
              <span className="block truncate font-mono text-xs text-fg-3">{streamUrl}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">Network</dt>
            <dd>
              {network.name} · {formatClock(network.curve.lengthS)} · RTT {network.curve.rttMs} ms
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">Player</dt>
            <dd>
              {run.player.name} {run.player.version} · {player.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">Browser</dt>
            <dd>
              {run.environment.browser}
              {run.environment.playerSize &&
                ` · player ${run.environment.playerSize.width}×${run.environment.playerSize.height}`}
            </dd>
          </div>
        </dl>
        <details className="mt-2.5 border-t border-fg/6 pt-2">
          <summary className="w-fit cursor-pointer text-sm text-fg-2 hover:text-fg">
            Player settings: {player.name} ({settings.length})
          </summary>
          <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-fg-2">
            {settings.join(" · ")}
          </p>
        </details>
      </section>

      <details
        id="score"
        ref={scoreRef}
        className="scroll-mt-4 rounded-xl border border-line px-[18px] py-3"
      >
        <summary className="w-fit cursor-pointer font-semibold">How the score is computed</summary>
        <p className="mt-2 max-w-[880px] text-fg-2">
          Each segment played earns its bitrate in Mbps. Each quality change costs the size of the
          jump, in Mbps. Each second of stall costs as much as a segment at the top quality, and so
          does each second before the first frame. The total is divided by what a perfect run would
          earn (top quality all the way, no stalls, an instant start) and shown out of 100, so 100
          is top quality all the way with no stalls. Model: Yin et al., “A Control-Theoretic
          Approach for Dynamic Adaptive Video Streaming over HTTP”, SIGCOMM 2015.
        </p>
      </details>
    </div>
  );
}

/** One line of the score's breakdown: its points, and a bar of them out of 100. */
function ScorePart({ label, points, bar }: { label: string; points: number; bar: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-2">
      <dt className="text-fg-2">{label}</dt>
      <dd className="contents">
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-fg/6">
          <span
            className={`block h-1.5 rounded-full ${bar}`}
            style={{ width: `${Math.min(Math.abs(points), 100)}%` }}
          />
        </span>
        <span className="text-right">{signed(points)}</span>
      </dd>
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
      className={`rounded-[10px] border bg-surface px-3 py-2.5 ${alert ? "border-error/50" : "border-line"}`}
    >
      <p className="text-xs text-fg-2">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs text-fg-3">{note}</p>
    </div>
  );
}

function Tiles({ metrics, timeline }: { metrics: RunMetrics; timeline: Timeline }) {
  const top = topLevel(metrics.levels);
  // Counted as the downloads chart and the notes count them, so a download the player dropped for the next one counts.
  const abandoned = timeline.downloads.filter((download) => download.state === "abandoned").length;
  const { realBps } = metrics.honesty.bandwidth;
  const { requests, saved } = metrics.honesty;
  return (
    <div className="grid min-w-0 flex-[999_1_560px] grid-cols-2 gap-2 sm:grid-cols-4">
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
      <Tile
        label="Real network"
        value={realBps === undefined ? "—" : formatMbps(realBps)}
        note={
          realBps !== undefined
            ? "Your connection's speed while downloading"
            : requests === 0
              ? "No downloads went over it"
              : saved === requests
                ? "Every download came from the saved copy"
                : "Its downloads were too quick to measure"
        }
      />
    </div>
  );
}
