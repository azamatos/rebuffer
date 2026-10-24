import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatWhen } from "@/core/format/time";
import type { RunSummary } from "@/core/persist/runs";
import {
  groupsForA,
  groupsForB,
  plural,
  summaryPlayer,
  summaryScore,
  summaryStatus,
  type PickGroup,
} from "@/core/run/compare";
import { savedRunSearch } from "@/core/run/report";
import { DEFAULT_NETWORK_ID, DEFAULT_PLAYER_ID, runSearchFor } from "@/core/run/setup";
import { DEFAULT_STREAM } from "@/core/samples";
import { RunSwatch } from "@/ui/runs/RunSwatch";
import { useSavedRun } from "@/ui/runs/useSavedRun";

/** Choosing the two runs: A first, then a B described by how it differs from A. */

export const primaryButton =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover";
export const secondaryButton =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3";
export const textLink =
  "text-sm whitespace-nowrap text-accent underline underline-offset-2 hover:text-accent-hover";
const card = "rounded-xl border border-line bg-surface";
const smallButton =
  "inline-flex min-h-10 flex-none items-center gap-1.5 rounded-lg border border-line-strong px-3 text-sm text-fg hover:border-fg-3";

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />
    </svg>
  );
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5">
      <p className="mb-0.5 font-mono text-xs tracking-[0.06em] text-accent">COMPARE</p>
      <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
      {children && <p className="max-w-[880px] text-fg-2">{children}</p>}
    </section>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {(
        [
          [1, "a", "Choose A"],
          [2, "b", "Choose B"],
        ] as const
      ).map(([n, side, text]) => (
        <li
          key={n}
          aria-current={n === step ? "step" : undefined}
          className={`flex items-center gap-2 ${n === step ? "font-semibold" : "text-fg-2"}`}
        >
          <RunSwatch side={side} />
          {n} · {text}
        </li>
      ))}
    </ol>
  );
}

const runTitle = (summary: RunSummary) => `${summaryPlayer(summary)} · ${summary.networkName}`;
const runLine = (summary: RunSummary, now: number) =>
  `${summary.streamName} · ${formatWhen(summary.savedAt, now)} · ${summaryStatus(summary)} · ${summaryScore(summary)}`;

function Group({
  group,
  heading,
  children,
}: {
  group: PickGroup;
  heading: "h2" | "h3";
  children: ReactNode;
}) {
  const Tag = heading;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col">
        <Tag className="font-mono text-xs tracking-[0.06em] text-fg-3 uppercase">{group.name}</Tag>
        {group.note && <p className="text-sm text-fg-2">{group.note}</p>}
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function PickRow({
  title,
  line,
  score,
  extra,
  action,
}: {
  title: string;
  line: string;
  score: string;
  extra?: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3`}>
      <div className="min-w-0 flex-[1_1_300px]">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-fg-2">{line}</p>
      </div>
      <div className="flex min-w-0 flex-auto flex-col text-sm tabular-nums">
        <span className="font-medium">{score}</span>
        {extra}
      </div>
      {action}
    </li>
  );
}

/** Step 1: every saved run, grouped by stream and network, so comparable runs sit together. */
export function ChooseA({ runs, now }: { runs: RunSummary[]; now: number }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-5">
      <Heading title="Choose two runs">
        From the runs saved in this browser. Choose A first; the list for B then says how each run
        differs from it.
      </Heading>
      <Steps step={1} />
      {groupsForA(runs).map((group) => (
        <Group key={group.key} group={group} heading="h2">
          {group.rows.map(({ summary, near }) => (
            <PickRow
              key={summary.id}
              title={summaryPlayer(summary)}
              line={`${formatWhen(summary.savedAt, now)} · ${summaryStatus(summary)}${summary.heldBack ? " · held back by your network" : ""}`}
              score={summaryScore(summary)}
              extra={
                <span className="text-fg-2">
                  {plural(near, "run differs", "runs differ")} from it in one thing
                </span>
              }
              action={
                <button
                  type="button"
                  onClick={() => {
                    void navigate({ to: "/runs/compare", search: { a: summary.id } });
                  }}
                  className={smallButton}
                >
                  Use as A
                  <span className="sr-only">
                    : {summaryPlayer(summary)}, {group.name}, {formatWhen(summary.savedAt, now)}
                  </span>
                </button>
              }
            />
          ))}
        </Group>
      ))}
    </div>
  );
}

/** Step 2: A is set; every other run, by how many things differ from A. */
export function ChooseB({ a, runs, now }: { a: RunSummary; runs: RunSummary[]; now: number }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-5">
      <Heading title="Choose two runs">
        From the runs saved in this browser. A B that differs from A in one thing is the clearest:
        then any difference comes from that change.
      </Heading>
      <Steps step={2} />
      <section
        aria-labelledby="pick-a-h"
        className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3.5`}
      >
        <h2 id="pick-a-h" className="flex flex-none items-center gap-2 font-semibold">
          <RunSwatch side="a" />A
        </h2>
        <div className="min-w-0 flex-[1_1_300px]">
          <p className="font-semibold">{runTitle(a)}</p>
          <p className="text-sm text-fg-2">{runLine(a, now)}</p>
        </div>
        <Link to="/runs/compare" className={secondaryButton}>
          Change A
        </Link>
      </section>
      <section aria-labelledby="pick-b-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="pick-b-h" className="flex items-center gap-2 text-lg font-semibold">
            <RunSwatch side="b" />
            Choose B
          </h2>
          <p className="text-[13px] text-fg-3">Each run is described by how it differs from A.</p>
        </div>
        {groupsForB(a, runs).map((group) => (
          <Group key={group.key} group={group} heading="h3">
            {group.rows.map(({ summary, changes }) => {
              const what = changes.length > 0 ? changes.join(" · ") : "Same setup";
              return (
                <PickRow
                  key={summary.id}
                  title={what}
                  line={`${formatWhen(summary.savedAt, now)} · ${summaryStatus(summary)}`}
                  score={summaryScore(summary)}
                  extra={
                    summary.heldBack && (
                      <span className="text-warning-text">Held back by your network</span>
                    )
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        void navigate({
                          to: "/runs/compare",
                          search: { a: a.id, b: summary.id },
                        });
                      }}
                      className={smallButton}
                    >
                      Compare
                      <span className="sr-only">
                        : {what}, {formatWhen(summary.savedAt, now)}
                      </span>
                    </button>
                  }
                />
              );
            })}
          </Group>
        ))}
      </section>
    </div>
  );
}

