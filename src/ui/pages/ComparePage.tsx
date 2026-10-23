import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { mountCompareCharts, type CompareCharts } from "@/charts/compare";
import { formatClock, formatDuration, formatWhen } from "@/core/format/time";
import type { RunSummary, SavedRun } from "@/core/persist/runs";
import { playerTitle } from "@/core/player/settings";
import {
  bufferTakeaway,
  compared,
  compareMetrics,
  compareRows,
  compareVerdict,
  describeCompareQuality,
  endedEarly,
  qualityTakeaway,
  setupChanges,
  sharedSpanS,
  stallsTakeaway,
  tally,
  type ComparedRun,
  type MetricComparison,
  type SetupChange,
  type Verdict,
} from "@/core/run/compare";
import { playerChanges, runSearchWithNetwork, savedRunSearch } from "@/core/run/report";
import { SeverityIcon } from "@/ui/inspect/SeverityIcon";
import { ChartOrTable, Key, ShowAs, Td, Th } from "@/ui/run/chart-parts";
import { RunSwatch } from "@/ui/runs/RunSwatch";
import { useNow } from "@/ui/runs/useNow";
import { useSavedRun } from "@/ui/runs/useSavedRun";
import { useSavedRuns } from "@/ui/runs/useSavedRuns";
import { useTheme } from "@/ui/theme/useTheme";

export interface CompareSearch {
  a?: string;
  b?: string;
}

const titleOf = (summary: RunSummary) => summary.playerTitle ?? summary.playerName;

/** The search params for a pair, leaving out a side that has no run. */
const pair = (a: string | undefined, b: string | undefined): CompareSearch => ({
  ...(a && { a }),
  ...(b && { b }),
});

const compareRoute = getRouteApi("/runs/compare");

/** Compare as the router shows it: the two runs come from the URL. */
export function CompareRoute() {
  return <ComparePage search={compareRoute.useSearch()} />;
}

/** Two runs saved in this browser, side by side: B read against A. */
export function ComparePage({ search }: { search: CompareSearch }) {
  const navigate = useNavigate();
  const runs = useSavedRuns();
  const now = useNow();
  const a = useSavedRun(search.a);
  const b = useSavedRun(search.b);

  // Without a choice, compare the newest run (B) with the one before it (A); from a report, with the newest other.
  useEffect(() => {
    if (!Array.isArray(runs) || runs.length < 2 || (search.a && search.b)) return;
    const newestOther = (id: string | undefined) => runs.find((run) => run.id !== id)?.id;
    const next = search.a
      ? pair(search.a, newestOther(search.a))
      : search.b
        ? pair(newestOther(search.b), search.b)
        : pair(runs[1]?.id, runs[0]?.id);
    void navigate({ to: "/runs/compare", search: next, replace: true });
  }, [runs, search.a, search.b, navigate]);

  const choose = (side: "a" | "b", id: string) => {
    void navigate({
      to: "/runs/compare",
      search: (previous) => (side === "a" ? pair(id, previous.b) : pair(previous.a, id)),
      replace: true,
    });
  };
  const swap = () => {
    void navigate({ to: "/runs/compare", search: pair(search.b, search.a), replace: true });
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[13px] tracking-[0.06em] text-accent">COMPARE</p>
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">
          Compare two runs
        </h1>
        <p className="text-fg-2">Runs saved in this browser. B is read against A.</p>
      </header>

      {runs === undefined && <p className="text-fg-2">Loading the runs…</p>}
      {runs === "unavailable" && (
        <p className="text-warning-text">
          This browser doesn&apos;t let the lab keep runs (private browsing can block it).
        </p>
      )}
      {Array.isArray(runs) && runs.length < 2 && (
        <p className="text-fg-2">
          Comparing needs two saved runs; this browser has {runs.length === 0 ? "none" : "one"}.{" "}
          <Link
            to="/"
            hash="setup"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Set up a run on Home
          </Link>
          .
        </p>
      )}

      {Array.isArray(runs) && runs.length >= 2 && (
        <section
          aria-label="Runs to compare"
          className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[14px] border border-line bg-surface p-5"
        >
          <RunPicker
            side="a"
            runs={runs}
            now={now}
            value={search.a}
            onChange={(id) => {
              choose("a", id);
            }}
          />
          <button
            type="button"
            onClick={swap}
            className="min-h-11 rounded-[10px] border border-line-strong px-4 hover:border-fg-3"
          >
            Swap A and B
          </button>
          <RunPicker
            side="b"
            runs={runs}
            now={now}
            value={search.b}
            onChange={(id) => {
              choose("b", id);
            }}
          />
        </section>
      )}

      {(a?.status === "missing" || b?.status === "missing") && (
        <p className="text-fg-2">
          This browser has no run{" "}
          {a?.status === "missing" && b?.status === "missing"
            ? "at either address"
            : `for ${a?.status === "missing" ? "A" : "B"}`}
          ; runs are kept only in the browser that ran them. Pick another above.
        </p>
      )}
      {a?.status === "ready" && b?.status === "ready" && (
        <Comparison key={`${a.run.id}-${b.run.id}`} a={a.run} b={b.run} />
      )}
    </div>
  );
}

