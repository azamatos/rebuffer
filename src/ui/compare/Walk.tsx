import type { CSSProperties, ReactNode } from "react";
import { signed, SPREAD, type Walk } from "@/core/run/compare";
import { Key } from "@/ui/run/chart-parts";
import { RunSwatch } from "@/ui/runs/RunSwatch";

/**
 * "Where the points went": from A's score to B's, one part of the score per row, as bars on one 0–100 scale, so a
 * 9-point loss looks nine times a 1-point one. Green: B gained points; red: B lost them; the sign says the same. A
 * total outside 0–100 runs into a hatched zone past the edge.
 */

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-fg) 16%, transparent) 0 1px, transparent 1px 6px)";
const GRID = [0, 25, 50, 75, 100];

interface Bar {
  from: number;
  to: number;
  color: string;
  /** A total the score can't show, outlined from the edge it stops at. */
  ghost?: { total: number; edge: number } | undefined;
  /** A's score ± the spread, shaded. */
  band?: number | undefined;
}

function WalkBar({ walk, bar }: { walk: Walk; bar: Bar }) {
  const pos = (value: number) => ((value - walk.lo) / (walk.hi - walk.lo)) * 100;
  const span = (from: number, to: number): CSSProperties => ({
    left: `${pos(Math.min(from, to))}%`,
    width: `${Math.abs(pos(to) - pos(from))}%`,
  });
  const zones = [walk.lo < 0 && [walk.lo, 0], walk.hi > 100 && [100, walk.hi]].filter(
    (zone): zone is [number, number] => zone !== false,
  );
  return (
    <div aria-hidden="true" className="relative" style={{ height: 18 }}>
      {zones.map(([from, to]) => (
        <span
          key={from}
          className="absolute"
          style={{ ...span(from, to), top: -11, bottom: -11, background: HATCH }}
        />
      ))}
      {GRID.map((at) => (
        <span
          key={at}
          className={`absolute w-px ${at === 0 || at === 100 ? "bg-line-strong" : "bg-line"}`}
          style={{ left: `${pos(at)}%`, top: -11, bottom: -11 }}
        />
      ))}
      {bar.band !== undefined && (
        <span
          className="absolute -inset-y-1 border-x border-dashed border-fg-2"
          style={{
            ...span(bar.band - SPREAD.scorePoints, bar.band + SPREAD.scorePoints),
            background: "color-mix(in srgb, var(--color-fg) 14%, transparent)",
          }}
        />
      )}
      {bar.ghost && (
        <span
          className="absolute border-dashed border-fg-2"
          style={{
            ...span(bar.ghost.total, bar.ghost.edge),
            top: 3,
            bottom: 3,
            borderRadius: 3,
            borderWidth: 1.5,
          }}
        />
      )}
      {bar.from === bar.to ? (
        <span
          className="absolute inset-y-0.5 w-0.5 bg-fg-3"
          style={{ left: `calc(${pos(bar.from)}% - 1px)` }}
        />
      ) : (
        <span
          className="absolute"
          style={{
            ...span(bar.from, bar.to),
            top: 3,
            bottom: 3,
            minWidth: 3,
            borderRadius: 3,
            background: bar.color,
          }}
        />
      )}
    </div>
  );
}

interface Row {
  key: string;
  label: ReactNode;
  fact: string;
  value: string;
  quiet: boolean;
  bar: Bar;
}

const ghostOf = (total: number) =>
  total < 0 ? { total, edge: 0 } : total > 100 ? { total, edge: 100 } : undefined;

export function WalkCard({ walk }: { walk: Walk }) {
  const rows: Row[] = [
    {
      key: "a",
      label: (
        <>
          <RunSwatch side="a" />
          A’s score
        </>
      ),
      fact: walk.a.fact,
      value: String(walk.a.shown),
      quiet: false,
      bar: { from: 0, to: walk.a.shown, color: "var(--color-fg-2)", ghost: ghostOf(walk.a.total) },
    },
    ...walk.steps.map((step) => ({
      key: step.key,
      label: step.label,
      fact: step.fact,
      value: signed(step.delta),
      quiet: step.delta === 0,
      bar: {
        from: step.from,
        to: step.to,
        color: step.delta > 0 ? "var(--color-accent)" : "var(--color-error)",
      },
    })),
    {
      key: "b",
      label: (
        <>
          <RunSwatch side="b" />
          B’s score
        </>
      ),
      fact: walk.b.fact,
      value: String(walk.b.shown),
      quiet: false,
      bar: {
        from: 0,
        to: walk.b.shown,
        color: "var(--color-fg-2)",
        ghost: ghostOf(walk.b.total),
        band: walk.band,
      },
    },
  ];
  const outside = walk.lo < 0 || walk.hi > 100;
  const axis = (
    <div aria-hidden="true" className="relative h-3.5 text-xs text-fg-3 tabular-nums">
      {GRID.map((at) => {
        const left = ((at - walk.lo) / (walk.hi - walk.lo)) * 100;
        return (
          <span
            key={at}
            className="absolute"
            style={{
              left: `${left}%`,
              transform: left < 1 ? "none" : left > 99 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {at}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{walk.title}</h3>
        <p className="max-w-[880px] text-[13px] text-fg-2">{walk.subtitle}</p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
        <Key
          swatch={<rect width="14" height="10" rx="2" className="fill-accent" />}
          label="B gained points"
        />
        <Key
          swatch={<rect width="14" height="10" rx="2" className="fill-error" />}
          label="B lost points"
        />
        {outside && (
          <Key
            swatch={
              <rect
                x="0.5"
                y="0.5"
                width="13"
                height="9"
                rx="2"
                fill="none"
                strokeDasharray="2 2"
                className="stroke-fg-2"
              />
            }
            label={
              walk.lo < 0 ? "Below 0: not shown in a score" : "Above 100: not shown in a score"
            }
          />
        )}
      </p>
      <ol aria-label="From A’s score to B’s, part by part" className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-col gap-1.5 border-t border-fg/6 py-2.5 sm:grid sm:grid-cols-[16rem_minmax(0,1fr)_3rem] sm:items-center sm:gap-x-4"
          >
            <div className="flex items-baseline justify-between gap-3 sm:block sm:min-w-0">
              <p className="flex items-center gap-2 font-medium">{row.label}</p>
              <p className="text-[13px] text-fg-2 max-sm:hidden">{row.fact}</p>
              <p className={`tabular-nums sm:hidden ${row.quiet ? "text-fg-3" : "font-semibold"}`}>
                {row.value}
              </p>
            </div>
            <WalkBar walk={walk} bar={row.bar} />
            <p className="text-[13px] text-fg-2 sm:hidden">{row.fact}</p>
            <p
              className={`text-right tabular-nums max-sm:hidden ${row.quiet ? "text-fg-3" : "font-semibold"}`}
            >
              {row.value}
            </p>
          </li>
        ))}
      </ol>
      <div className="grid gap-x-4 border-t border-fg/6 pt-2 sm:grid-cols-[16rem_minmax(0,1fr)_3rem]">
        <span className="text-xs text-fg-3 max-sm:hidden">Points out of 100</span>
        {axis}
      </div>
    </div>
  );
}