/** One run saved: two ways to a second one, each saying what it would show. */
export function OneRun({ only, now }: { only: RunSummary; now: number }) {
  const loaded = useSavedRun(only.id);
  const run = loaded?.status === "ready" ? loaded.run : undefined;
  return (
    <div className="flex flex-col gap-5">
      <Heading title="Compare needs two runs">
        This browser has one run saved. Make a second from it, and it opens here when it ends.
      </Heading>
      <section
        aria-labelledby="one-h"
        className={`${card} flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3.5`}
      >
        <h2 id="one-h" className="flex flex-none items-center gap-2 font-semibold">
          <RunSwatch side="a" />A
        </h2>
        <div className="min-w-0 flex-[1_1_300px]">
          <p className="font-semibold">{runTitle(only)}</p>
          <p className="text-sm text-fg-2">{runLine(only, now)}</p>
        </div>
        <Link to="/runs/$runId" params={{ runId: only.id }} className={textLink}>
          Its report<span aria-hidden="true"> ↗</span>
        </Link>
      </section>
      <ul className="grid gap-2.5 md:grid-cols-2">
        <li className={`${card} flex flex-wrap items-center gap-3 px-3.5 py-3`}>
          <div className="min-w-0 flex-[1_1_300px]">
            <p className="font-semibold">Run the same setup again</p>
            <p className="text-sm text-fg-2">
              Two runs of one setup show how much runs differ on their own: about 2 points.
            </p>
          </div>
          {run && (
            <Link
              to="/run"
              search={{ ...savedRunSearch(run, { start: true }), vs: run.id }}
              className={primaryButton}
            >
              <PlayIcon />
              Run again
            </Link>
          )}
        </li>
        <li className={`${card} flex flex-wrap items-center gap-3 px-3.5 py-3`}>
          <div className="min-w-0 flex-[1_1_300px]">
            <p className="font-semibold">Change one thing</p>
            <p className="text-sm text-fg-2">
              Another player setup or network, the rest the same: then you know what that change
              did.
            </p>
          </div>
          <Link
            to="/runs/$runId"
            params={{ runId: only.id }}
            hash="change-one"
            className={secondaryButton}
          >
            Change one thing
          </Link>
        </li>
      </ul>
    </div>
  );
}

const tryTheTunnel = runSearchFor(
  { streamUrl: DEFAULT_STREAM.url, networkId: DEFAULT_NETWORK_ID, playerId: DEFAULT_PLAYER_ID },
  { start: true },
);

/** Nothing saved yet. */
export function NoRuns() {
  return (
    <div className="flex flex-col gap-5">
      <Heading title="No runs to compare yet" />
      <section className={`${card} flex max-w-[880px] flex-col gap-3 px-[18px] py-4`}>
        <p>
          Compare sets two runs side by side: usually one setup, and the same with one thing
          changed. Nothing is saved in this browser yet.
        </p>
        <p className="text-sm text-fg-2">
          Runs are kept only in the browser that ran them, so runs from another browser or device
          don’t show here.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/run" search={tryTheTunnel} className={primaryButton}>
            <PlayIcon />
            Try the tunnel
          </Link>
          <Link to="/" hash="setup" className={secondaryButton}>
            Pick a network
          </Link>
        </div>
      </section>
    </div>
  );
}