function RunPicker({
  side,
  runs,
  now,
  value,
  onChange,
}: {
  side: "a" | "b";
  runs: RunSummary[];
  now: number;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const id = useId();
  // A run that isn't saved here (deleted, or from another browser) shows as no choice, not as the first run.
  const known = runs.some((run) => run.id === value);
  return (
    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <RunSwatch side={side} />
        Run {side.toUpperCase()}
      </label>
      <select
        id={id}
        value={known ? value : ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-11 w-full rounded-[10px] border border-line-strong bg-ground px-3"
      >
        {!known && <option value="">Choose a run</option>}
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.networkName} · {titleOf(run)} · {Math.round(run.score)}/100 ·{" "}
            {formatWhen(run.savedAt, now)}
          </option>
        ))}
      </select>
    </div>
  );
}

const card = "rounded-2xl border border-line bg-surface";
const textLink = "text-accent underline underline-offset-2 hover:text-accent-hover";

const verdicts: Record<Verdict, { text: string; icon?: string; className: string }> = {
  better: { text: "better", icon: "▲", className: "text-accent" },
  worse: { text: "worse", icon: "▼", className: "text-error-text" },
  same: { text: "same", icon: "=", className: "text-fg-3" },
  spread: { text: "within spread", icon: "≈", className: "text-fg-3" },
  "not-comparable": { text: "not comparable", className: "text-fg-3" },
};

function VerdictWord({ verdict }: { verdict: Verdict }) {
  const { text, icon, className } = verdicts[verdict];
  return (
    <span className={`text-sm ${className}`}>
      {icon && <span aria-hidden="true">{icon} </span>}
      {text}
    </span>
  );
}

/** A run's setup in a line: the network and the player, and the stream when the two runs' streams differ. */
function setupLine(run: SavedRun, withStream: boolean): string {
  const player = playerTitle(run.setup.player.name, playerChanges(run));
  return `${withStream ? `${run.setup.streamName} · ` : ""}${run.setup.network.name} · ${player}`;
}

