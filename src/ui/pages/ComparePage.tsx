import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { mountCompareCharts, type CompareCharts } from "@/charts/compare";
import { formatClock, formatDuration, formatWhen } from "@/core/format/time";
import { savedRuns, type RunSummary, type SavedRun } from "@/core/persist/runs";
import { playerTitle } from "@/core/player/settings";
import {
  compared,
  compareMetrics,
  compareRows,
  describeCompareBuffer,
  describeCompareQuality,
  describeCompareStalls,
  setupDifferences,
  type ComparedRun,
  type Verdict,
} from "@/core/run/compare";
import { playerChanges } from "@/core/run/report";
import { DataTable, Key, Td, Th } from "@/ui/run/chart-parts";
import { useNow } from "@/ui/runs/useNow";
import { useSavedRuns } from "@/ui/runs/useSavedRuns";
import { useTheme } from "@/ui/theme/useTheme";

export interface CompareSearch {
  a?: string;
  b?: string;
}

type Loaded = { status: "loading" } | { status: "ready"; run: SavedRun } | { status: "missing" };

/** A saved run by id, loaded from this browser; undefined when no id is given. */
function useSavedRun(id: string | undefined): Loaded | undefined {
  const [loaded, setLoaded] = useState<{ id: string; value: Loaded }>();
  useEffect(() => {
    if (!id) return;
    let current = true;
    savedRuns()
      .get(id)
      .then(
        (run) => {
          if (current)
            setLoaded({ id, value: run ? { status: "ready", run } : { status: "missing" } });
        },
        () => {
          if (current) setLoaded({ id, value: { status: "missing" } });
        },
      );
    return () => {
      current = false;
    };
  }, [id]);
  if (!id) return undefined;
  return loaded?.id === id ? loaded.value : { status: "loading" };
}

const titleOf = (summary: RunSummary) => summary.playerTitle ?? summary.playerName;

