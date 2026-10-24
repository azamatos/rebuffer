import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { formatClock, formatWhen } from "@/core/format/time";
import type { SavedRun } from "@/core/persist/runs";
import {
  compareRuns,
  compareSubtitle,
  compareTitle,
  compareWarning,
  otherNumbers,
  runAgain,
  runStatus,
  sameInBoth,
  scoreWalk,
  setupLine,
  type Again,
  type Comparison,
  type CompareSide,
} from "@/core/run/compare";
import {
  compareVerdict,
  heldBackText,
  lookFor,
  moments,
  noMoments,
  shortRows,
} from "@/core/run/compare-story";
import { honestyWarning } from "@/core/run/describe";
import { runSearchWithNetwork, savedRunSearch } from "@/core/run/report";
import {
  ChooseA,
  ChooseB,
  NoRuns,
  OneRun,
  PlayIcon,
  primaryButton,
  secondaryButton,
  textLink,
} from "@/ui/compare/ChooseRuns";
import { CompareTimeline } from "@/ui/compare/CompareTimeline";
import { WalkCard } from "@/ui/compare/Walk";
import { SeverityIcon } from "@/ui/inspect/SeverityIcon";
import { SimulationCheck } from "@/ui/run/SimulationCheck";
import { RunSwatch } from "@/ui/runs/RunSwatch";
import { useNow } from "@/ui/runs/useNow";
import { useSavedRun } from "@/ui/runs/useSavedRun";
import { useSavedRuns } from "@/ui/runs/useSavedRuns";

export interface CompareSearch {
  a?: string;
  b?: string;
}

const compareRoute = getRouteApi("/runs/compare");

/** Compare as the router shows it: the two runs come from the URL. */
export function CompareRoute() {
  return <ComparePage search={compareRoute.useSearch()} />;
}

const card = "rounded-xl border border-line bg-surface";

/**
 * Two runs saved in this browser, B read against A. Without both chosen: choose A, then B. With one run saved, two
 * ways to a second; with none, a way to the first.
 */
