import { useEffect, useId, useState } from "react";
import { formatMbps } from "@/core/format/bitrate";
import { formatClock } from "@/core/format/time";
import type { MediaPlaylist, Severity } from "@/core/hls";
import { MAX_CHIPS, type ChoiceGroup, type PlaylistChoice } from "@/core/inspect/groups";
import { measureMedia, type Measured } from "@/core/inspect/load";
import { fetchReader } from "@/core/inspect/read";
import { MAX_CHARTED_SEGMENTS, segmentChart } from "@/core/inspect/segments";
import { ChartOrTable, Key, ShowAs, Td, Th } from "@/ui/run/chart-parts";
import { severityWord } from "./severity";
import { SeverityIcon } from "./SeverityIcon";

const shades = ["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const;
const CHART_PX = 200;

// Each playlist's segments are measured once per page, however often it's chosen.
const reader = fetchReader();
const measuring = new WeakMap<MediaPlaylist, Promise<Measured>>();

/** Every segment's size, for the chosen playlist (subtitles have none); undefined while it's measured. */
function useMeasuredSegments(choice: PlaylistChoice | undefined): Measured | undefined {
  const [result, setResult] = useState<{ playlist: MediaPlaylist; measured: Measured }>();
  useEffect(() => {
    if (!choice || choice.kind === "subtitles") return;
    const { playlist } = choice;
    let current = true;
    let promise = measuring.get(playlist);
    if (!promise) {
      promise = measureMedia(playlist, reader, MAX_CHARTED_SEGMENTS);
      measuring.set(playlist, promise);
    }
    void promise.then((measured) => {
      if (current) setResult({ playlist, measured });
    });
    return () => {
      current = false;
    };
  }, [choice]);
  return result && result.playlist === choice?.playlist ? result.measured : undefined;
}

/** A chip's name: the first part of its label, or two when another chip in its group starts the same. */
function chipName(choice: PlaylistChoice, group: ChoiceGroup): string {
  const parts = choice.label.split(" · ");
  const first = parts[0] ?? choice.label;
  const shared = group.choices.some(
    (other) => other !== choice && other.label.split(" · ")[0] === first,
  );
  return shared ? parts.slice(0, 2).join(" · ") : first;
}

/** A tick for the bit rate axis: "4", "0.5". */
const tick = (bps: number) => String(Number((bps / 1e6).toFixed(bps < 1e6 ? 2 : 1)));

/** A round top for the axis, above `bps`. */
function axisTop(bps: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(bps, 1)));
  const step = [1, 2, 2.5, 4, 5, 8, 10].find((k) => k * magnitude >= bps) ?? 10;
  return step * magnitude;
}

/**
 * One media playlist's segments: each one's bit rate against what its variants declare, as a chart of fixed height
 * and a table. Big streams choose the playlist from a select with groups; small ones from chips.
 */