/** The search params for a pair, leaving out a side that has no run. */
const pair = (a: string | undefined, b: string | undefined): CompareSearch => ({
  ...(a && { a }),
  ...(b && { b }),
});

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
  return (
    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <RunSwatch side={side} />
        Run {side.toUpperCase()}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="min-h-11 w-full rounded-[10px] border border-line-strong bg-ground px-3"
      >
        {value === undefined && <option value="">Choose a run</option>}
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

/** A's solid line or B's dashed one, as the charts draw them. */
function RunSwatch({ side }: { side: "a" | "b" }) {
  return (
    <svg width="18" height="10" aria-hidden="true" className="flex-none overflow-visible">
      <path
        d="M0 5 H18"
        strokeWidth="2.5"
        strokeDasharray={side === "b" ? "5 3" : undefined}
        className={side === "a" ? "stroke-fg" : "stroke-accent"}
      />
    </svg>
  );
}

const card = "rounded-2xl border border-line bg-surface";

const verdicts: Record<Verdict, { text: string; icon: string; className: string }> = {
  better: { text: "better", icon: "▲", className: "text-accent" },
  worse: { text: "worse", icon: "▼", className: "text-error-text" },
  same: { text: "same", icon: "=", className: "text-fg-3" },
  unknown: { text: "can't tell", icon: "?", className: "text-fg-3" },
};

function Comparison({ a: runA, b: runB }: { a: SavedRun; b: SavedRun }) {
  const now = useNow();
  const a = useMemo(() => compared(runA), [runA]);
  const b = useMemo(() => compared(runB), [runB]);
  const rows = compareMetrics(a, b);
  const changes = setupDifferences(runA, runB);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <RunCard side="a" run={a} now={now} />
        <RunCard side="b" run={b} now={now} />
      </div>

      <section aria-labelledby="changed-h" className={`${card} p-5`}>
        <h2 id="changed-h" className="mb-2 text-lg font-semibold">
          What changed
        </h2>
        {changes.length === 0 ? (
          <p className="text-fg-2">
            The same setup. What differs between them is the spread from one run to the next;{" "}
            <Link
              to="/about"
              hash="repeatable"
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              how repeatable runs are
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr>
                <Th>Setting</Th>
                <Th>A</Th>
                <Th>B</Th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.label} className="border-t border-fg/6">
                  <Td>{change.label}</Td>
                  <Td>{change.a}</Td>
                  <Td>{change.b}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="numbers-h" className={`${card} p-5`}>
        <h2 id="numbers-h" className="mb-2 text-lg font-semibold">
          The numbers
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[15px] tabular-nums">
            <thead>
              <tr>
                <Th>Metric</Th>
                <Th>A</Th>
                <Th>B</Th>
                <Th>B against A</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const verdict = verdicts[row.verdict];
                return (
                  <tr key={row.label} className="border-t border-fg/6">
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {row.label}
                    </th>
                    <Td>{row.a}</Td>
                    <Td>{row.b}</Td>
                    <Td>
                      <span className="inline-flex flex-wrap items-baseline gap-x-2">
                        {row.difference !== "—" && <span>{row.difference}</span>}
                        <span className={`text-sm ${verdict.className}`}>
                          <span aria-hidden="true">{verdict.icon} </span>
                          {verdict.text}
                        </span>
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <CompareChartsView a={a} b={b} />
    </>
  );
}

function RunCard({
  side,
  run: { run, score },
  now,
}: {
  side: "a" | "b";
  run: ComparedRun;
  now: number;
}) {
  return (
    <section
      aria-label={`Run ${side.toUpperCase()}`}
      className={`${card} flex flex-col gap-1.5 p-5`}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <RunSwatch side={side} />
        {side.toUpperCase()}
      </p>
      <p className="text-lg font-semibold">
        {run.setup.network.name} · hls.js {playerTitle(run.setup.player.name, playerChanges(run))}
      </p>
      <p className="text-fg-2">
        {run.setup.streamName} · {formatWhen(run.startedAt, now)} ·{" "}
        <span className="tabular-nums">{Math.round(score.score)}/100</span>
      </p>
      <p>
        <Link
          to="/runs/$runId"
          params={{ runId: run.id }}
          className="text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Open {side.toUpperCase()}&apos;s report
        </Link>
      </p>
    </section>
  );
}

function ChartFigure({
  title,
  unit,
  keys,
  children,
}: {
  title: string;
  unit: string;
  keys: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-[14px] border border-line bg-surface px-[18px] pt-4 pb-3">
      <figcaption className="mb-2 flex flex-wrap justify-between gap-x-4 gap-y-2">
        <span className="text-[15px] font-semibold">
          {title} <span className="font-normal text-fg-3">· {unit}</span>
        </span>
        <span className="flex flex-wrap gap-3.5 text-[13px] text-fg-2">{keys}</span>
      </figcaption>
      {children}
    </figure>
  );
}

const lineA = <path d="M0 5 H16" strokeWidth="2.5" className="stroke-fg" />;
const lineB = (
  <path d="M0 5 H16" strokeWidth="2.5" strokeDasharray="5 3" className="stroke-accent" />
);

function CompareChartsView({ a, b }: { a: ComparedRun; b: ComparedRun }) {
  const qualityRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement>(null);
  const stallsRef = useRef<HTMLCanvasElement>(null);
  const chartsRef = useRef<CompareCharts>(undefined);
  const theme = useTheme();
  const curveA = a.run.setup.network.curve;
  const curveB = b.run.setup.network.curve;
  const sameNetwork = JSON.stringify(curveA) === JSON.stringify(curveB);

  useEffect(() => {
    const quality = qualityRef.current;
    const buffer = bufferRef.current;
    const stalls = stallsRef.current;
    if (!quality || !buffer || !stalls) return;
    const charts = mountCompareCharts(
      { quality, buffer, stalls },
      {
        a: a.timeline,
        b: b.timeline,
        curveA,
        curveB,
        lengthS: Math.max(a.timeline.endS ?? 0, b.timeline.endS ?? 0, 1),
      },
    );
    chartsRef.current = charts;
    return () => {
      charts.destroy();
      chartsRef.current = undefined;
    };
  }, [a, b, curveA, curveB]);

  useEffect(() => {
    chartsRef.current?.retheme();
  }, [theme]);

  const keysAB = (
    <>
      <Key swatch={lineA} label="A" />
      <Key swatch={lineB} label="B" />
    </>
  );

  return (
    <section aria-labelledby="charts-h" className="flex flex-col gap-3">
      <h2 id="charts-h" className="text-lg font-semibold">
        On one time axis
      </h2>
      <ChartFigure
        title="Quality on screen"
        unit="Mbps, log scale"
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
          aria-label={describeCompareQuality(a, b)}
          className="block h-[200px] w-full"
        />
      </ChartFigure>
      <ChartFigure title="Buffer" unit="seconds of video ahead" keys={keysAB}>
        <canvas
          ref={bufferRef}
          role="img"
          aria-label={describeCompareBuffer(a, b)}
          className="block h-[140px] w-full"
        />
      </ChartFigure>
      <ChartFigure
        title="Stalls"
        unit="A above, B below"
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
          aria-label={describeCompareStalls(a, b)}
          className="block h-[64px] w-full"
        />
        <DataTable label="Both runs as a table">
          {() => (
            <table className="w-full text-left">
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
        </DataTable>
      </ChartFigure>
    </section>
  );
}