export function ComparePage({ search }: { search: CompareSearch }) {
  const runs = useSavedRuns();
  const now = useNow();
  const a = useSavedRun(search.a);
  const b = useSavedRun(search.b);

  let body;
  if (runs === undefined) body = <p className="text-fg-2">Loading the runs…</p>;
  else if (runs === "unavailable") {
    body = (
      <p className="text-warning-text">
        This browser doesn&apos;t let the lab keep runs (private browsing can block it).
      </p>
    );
  } else if (search.a && search.b) {
    if (a?.status === "ready" && b?.status === "ready") {
      body = <ComparisonView key={`${a.run.id}-${b.run.id}`} a={a.run} b={b.run} now={now} />;
    } else if (a?.status === "missing" || b?.status === "missing") {
      body = (
        <Missing
          which={
            a?.status === "missing" && b?.status === "missing"
              ? "both"
              : a?.status === "missing"
                ? "A"
                : "B"
          }
        />
      );
    } else body = <p className="text-fg-2">Loading the runs…</p>;
  } else if (runs.length === 0) body = <NoRuns />;
  else if (runs.length === 1 && runs[0]) body = <OneRun only={runs[0]} now={now} />;
  else {
    const chosen = search.a ? runs.find((run) => run.id === search.a) : undefined;
    body = chosen ? (
      <ChooseB a={chosen} runs={runs} now={now} />
    ) : (
      <>
        {search.a && <Missing which="A" />}
        <ChooseA runs={runs} now={now} />
      </>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-8">{body}</div>
  );
}

function Missing({ which }: { which: "A" | "B" | "both" }) {
  return (
    <p role="note" className="text-fg-2">
      This browser has no run {which === "both" ? "at either address" : `for ${which}`}; runs are
      kept only in the browser that ran them.{" "}
      <Link
        to="/runs/compare"
        className="text-accent underline underline-offset-2 hover:text-accent-hover"
      >
        Choose two runs
      </Link>
    </p>
  );
}

/** Where "Run … again" goes: B against A, A against B, or A then B. */
function againSearch(again: Again, a: SavedRun, b: SavedRun) {
  const [first] = again.sides;
  if (again.sides.length === 2) return { ...savedRunSearch(a, { start: true }), then: b.id };
  return first === "a"
    ? { ...savedRunSearch(a, { start: true }), vsB: b.id }
    : { ...savedRunSearch(b, { start: true }), vs: a.id };
}

function AgainLink({ again, a, b }: { again: Again; a: SavedRun; b: SavedRun }) {
  return (
    <Link to="/run" search={againSearch(again, a, b)} className={primaryButton}>
      <PlayIcon />
      {again.label}
    </Link>
  );
}

function ComparisonView({ a, b, now }: { a: SavedRun; b: SavedRun; now: number }) {
  const navigate = useNavigate();
  const c = useMemo(() => compareRuns(a, b), [a, b]);
  const verdict = useMemo(() => compareVerdict(c), [c]);
  const found = useMemo(() => moments(c), [c]);
  const warning = compareWarning(c);
  const again = runAgain(c);
  const look = lookFor(c, found);
  const swap = () => {
    void navigate({ to: "/runs/compare", search: { a: b.id, b: a.id }, replace: true });
  };
  const stoppedNote = c.state === "compared" && c.untilS !== undefined ? stoppedText(c) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="mb-0.5 font-mono text-xs tracking-[0.06em] text-accent">COMPARE</p>
          <h1 className="text-[28px] font-semibold tracking-tight text-balance">
            {compareTitle(c)}
          </h1>
          <p className="mt-0.5 text-fg-2">{compareSubtitle(c)}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          {again && c.state !== "too-short" && <AgainLink again={again} a={a} b={b} />}
          <Link to="/runs/compare" search={{ a: a.id }} className={secondaryButton}>
            Choose other runs
          </Link>
          <button type="button" onClick={swap} className={secondaryButton}>
            Swap A and B
          </button>
        </div>
      </section>

      {warning && (
        <section
          role="note"
          aria-labelledby="warning-h"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border border-warning/50 bg-warning/6 px-3.5 py-3"
        >
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1">
            <h2 id="warning-h" className="flex items-center gap-2 font-semibold text-warning-text">
              <SeverityIcon severity="warning" size={12} />
              {warning.title}
            </h2>
            <p className="max-w-[880px] text-sm text-fg-2">{warning.body}</p>
          </div>
          {warning.oneChange && (
            <Link
              to="/run"
              search={{ ...runSearchWithNetwork(b, a.setup.network, { start: true }), vs: a.id }}
              className={`${secondaryButton} flex-none text-sm font-medium`}
            >
              <PlayIcon />
              {warning.oneChange}
            </Link>
          )}
        </section>
      )}

      {stoppedNote && (
        <section
          role="note"
          className="flex items-start gap-2 rounded-[10px] border border-line-strong bg-note/10 px-3.5 py-3 text-sm"
        >
          <span className="flex h-5 flex-none items-center">
            <SeverityIcon severity="note" size={12} />
          </span>
          <p className="max-w-[880px]">
            <strong className="font-semibold text-note-text">Note:</strong> {stoppedNote}
          </p>
        </section>
      )}

      <Runs c={c} now={now} />
      <Checks c={c} />

      <section aria-labelledby="verdict-h" className="flex flex-wrap items-stretch gap-3">
        <VerdictCard c={c} verdict={verdict} />
        <div className={`${card} flex min-w-0 flex-[999_1_560px] flex-col gap-2 px-[18px] py-4`}>
          {c.state === "compared" && <WalkCard walk={scoreWalk(c)} />}
          {c.state === "too-short" && <ShortCard c={c} again={again} a={a} b={b} />}
          {c.state === "held-back" && <HeldCard c={c} again={again} a={a} b={b} />}
        </div>
      </section>

      {c.state === "compared" && <OtherNumbers c={c} />}

      <CompareTimeline c={c} found={found} look={look} />

      <section aria-labelledby="differ-h" className={`${card} px-[18px] pt-3.5 pb-2`}>
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id="differ-h" className="text-lg font-semibold">
            Where they differ
          </h3>
          <p className="text-[13px] text-fg-3">
            {found.length > 0
              ? "The numbers match the markers on the timeline."
              : "Moments where the two runs part ways."}
          </p>
        </div>
        {found.length > 0 ? (
          <ol>
            {found.map((moment, i) => (
              <li
                key={`${moment.side}-${moment.t}-${i}`}
                className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-t border-fg/6 py-2.5 sm:grid-cols-[22px_92px_minmax(0,1fr)_auto]"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-[22px] items-center justify-center rounded-full bg-fg text-xs font-semibold text-ground"
                >
                  {i + 1}
                </span>
                <span className="pt-1 font-mono text-xs text-fg-3 tabular-nums">
                  {formatClock(moment.t)}
                </span>
                <span className="col-span-2 col-start-2 max-sm:row-start-2 sm:col-span-1 sm:col-start-3">
                  {moment.text}
                </span>
                <span className="col-start-3 row-start-1 flex items-center gap-1.5 pt-0.5 text-[13px] text-fg-2 sm:col-start-4">
                  <RunSwatch side={moment.side} />
                  {moment.side.toUpperCase()}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-t border-fg/6 py-2.5">{noMoments(c)}</p>
        )}
      </section>
    </div>
  );
}

/** The note when a run was stopped: everything covers the stretch both ran. */
function stoppedText(c: Comparison): string {
  const { a, b, untilS } = c;
  const until = formatClock(untilS ?? 0);
  if (a.stopped && b.stopped) {
    return `A was stopped at ${formatClock(a.endS)} and B at ${formatClock(b.endS)}, of ${formatClock(Math.max(a.lengthS, b.lengthS))}. Everything below covers the first ${until} of both, so like is compared with like.`;
  }
  const stopped = a.stopped ? a : b;
  const going = a.stopped ? b : a;
  return `${stopped.name} was stopped at ${until} of ${formatClock(stopped.lengthS)}. Everything below covers the first ${until} of both runs, so like is compared with like. ${going.name}’s whole-run score is ${Math.round(going.whole.score.score)}.`;
}

function RunRow({ c, s, now }: { c: Comparison; s: CompareSide; now: number }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-0.5 ${s.key === "a" ? "pb-2" : "border-t border-fg/6 pt-2"}`}
    >
      <p className="flex min-w-0 flex-auto items-center gap-2.5">
        <span className="flex flex-none items-center gap-2 font-semibold">
          <RunSwatch side={s.key} />
          {s.name}
        </span>
        <span className="min-w-0">{setupLine(c, s)}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2">
        <span>{formatWhen(s.run.savedAt, now)}</span>
        <span aria-hidden="true">·</span>
        {s.stopped ? (
          <span className="rounded-full bg-fg/7 px-2 py-0.5 text-xs font-medium text-fg">
            {runStatus(s)}
          </span>
        ) : (
          <span>{runStatus(s)}</span>
        )}
        {s.held && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-text">
            Held back by your network
          </span>
        )}
      </p>
      <Link to="/runs/$runId" params={{ runId: s.run.id }} className={textLink}>
        {s.name}’s report<span aria-hidden="true"> ↗</span>
      </Link>
    </div>
  );
}

function Runs({ c, now }: { c: Comparison; now: number }) {
  const same = sameInBoth(c.a.run, c.changes);
  return (
    <section aria-labelledby="runs-h" className={`${card} px-[18px] py-3.5`}>
      <h2 id="runs-h" className="sr-only">
        The two runs
      </h2>
      <RunRow c={c} s={c.a} now={now} />
      <RunRow c={c} s={c.b} now={now} />
      <div className="mt-2.5 flex flex-col gap-2 border-t border-fg/6 pt-2">
        {c.changes.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            {c.changes.map((change) => (
              <div key={change.label} className="contents">
                <dt className="text-sm text-fg-2">{change.label}</dt>
                <dd className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="text-fg-2">{change.a}</span>
                    <span aria-hidden="true" className="text-fg-3">
                      →
                    </span>
                    <span className="sr-only">changed to</span>
                    <span className="font-semibold">{change.b}</span>
                  </span>
                  {change.settings && (
                    <details>
                      <summary className="w-fit cursor-pointer text-sm text-fg-2 hover:text-fg">
                        What the preset changes: {change.settings.length}{" "}
                        {change.settings.length === 1 ? "setting" : "settings"}
                      </summary>
                      <p className="mt-1 font-mono text-[13px] leading-relaxed text-fg-2">
                        {change.settings.join(" · ")}
                      </p>
                    </details>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>
            <span className="font-semibold">Nothing changed.</span>{" "}
            <span className="text-fg-2">
              Both ran the same setup, so this shows how much runs differ on their own.
            </span>
          </p>
        )}
        {same && <p className="text-sm text-fg-3">{same}</p>}
      </div>
    </section>
  );
}

/** One line when both runs got their network; otherwise each run's own simulation check, labelled. */
function Checks({ c }: { c: Comparison }) {
  const warned = [c.a, c.b].some((s) => honestyWarning(s.whole.metrics.honesty));
  if (!warned) {
    return (
      <p className="flex items-start gap-2 text-sm text-fg-2">
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
          <circle cx="9" cy="9" r="8" fill="none" strokeWidth="1.6" className="stroke-accent" />
          <path
            d="M5.5 9.2 L8 11.6 L12.6 6.6"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-accent"
          />
        </svg>
        <span>
          <span className="font-medium text-fg">Simulation check:</span> both runs got the network
          they were set to.
        </span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {[c.a, c.b].map((s) => (
        <div key={s.key} className="flex min-w-0 items-start gap-3">
          <span
            className={`flex w-10 flex-none items-center gap-2 font-semibold ${honestyWarning(s.whole.metrics.honesty) ? "pt-2" : "text-sm"}`}
          >
            <RunSwatch side={s.key} />
            {s.name}
          </span>
          <div className="min-w-0 flex-auto">
            <SimulationCheck
              honesty={s.whole.metrics.honesty}
              curve={s.run.setup.network.curve}
              label={`${s.name}’s simulation check`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function VerdictCard({
  c,
  verdict,
}: {
  c: Comparison;
  verdict: ReturnType<typeof compareVerdict>;
}) {
  const { direction } = verdict;
  return (
    <div
      className={`${card} flex max-w-full flex-[1_1_300px] flex-col gap-3 px-[18px] py-4 sm:max-w-[360px]`}
    >
      <p className="text-[13px] text-fg-2">B against A</p>
      <div className="flex flex-col gap-1">
        <h2 id="verdict-h" className="text-[28px] font-semibold tracking-tight text-balance">
          {verdict.title}
        </h2>
        {direction === "worse" && (
          <p className="text-lg font-semibold text-error-text">
            <span aria-hidden="true">▼ </span>
            {verdict.difference}
          </p>
        )}
        {direction === "better" && (
          <p className="text-lg font-semibold text-accent">
            <span aria-hidden="true">▲ </span>
            {verdict.difference}
          </p>
        )}
        {direction === "same" && (
          <p className="text-lg font-medium text-fg-2">
            <span aria-hidden="true">≈ </span>
            {verdict.difference}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-7 gap-y-3">
        {verdict.cells.map((cell) => (
          <div key={cell.side} className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-[13px] whitespace-nowrap text-fg-2">
              <RunSwatch side={cell.side} />
              {cell.side.toUpperCase()} · {cell.label}
            </p>
            {cell.score === undefined ? (
              <>
                <p className="text-xl font-semibold">Not compared</p>
                <p className="text-[13px] text-fg-2">{cell.why}</p>
              </>
            ) : (
              <>
                <p className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
                  {cell.score}
                  <span className="text-lg font-medium tracking-normal text-fg-3"> / 100</span>
                </p>
                {cell.limit && <p className="text-[13px] text-fg-2">{cell.limit}</p>}
              </>
            )}
          </div>
        ))}
      </div>
      {verdict.though && <p className="text-[15px] font-medium">{verdict.though}</p>}
      <p className="text-[15px]">{verdict.facts}</p>
      {verdict.note && (
        <p className="border-t border-fg/6 pt-2 text-[13px] text-fg-2">
          {verdict.note}{" "}
          {c.state === "compared" && (
            <Link to="/about" hash="repeatable" className="underline underline-offset-2">
              How repeatable runs are
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

function ShortCard({
  c,
  again,
  a,
  b,
}: {
  c: Comparison;
  again: Again | undefined;
  a: SavedRun;
  b: SavedRun;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">What {formatClock(c.sharedS)} can tell</h3>
        <p className="text-[13px] text-fg-3">Only what both runs got to.</p>
      </div>
      <dl className="flex flex-col">
        {shortRows(c).map((row) => (
          <div key={row.label} className="flex flex-col gap-0.5 border-t border-fg/6 py-2.5">
            <dt className="font-medium">{row.label}</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="tabular-nums">{row.value}</span>
              <span className="text-[13px] text-fg-2">{row.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      {again && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AgainLink again={again} a={a} b={b} />
          <p className="text-[13px] text-fg-2">{again.note}</p>
        </div>
      )}
    </div>
  );
}

function HeldCard({
  c,
  again,
  a,
  b,
}: {
  c: Comparison;
  again: Again | undefined;
  a: SavedRun;
  b: SavedRun;
}) {
  const { text, note } = heldBackText(c);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">To compare them</h3>
      <p className="max-w-[880px]">{text}</p>
      <p className="max-w-[880px] text-sm text-fg-2">{note}</p>
      {again && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <AgainLink again={again} a={a} b={b} />
          <p className="text-[13px] text-fg-2">{again.note}</p>
        </div>
      )}
    </div>
  );
}

function OtherNumbers({ c }: { c: Comparison }) {
  const { tiles, same } = otherNumbers(c);
  return (
    <section aria-labelledby="other-h" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="other-h" className="text-lg font-semibold">
          Other numbers
        </h2>
        <p className="text-[13px] text-fg-3">
          Not part of the score.
          {c.untilS !== undefined && ` Over the first ${formatClock(c.untilS)}.`}
        </p>
      </div>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-[10px] border border-line bg-surface px-3 py-2.5"
            >
              <p className="text-xs text-fg-2">{tile.label}</p>
              <p className="mt-0.5 text-[22px] font-semibold tracking-tight tabular-nums">
                {tile.value}
              </p>
              <p className="text-xs text-fg-3">{tile.note}</p>
            </div>
          ))}
        </div>
      )}
      {same && <p className="text-sm text-fg-2">{same}</p>}
    </section>
  );
}
