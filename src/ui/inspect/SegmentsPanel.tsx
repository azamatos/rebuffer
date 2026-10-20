import { useId, useState } from "react";
import { formatClock } from "@/core/format/time";
import type { MediaPlaylist, Severity } from "@/core/hls";
import { segmentStats } from "@/core/inspect/model";
import { ChartOrTable, ShowAs, Td, Th } from "@/ui/run/chart-parts";
import { severityWord } from "./severity";
import { SeverityIcon } from "./SeverityIcon";

export interface SegmentsChoice {
  key: string;
  label: string;
  playlist: MediaPlaylist;
  /** Its most serious finding (`playlistSeverities`), shown on its chip. */
  severity: Severity | undefined;
}

const shades = ["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const;
const seconds = (value: number) => `${String(Number(value.toFixed(3)))} s`;

/** One media playlist's segments: counts, and each segment's duration against the target, as a chart and a table. */
export function SegmentsPanel({ choices }: { choices: readonly SegmentsChoice[] }) {
  const [key, setKey] = useState(choices[0]?.key);
  const [table, setTable] = useState(false);
  const radioName = useId();
  const choice = choices.find((candidate) => candidate.key === key) ?? choices[0];
  if (!choice) return null;
  const stats = segmentStats(choice.playlist);

  // The chart: a bar per segment on a 320 × 110 canvas, the target as a dashed line.
  const scale = Math.max(stats.targetDuration ?? 0, ...stats.durations, 1) * 1.15;
  const height = (duration: number) => (duration / scale) * 72;
  const slot = 320 / Math.max(1, stats.count);
  const width = Math.max(0.6, slot * 0.8);
  const targetY =
    stats.targetDuration === undefined ? undefined : 100 - height(stats.targetDuration);
  const labelled = stats.overTarget.length <= 3 ? stats.overTarget : [];

  return (
    <section
      aria-labelledby="segments-h"
      className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5 rounded-xl border border-line bg-surface px-[18px] py-3.5"
    >
      <h2 id="segments-h" className="text-lg font-semibold">
        Segments
      </h2>
      {choices.length > 1 && (
        // Native radios as chips: arrow keys move between them, as in any radio group.
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Playlist</legend>
          {choices.map((candidate) => {
            const worst = candidate.severity;
            return (
              <label
                key={candidate.key}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 text-[13px] hover:border-fg-3 has-checked:border-accent has-checked:bg-accent/10 has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name={radioName}
                  value={candidate.key}
                  checked={candidate.key === choice.key}
                  onChange={() => {
                    setKey(candidate.key);
                  }}
                  className="sr-only"
                />
                {candidate.label}
                {worst && (
                  <>
                    <SeverityIcon severity={worst} size={8} />
                    <span className="sr-only">, worst finding: {severityWord[worst]}</span>
                  </>
                )}
              </label>
            );
          })}
        </fieldset>
      )}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
        <dt className="text-fg-2">Segments</dt>
        <dd>{stats.count}</dd>
        <dt className="text-fg-2">Target duration</dt>
        <dd>{stats.targetDuration === undefined ? "—" : seconds(stats.targetDuration)}</dd>
        <dt className="text-fg-2">Total</dt>
        <dd>{formatClock(stats.totalS)}</dd>
        <dt className="text-fg-2">Container</dt>
        <dd>{stats.container}</dd>
        <dt className="text-fg-2">Discontinuities</dt>
        <dd>{stats.discontinuities}</dd>
      </dl>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs tracking-[0.04em] text-fg-3 uppercase">
          Duration of each segment
        </p>
        <ShowAs name="Segments" table={table} onChange={setTable} />
      </div>
      <ChartOrTable
        table={table}
        label="Segments as a table"
        minHeight={200}
        renderTable={() => (
          <table className="w-full text-left">
            <thead>
              <tr>
                <Th>Segment</Th>
                <Th>Starts</Th>
                <Th>Duration</Th>
                <Th>
                  <span className="sr-only">Note</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {choice.playlist.segments.map((segment, index) => (
                <tr key={index} className="border-t border-fg/6">
                  <Td>{index + 1}</Td>
                  <Td mono>{formatClock(segment.startTime, 1)}</Td>
                  <Td>{seconds(segment.duration)}</Td>
                  <Td>
                    {stats.overTarget.includes(index) && (
                      <span className="text-error-text">Over the target</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        <svg
          viewBox="0 0 320 110"
          width="100%"
          role="img"
          aria-label={`${choice.label}: ${stats.description}`}
          className="block"
        >
          {stats.durations.map((duration, index) => (
            <rect
              key={index}
              x={index * slot}
              y={100 - height(duration)}
              width={width}
              height={height(duration)}
              rx={width >= 6 ? 2 : 0}
              className={stats.overTarget.includes(index) ? "fill-error" : shades[3]}
            />
          ))}
          {targetY !== undefined && stats.targetDuration !== undefined && (
            <>
              <path
                d={`M0 ${String(targetY)} H320`}
                strokeDasharray="3 4"
                className="stroke-fg-3"
              />
              <text
                x="320"
                y={targetY - 5}
                textAnchor="end"
                className="fill-fg-2 font-mono text-[11px]"
              >
                target {seconds(stats.targetDuration)}
              </text>
            </>
          )}
          {labelled.map((index) => (
            <text
              key={index}
              x={index * slot + width / 2}
              y={100 - height(stats.durations[index] ?? 0) - 6}
              textAnchor="middle"
              className="fill-error-text font-mono text-[11px]"
            >
              {Number((stats.durations[index] ?? 0).toFixed(2))}
            </text>
          ))}
          <path d="M0 100.5 H320" className="stroke-line-strong" />
        </svg>
      </ChartOrTable>
      <p className="text-sm text-fg-2">{stats.description}</p>
    </section>
  );
}