export function SegmentsPanel({
  groups,
  selected,
  onSelect,
  severities,
  className,
}: {
  groups: readonly ChoiceGroup[];
  selected: string | undefined;
  onSelect: (key: string) => void;
  severities: ReadonlyMap<string, Severity>;
  className: string;
}) {
  const [table, setTable] = useState(false);
  const selectId = useId();
  const radioName = useId();
  const all = groups.flatMap((group) => group.choices);
  const choice = all.find((candidate) => candidate.key === selected) ?? all[0];
  const measured = useMeasuredSegments(choice);
  if (!choice) return null;

  const chart = segmentChart(choice.playlist, measured, {
    ...(choice.declaredBps !== undefined && { declaredBps: choice.declaredBps }),
    separateAudio: choice.separateAudio ?? false,
  });
  const highest = Math.max(chart.peak?.bps ?? 0, choice.declaredBps ?? 0);
  const top = axisTop(highest * 1.08);
  const at = (bps: number) => `${String((1 - bps / top) * 100)}%`;
  const shade = shades[choice.shade ?? 3];
  const name = choice.label;
  const worst = (key: string) => severities.get(key);

  return (
    <section
      id="segments"
      aria-labelledby="segments-h"
      className={`flex min-w-0 scroll-mt-4 flex-col gap-3 rounded-xl border border-line bg-surface px-[18px] py-3.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="segments-h" className="text-lg font-semibold">
          Segments{" "}
          {choice.kind !== "subtitles" && (
            <span className="text-sm font-normal text-fg-3">· Mbps per segment</span>
          )}
        </h2>
        {choice.kind !== "subtitles" && (
          <ShowAs name="Segments" table={table} onChange={setTable} />
        )}
      </div>

      {all.length > MAX_CHIPS ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="text-[13px] text-fg-2">
            Playlist{" "}
            <span className="text-fg-3">
              · {all.length} in {groups.length} groups
            </span>
          </label>
          <select
            id={selectId}
            value={choice.key}
            onChange={(event) => {
              onSelect(event.target.value);
            }}
            className="min-h-10 w-full rounded-[10px] border border-line-strong bg-ground px-3 text-sm text-fg"
          >
            {groups.map((group) => (
              <optgroup
                key={group.label}
                label={`${group.label} (${String(group.choices.length)})`}
              >
                {group.choices.map((candidate) => {
                  const severity = worst(candidate.key);
                  return (
                    <option key={candidate.key} value={candidate.key}>
                      {candidate.label}
                      {severity && ` (${severityWord[severity].toLowerCase()})`}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        all.length > 1 && (
          // Native radios as chips: arrow keys move between them, as in any radio group.
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Playlist</legend>
            {groups.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-1.5">
                <span aria-hidden="true" className="w-full text-[13px] text-fg-2 sm:w-24">
                  {group.label}
                </span>
                {group.choices.map((candidate) => {
                  const severity = worst(candidate.key);
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
                          onSelect(candidate.key);
                        }}
                        className="sr-only"
                      />
                      {chipName(candidate, group)}
                      {severity && (
                        <>
                          <SeverityIcon severity={severity} size={8} />
                          <span className="sr-only">, worst finding: {severityWord[severity]}</span>
                        </>
                      )}
                    </label>
                  );
                })}
              </div>
            ))}
          </fieldset>
        )
      )}

      {choice.kind === "subtitles" ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-7 text-center text-sm text-fg-2">
          {name}: {chart.stats}. Subtitles have no bit rate to chart.
        </p>
      ) : (
        <>
          <p className="text-[13px] text-fg-2 tabular-nums">{chart.stats}</p>
          {measured === undefined ? (
            <p
              aria-live="polite"
              className="flex h-[200px] items-center justify-center text-sm text-fg-2"
            >
              Measuring {chart.bars.length} segments…
            </p>
          ) : (
            <ChartOrTable
              table={table}
              label="Segments as a table"
              minHeight={CHART_PX + 60}
              renderTable={() => (
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <Th>Segment</Th>
                      <Th>Starts</Th>
                      <Th>Length</Th>
                      <Th>Bit rate</Th>
                      <Th>
                        <span className="sr-only">Note</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {chart.bars.map((bar) => (
                      <tr key={bar.index} className="border-t border-fg/6">
                        <Td>{bar.index + 1}</Td>
                        <Td mono>{formatClock(bar.start, 1)}</Td>
                        <Td>{`${String(Number(bar.duration.toFixed(3)))} s`}</Td>
                        <Td>{bar.bps === undefined ? "—" : formatMbps(bar.bps)}</Td>
                        <Td>
                          {bar.overTarget && (
                            <span className="text-error-text">Over the target duration</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-3 text-xs text-fg-2">
                  <Key
                    swatch={<rect width="12" height="10" rx="2" className={shade} />}
                    label="Each segment's bit rate"
                  />
                  {choice.declaredBps !== undefined && (
                    <Key
                      swatch={
                        <path
                          d="M0 5 H16"
                          strokeWidth="2"
                          strokeDasharray="4 3"
                          className="stroke-fg"
                        />
                      }
                      label={`Declared, ${formatMbps(choice.declaredBps)}`}
                    />
                  )}
                </div>
                <div className="relative ml-9 h-[200px]">
                  {[top, top / 2, 0].map((value) => (
                    <span
                      key={value}
                      aria-hidden="true"
                      style={{ top: at(value) }}
                      className="absolute right-full mr-1.5 -translate-y-1/2 text-[11px] text-fg-3 tabular-nums"
                    >
                      {tick(value)}
                    </span>
                  ))}
                  <svg
                    viewBox={`0 0 ${String(Math.max(chart.bars.length, 1))} 100`}
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`${name}: ${chart.takeaway}`}
                    className="absolute inset-0 h-full w-full overflow-visible"
                  >
                    {[top, top / 2, 0].map((value) => (
                      <path
                        key={value}
                        d={`M0 ${String((1 - value / top) * 100)} H${String(chart.bars.length)}`}
                        vectorEffect="non-scaling-stroke"
                        className="stroke-line"
                      />
                    ))}
                    {chart.bars.map((bar, i) =>
                      bar.bps === undefined ? null : (
                        <rect
                          key={bar.index}
                          x={i + 0.12}
                          width={0.76}
                          y={(1 - bar.bps / top) * 100}
                          height={(bar.bps / top) * 100}
                          className={bar.overTarget ? "fill-error" : shade}
                        />
                      ),
                    )}
                    {choice.declaredBps !== undefined && (
                      <path
                        d={`M0 ${String((1 - choice.declaredBps / top) * 100)} H${String(chart.bars.length)}`}
                        vectorEffect="non-scaling-stroke"
                        strokeWidth="1.5"
                        strokeDasharray="5 4"
                        className="stroke-fg"
                      />
                    )}
                  </svg>
                </div>
                <div className="ml-9 flex justify-between font-mono text-[11px] text-fg-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i}>{formatClock((choice.playlist.totalDuration * i) / 3)}</span>
                  ))}
                </div>
              </div>
            </ChartOrTable>
          )}
          {/* The chart's label says the same, so it's read once. */}
          <p aria-hidden={measured !== undefined && !table} className="text-sm">
            {measured === undefined ? "" : chart.takeaway}
          </p>
        </>
      )}
    </section>
  );
}
