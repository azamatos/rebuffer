import { useId, useState } from "react";
import { formatClock } from "@/core/format/time";
import type { MediaPlaylist } from "@/core/hls";
import { segmentStats } from "@/core/inspect/model";

export interface SegmentsChoice {
  key: string;
  label: string;
  playlist: MediaPlaylist;
}

const shades = ["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const;
const seconds = (value: number) => `${String(Number(value.toFixed(3)))} s`;

/** One media playlist's segments: counts, and each segment's duration against the target, as a chart and a table. */
export function SegmentsPanel({ choices }: { choices: readonly SegmentsChoice[] }) {
  const [key, setKey] = useState(choices[0]?.key);
  const selectId = useId();
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
      className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="segments-h" className="text-lg font-semibold">
          Segments
        </h2>
        {choices.length > 1 && (
          <span className="inline-flex items-center gap-2 text-sm text-fg-2">
            <label htmlFor={selectId}>Playlist</label>
            <select
              id={selectId}
              value={choice.key}
              onChange={(event) => {
                setKey(event.target.value);
              }}
              className="min-h-9 rounded-lg border border-line-strong bg-ground px-2 text-fg"
            >
              {choices.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
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
      <p className="mt-1 font-mono text-xs tracking-[0.04em] text-fg-3 uppercase">
        Duration of each segment
      </p>
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
            <path d={`M0 ${String(targetY)} H320`} strokeDasharray="3 4" className="stroke-fg-3" />
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
      <p className="text-sm text-fg-2">{stats.description}</p>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-[13px] text-fg-2 hover:text-fg">
          Segments as a table
        </summary>
        <div
          role="region"
          aria-label="Segments as a table"
          tabIndex={0}
          className="mt-2 max-h-72 overflow-auto tabular-nums"
        >
          <table className="w-full text-left">
            <thead>
              <tr>
                {["Segment", "Starts", "Duration", ""].map((heading, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="sticky top-0 bg-surface py-1.5 pr-4 font-medium text-fg-2"
                  >
                    {heading || <span className="sr-only">Note</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {choice.playlist.segments.map((segment, index) => (
                <tr key={index} className="border-t border-white/6">
                  <td className="py-1.5 pr-4">{index + 1}</td>
                  <td className="py-1.5 pr-4 font-mono">{formatClock(segment.startTime, 1)}</td>
                  <td className="py-1.5 pr-4">{seconds(segment.duration)}</td>
                  <td className="py-1.5 pr-4 text-error-text">
                    {stats.overTarget.includes(index) ? "Over the target" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