function Comparison({ a: runA, b: runB }: { a: SavedRun; b: SavedRun }) {
  const ended = useMemo(() => endedEarly(runA, runB), [runA, runB]);
  const sharedS = useMemo(() => sharedSpanS(runA, runB), [runA, runB]);
  // When a run ended early, the stretch both covered compares; whole runs on request.
  const [whole, setWhole] = useState(false);
  const untilS = whole ? undefined : sharedS;
  const a = useMemo(() => compared(runA, untilS), [runA, untilS]);
  const b = useMemo(() => compared(runB, untilS), [runB, untilS]);
  const firstFrameOnly = whole && ended.length > 0;
  const rows = compareMetrics(a, b, { firstFrameOnly });
  const changes = setupChanges(runA, runB);
  const verdict = compareVerdict(a, b, changes, rows, { ended, whole });
  const otherStream = runA.setup.streamUrl !== runB.setup.streamUrl;
  const stoppedB = ended.find((end) => end.side === "B");

  return (
    <>
      <Warning a={runA} b={runB} changes={changes} />
      {sharedS !== undefined && ended[0] && (
        <section
          role="note"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border border-line-strong bg-note/10 px-3.5 py-3"
        >
          <p className="flex min-w-0 flex-[1_1_360px] items-start gap-2 text-sm">
            <span className="flex h-5 items-center">
              <SeverityIcon severity="note" size={12} />
            </span>
            <span>
              <strong className="font-semibold text-note-text">Note:</strong>{" "}
              {ended
                .map(
                  (end) =>
                    `${end.side} ${end.reason === "stopped" ? "was stopped" : "broke off"} at ${formatClock(end.atS)} of ${formatClock(end.lengthS)}.`,
                )
                .join(" ")}{" "}
              {whole
                ? `Numbers cover all of each run, so most don't compare.`
                : `Numbers and charts cover the first ${formatClock(sharedS)} of both runs.`}
            </span>
          </p>
          <span
            role="group"
            aria-label="Compare over"
            className="inline-flex flex-none rounded-lg bg-fg/6 p-0.5 text-sm"
          >
            {[false, true].map((option) => (
              <button
                key={String(option)}
                type="button"
                aria-pressed={whole === option}
                onClick={() => {
                  setWhole(option);
                }}
                className="rounded-md px-2.5 py-1 text-fg-2 transition-colors duration-200 hover:text-fg aria-pressed:bg-segment aria-pressed:text-fg aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.14)]"
              >
                {option ? "Whole runs" : `First ${formatClock(sharedS)} of both`}
              </button>
            ))}
          </span>
        </section>
      )}

      <section aria-labelledby="verdict-h" className={`${card} flex flex-col`}>
        <div className="flex flex-col gap-2 px-5 py-4">
          <h2 className="font-mono text-xs tracking-[0.06em] text-fg-3 uppercase">
            What changed
            {changes.length > 0 &&
              ` · ${changes.length === 1 ? "1 thing" : `${changes.length} things`}`}
          </h2>
          <Changes a={runA} changes={changes} />
        </div>
        <div className="flex flex-col gap-4 border-t border-line p-5">
          <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
            {[
              { side: "a" as const, run: a },
              { side: "b" as const, run: b },
            ].map(({ side, run }) => {
              const end = ended.find((candidate) => candidate.side === side.toUpperCase());
              return (
                <div key={side} className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <RunSwatch side={side} />
                      {side.toUpperCase()}
                    </span>
                    <span className="text-fg-2">{setupLine(run.run, otherStream)}</span>
                    {end && (
                      <span className="rounded-full bg-fg/6 px-2 py-0.5 text-xs text-fg-2">
                        Stopped at {formatClock(end.atS)}
                      </span>
                    )}
                  </p>
                  <p className="text-5xl leading-none font-semibold tabular-nums">
                    {Math.round(run.score.score)}
                    <span className="text-lg font-medium text-fg-3"> / 100</span>
                  </p>
                </div>
              );
            })}
            <ScoreDifference {...verdict.difference} />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 id="verdict-h" className="text-xl font-semibold text-balance">
              {verdict.headline}
            </h2>
            <p className="max-w-[880px] text-fg-2">
              {verdict.detail}
              {verdict.spread && (
                <>
                  {" "}
                  <Link to="/about" hash="repeatable" className="underline underline-offset-2">
                    How repeatable runs are
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {stoppedB && (
              <Link
                to="/run"
                search={{ ...savedRunSearch(runB, { start: true }), vs: runA.id }}
                className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor" />
                </svg>
                Run B again
              </Link>
            )}
            <Link to="/runs/$runId" params={{ runId: runA.id }} className={textLink}>
              Open A&apos;s report
            </Link>
            <Link to="/runs/$runId" params={{ runId: runB.id }} className={textLink}>
              Open B&apos;s report
            </Link>
          </div>
        </div>
      </section>

      <Numbers rows={rows} />
      <CompareChartsView a={a} b={b} mbps={otherStream} cutS={untilS} ended={whole ? ended : []} />
    </>
  );
}

/** When A and B differ in more than one thing, or in the stream: what the numbers can't say. */
function Warning({ a, b, changes }: { a: SavedRun; b: SavedRun; changes: SetupChange[] }) {
  const stream = changes.find((change) => change.label === "Stream");
  if (!stream && changes.length < 2) return null;
  const others = changes.filter((change) => change.label !== "Stream");
  const network = changes.find((change) => change.label === "Network");
  const named = changes.map((change) => change.label.toLowerCase());
  const several =
    changes.length < 2
      ? ""
      : `The ${named.slice(0, -1).join(", ")} and ${named.at(-1) ?? ""} ${changes.length === 2 ? "both" : "all"} changed, so these numbers can't say which change made the difference. To find out, change one thing at a time.`;
  return (
    <section
      role="note"
      aria-labelledby="warning-h"
      className="flex flex-col gap-2 rounded-[10px] border border-warning/50 bg-warning/6 px-3.5 py-3"
    >
      <h2 id="warning-h" className="flex items-center gap-2 font-semibold text-warning-text">
        <SeverityIcon severity="warning" size={12} />
        {stream && others.length === 0
          ? "Warning: different streams"
          : `Warning: A and B differ in ${changes.length} things`}
      </h2>
      <p className="max-w-[880px] text-sm text-fg-2">
        {stream &&
          `${stream.a} and ${stream.b} have different qualities, so the quality chart shows Mbps instead of quality names, and “At top quality” means each stream's own top. `}
        {several}
      </p>
      {network && others.length === 2 && (
        <div className="flex">
          {/* A's setup on B's network differs from B in the player alone, and from A in the network alone. */}
          <Link
            to="/run"
            search={{ ...runSearchWithNetwork(a, b.setup.network, { start: true }), vs: a.id }}
            className="inline-flex min-h-10 items-center rounded-[10px] border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg-3"
          >
            Run A again on {b.setup.network.name}
          </Link>
        </div>
      )}
    </section>
  );
}

function Changes({ a, changes }: { a: SavedRun; changes: SetupChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="text-fg-2">
        Nothing. Both ran {a.setup.streamName} on {a.setup.network.name} with{" "}
        {playerTitle(a.setup.player.name, playerChanges(a))}.
      </p>
    );
  }
  return (
    <dl className="grid gap-x-7 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {changes.map((change) => (
        <div key={change.label} className="contents">
          <dt className="font-medium">{change.label}</dt>
          <dd className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-fg-2">{change.a}</span>
              <span aria-hidden="true" className="text-fg-3">
                →
              </span>
              <span className="sr-only">changed to</span>
              <span className="font-semibold">{change.b}</span>
            </span>
            {change.detail && <span className="text-sm text-fg-2">{change.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ScoreDifference({ text, verdict }: { text: string; verdict: Verdict }) {
  if (verdict === "better" || verdict === "worse") {
    const { icon, className } = verdicts[verdict];
    return (
      <p className={`pb-1 text-lg font-semibold ${className}`}>
        <span aria-hidden="true">{icon} </span>
        {text}
      </p>
    );
  }
  return (
    <p className="pb-1 text-lg font-medium text-fg-2">
      {verdict === "not-comparable" ? "" : <span aria-hidden="true">≈ </span>}
      {text}
    </p>
  );
}

/** The numbers in groups: a table on wide screens, a list on phones. */
function Numbers({ rows }: { rows: MetricComparison[] }) {
  const groups: { name: string; rows: MetricComparison[] }[] = [];
  for (const row of rows) {
    const group = groups.find((candidate) => candidate.name === row.group);
    if (group) group.rows.push(row);
    else groups.push({ name: row.group, rows: [row] });
  }
  return (
    <section aria-labelledby="numbers-h" className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="numbers-h" className="text-lg font-semibold">
          The numbers
        </h2>
        <p className="text-sm text-fg-2">{tally(rows)}</p>
      </div>
      <table className="w-full text-left text-[15px] tabular-nums max-sm:hidden">
        <thead>
          <tr>
            <Th>Metric</Th>
            <Th>A</Th>
            <Th>B</Th>
            <Th>B against A</Th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.name}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={4}
                className="pt-4 pb-1 font-mono text-xs font-normal tracking-[0.06em] text-fg-3 uppercase"
              >
                {group.name}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-fg/6">
                <th scope="row" className="py-2 pr-4 font-medium">
                  {row.label}
                </th>
                <Td>{row.a}</Td>
                <Td>{row.b}</Td>
                <Td>
                  <span className="inline-flex flex-wrap items-baseline gap-x-2">
                    {row.difference && <span>{row.difference}</span>}
                    <VerdictWord verdict={row.verdict} />
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <div className="flex flex-col sm:hidden">
        {groups.map((group) => (
          <div key={group.name}>
            <h3 className="pt-4 pb-1 font-mono text-xs tracking-[0.06em] text-fg-3 uppercase">
              {group.name}
            </h3>
            <ul>
              {group.rows.map((row) => (
                <li key={row.label} className="flex flex-col gap-0.5 border-t border-fg/6 py-2">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{row.label}</span>
                    <VerdictWord verdict={row.verdict} />
                  </span>
                  <span className="text-sm text-fg-2 tabular-nums">
                    A {row.a} · B {row.b}
                    {row.difference && ` · ${row.difference}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartFigure({
  title,
  unit,
  keys,
  lookFor,
  takeaway,
  children,
}: {
  title: string;
  unit: string;
  keys?: ReactNode;
  lookFor?: string;
  takeaway?: string;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-xl border border-line bg-surface px-4 pt-3 pb-2.5">
      <figcaption className="mb-1.5 flex flex-wrap justify-between gap-x-3.5 gap-y-2">
        <span className="text-sm font-semibold">
          {title} <span className="font-normal text-fg-3">· {unit}</span>
        </span>
        {keys && <span className="flex flex-wrap gap-3 text-xs text-fg-2">{keys}</span>}
      </figcaption>
      {lookFor && <p className="mb-3 text-sm text-fg-2">{lookFor}</p>}
      {children}
      {/* The chart's label says the same, so it's read once. */}
      {takeaway && (
        <p aria-hidden="true" className="mt-2.5 border-t border-fg/6 pt-2 text-[15px]">
          {takeaway}
        </p>
      )}
    </figure>
  );
}

const lineA = <path d="M0 5 H16" strokeWidth="2.5" className="stroke-fg" />;
const lineB = (
  <path d="M0 5 H16" strokeWidth="2.5" strokeDasharray="5 3" className="stroke-accent" />
);

function CompareChartsView({
  a,
  b,
  mbps,
  cutS,
  ended,
}: {
  a: ComparedRun;
  b: ComparedRun;
  mbps: boolean;
  /** Where both runs were cut, when only the stretch both covered compares. */
  cutS: number | undefined;
  /** Runs that ended early when whole runs are compared: their ends are marked. */
  ended: ReturnType<typeof endedEarly>;
}) {
  const qualityRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement>(null);
  const stallsRef = useRef<HTMLCanvasElement>(null);
  const chartsRef = useRef<CompareCharts>(undefined);
  const theme = useTheme();
  const curveA = a.run.setup.network.curve;
  const curveB = b.run.setup.network.curve;
  const sameNetwork = JSON.stringify(curveA) === JSON.stringify(curveB);
  const [table, setTable] = useState(false);
  const stalled = a.metrics.stalls.count + b.metrics.stalls.count > 0;
  const stop = ended[0];

  useEffect(() => {
    const quality = qualityRef.current;
    const buffer = bufferRef.current;
    if (!quality || !buffer) return;
    const charts = mountCompareCharts(
      { quality, buffer, stalls: stallsRef.current },
      {
        a: a.timeline,
        b: b.timeline,
        curveA,
        curveB,
        lengthS: Math.max(a.timeline.endS ?? 0, b.timeline.endS ?? 0, 1),
        mbps,
        ...(stop && {
          stop: { atS: stop.atS, label: `${stop.side} stopped, ${formatClock(stop.atS)}` },
        }),
      },
    );
    chartsRef.current = charts;
    return () => {
      charts.destroy();
      chartsRef.current = undefined;
    };
  }, [a, b, curveA, curveB, mbps, stop, stalled, table]);

  useEffect(() => {
    chartsRef.current?.retheme();
  }, [theme]);

  const keysAB = (
    <>
      <Key swatch={lineA} label="A" />
      <Key swatch={lineB} label="B" />
    </>
  );
  const quality = qualityTakeaway(a, b, { mbps });
  const buffer = bufferTakeaway(a, b);
  const stalls = stallsTakeaway(a, b, cutS);

  return (
    <section aria-labelledby="charts-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="charts-h" className="text-lg font-semibold">
          On one time axis
        </h2>
        <ShowAs name="Both runs" table={table} onChange={setTable} />
      </div>
      <ChartOrTable
        table={table}
        label="Both runs as a table"
        minHeight={360}
        renderTable={() => (
          <table className="w-full bg-surface text-left">
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>A on screen</Th>
                <Th>B on screen</Th>
                <Th>A&apos;s buffer</Th>
                <Th>B&apos;s buffer</Th>
              </tr>
            </thead>
            <tbody>
              {compareRows(a, b).map((row) => (
                <tr key={row.t} className="border-t border-fg/6">
                  <Td mono>{formatClock(row.t)}</Td>
                  <Td>{row.a.stalled ? "Stalled" : (row.a.shown ?? "—")}</Td>
                  <Td>{row.b.stalled ? "Stalled" : (row.b.shown ?? "—")}</Td>
                  <Td>{row.a.bufferS === undefined ? "—" : formatDuration(row.a.bufferS)}</Td>
                  <Td>{row.b.bufferS === undefined ? "—" : formatDuration(row.b.bufferS)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        <div className="flex flex-col gap-3">
          <ChartFigure
            title="Quality on screen"
            unit={mbps ? "Mbps, log scale" : "quality, log scale"}
            lookFor="Look for where each line steps down, and how far it sits below the network."
            takeaway={quality}
            keys={
              <>
                <Key
                  swatch={<rect width="14" height="10" rx="2" className="fill-net/45" />}
                  label={sameNetwork ? "Network" : "A's network"}
                />
                {!sameNetwork && (
                  <Key
                    swatch={
                      <path
                        d="M0 5 H16"
                        strokeWidth="1.5"
                        strokeDasharray="2 3"
                        className="stroke-net"
                      />
                    }
                    label="B's network"
                  />
                )}
                {keysAB}
              </>
            }
          >
            <canvas
              ref={qualityRef}
              role="img"
              aria-label={`${describeCompareQuality(a, b)} ${quality}`}
              className="block h-[200px] w-full"
            />
          </ChartFigure>
          <ChartFigure
            title="Buffer"
            unit="seconds of video ahead"
            keys={keysAB}
            lookFor="Look for how low each line gets. At zero, the picture stops."
            takeaway={buffer}
          >
            <canvas
              ref={bufferRef}
              role="img"
              aria-label={buffer}
              className="block h-[140px] w-full"
            />
          </ChartFigure>
          {stalled ? (
            <ChartFigure
              title="Stalls"
              unit="A above, B below"
              lookFor="Red bands are time with no picture."
              takeaway={stalls}
              keys={
                <Key
                  swatch={<rect width="12" height="10" rx="2" className="fill-error" />}
                  label="Stall"
                />
              }
            >
              <canvas
                ref={stallsRef}
                role="img"
                aria-label={stalls}
                className="block h-[64px] w-full"
              />
            </ChartFigure>
          ) : (
            <ChartFigure title="Stalls" unit="A above, B below">
              <p className="flex items-center gap-2 py-1.5 text-[15px]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                  className="flex-none"
                >
                  <path
                    d="M2.5 7.5 L5.5 10.5 L11.5 3.5"
                    fill="none"
                    strokeWidth="2"
                    className="stroke-accent"
                  />
                </svg>
                {stalls}
              </p>
            </ChartFigure>
          )}
        </div>
      </ChartOrTable>
    </section>
  );
}
