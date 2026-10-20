import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChartMarker } from "@/charts/draw";
import { mountRunCharts, type RunCharts as Charts } from "@/charts/live";
import { formatClock, formatDuration } from "@/core/format/time";
import type { NetworkCurve } from "@/core/netsim/curve";
import {
  chartRows,
  describeBufferChart,
  describeDownloadsChart,
  describeNetworkChart,
  downloadRows,
  formatRate,
} from "@/core/run/chart-text";
import type { Run } from "@/core/run/controller";
import type { Level, RunEvent } from "@/core/run/events";
import type { TimeRange } from "@/core/run/range";
import { buildTimeline } from "@/core/run/timeline";
import { useTheme } from "@/ui/theme/useTheme";

interface RunChartsProps {
  curve: NetworkCurve;
  /** The run on screen, once one has started; without one, a finished log in `events` is drawn at once. */
  run: Run | undefined;
  /** The run's log: copied four times a second while it runs (only the text reads it then), or a finished run's. */
  events: readonly RunEvent[];
  /** How far the run has got, seconds. */
  untilS: number;
  /** Numbered markers on the bandwidth chart for a finished run's notes. */
  markers?: readonly ChartMarker[];
  /** The stretch a finished run's charts and their text show (the Report's zoom); all of the run without it. */
  range?: TimeRange;
  /** Called with the stretch a pointer picks on the charts; without it, they can't be picked. */
  onPick?: (range: TimeRange) => void;
}

const NO_MARKERS: readonly ChartMarker[] = [];

/** Bandwidth and quality, buffer and downloads on one time axis, each with a sentence and a data table. */
export function RunCharts({
  curve,
  run,
  events,
  untilS,
  markers = NO_MARKERS,
  range,
  onPick,
}: RunChartsProps) {
  const networkRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement>(null);
  const downloadsRef = useRef<HTMLCanvasElement>(null);
  const chartsRef = useRef<Charts>(undefined);

  useEffect(() => {
    const network = networkRef.current;
    const buffer = bufferRef.current;
    const downloads = downloadsRef.current;
    if (!network || !buffer || !downloads) return;
    const charts = mountRunCharts({ network, buffer, downloads }, curve);
    chartsRef.current = charts;
    return () => {
      charts.destroy();
      chartsRef.current = undefined;
    };
  }, [curve]);

  // Live events go from the run to the canvases directly, not through React state.
  useEffect(() => {
    const charts = chartsRef.current;
    if (!charts || !run) return;
    let current = true;
    charts.follow(() => (performance.timeOrigin + performance.now() - run.startedAt) / 1000);
    for (const event of run.events) charts.add(event);
    const unsubscribe = run.subscribe((event) => {
      charts.add(event);
    });
    // A run that fails ends without telling its listeners; its result has the end.
    void run.finished.then((result) => {
      const end = result.events.at(-1);
      if (current && end) charts.add(end);
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [run, curve]);

  // A finished run without a live handle (the Report): draw its whole log.
  const finished = useMemo(
    () => (events.some((event) => event.type === "end") ? events : undefined),
    [events],
  );
  useEffect(() => {
    const charts = chartsRef.current;
    if (!charts || run || !finished) return;
    charts.show(finished, markers);
  }, [run, finished, curve, markers]);

  const theme = useTheme();
  useEffect(() => {
    chartsRef.current?.retheme();
  }, [theme]);

  // The Report's zoom: the stretch on view, and a pointer to pick another.
  useEffect(() => {
    chartsRef.current?.zoom(range);
  }, [range, curve]);
  useEffect(() => {
    const charts = chartsRef.current;
    if (!charts || !onPick) return;
    return charts.pick(onPick);
  }, [onPick, curve]);

  const timeline = useMemo(() => buildTimeline(events), [events]);
  const levels = timeline.levels;
  const canvasClass = onPick ? "cursor-crosshair touch-pan-y" : "";

  return (
    <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
      <figure className="rounded-[14px] border border-line bg-surface px-[18px] pt-4 pb-3">
        <figcaption className="mb-2 flex flex-wrap justify-between gap-x-4 gap-y-2">
          <span className="text-[15px] font-semibold">
            Bandwidth and quality <span className="font-normal text-fg-3">· Mbps, log scale</span>
          </span>
          <span className="flex flex-wrap gap-3.5 text-[13px] text-fg-2">
            <Key
              swatch={<rect width="14" height="10" rx="2" className="fill-net/45" />}
              label="Network"
            />
            <Key
              swatch={
                <path
                  d="M0 5 H16"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  className="stroke-estimate"
                />
              }
              label="Player's estimate"
            />
            <Key
              swatch={<path d="M0 5 H16" strokeWidth="2.5" className="stroke-onscreen" />}
              label="Quality on screen"
            />
            <Key
              swatch={<rect width="12" height="10" rx="2" className="fill-error/35" />}
              label="Stall"
            />
          </span>
        </figcaption>
        <canvas
          ref={networkRef}
          role="img"
          aria-label={describeNetworkChart(timeline, curve, untilS, range)}
          className={`block h-[200px] w-full ${canvasClass}`}
        />
        <DataTable label="Bandwidth and quality as a table">
          {() => (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Network</Th>
                  <Th>Player's estimate</Th>
                  <Th>On screen</Th>
                </tr>
              </thead>
              <tbody>
                {chartRows(timeline, curve, untilS, range).map((row) => (
                  <tr key={row.t} className="border-t border-fg/6">
                    <Td mono>{formatClock(row.t)}</Td>
                    <Td>{formatRate(row.networkBps)}</Td>
                    <Td>{row.estimateBps === undefined ? "—" : formatRate(row.estimateBps)}</Td>
                    <Td>{row.shown ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTable>
      </figure>

      <figure className="rounded-[14px] border border-line bg-surface px-[18px] pt-4 pb-3">
        <figcaption className="mb-2 flex flex-wrap justify-between gap-2">
          <span className="text-[15px] font-semibold">
            Buffer <span className="font-normal text-fg-3">· seconds of video ahead</span>
          </span>
          <span className="flex flex-wrap gap-3.5 text-[13px] text-fg-2">
            <Key
              swatch={<rect width="14" height="10" rx="2" className="fill-buffer/45" />}
              label="Buffer"
            />
            <Key
              swatch={<rect width="12" height="10" rx="2" className="fill-error/35" />}
              label="Stall"
            />
          </span>
        </figcaption>
        <canvas
          ref={bufferRef}
          role="img"
          aria-label={describeBufferChart(timeline, untilS, range, curve.lengthS)}
          className={`block h-[110px] w-full ${canvasClass}`}
        />
        <DataTable label="Buffer as a table">
          {() => (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Buffer</Th>
                  <Th>Playback</Th>
                </tr>
              </thead>
              <tbody>
                {chartRows(timeline, curve, untilS, range).map((row) => (
                  <tr key={row.t} className="border-t border-fg/6">
                    <Td mono>{formatClock(row.t)}</Td>
                    <Td>{row.bufferS === undefined ? "—" : `${row.bufferS.toFixed(1)} s`}</Td>
                    <Td>{row.stalled ? "Stalled" : row.bufferS === undefined ? "—" : "Playing"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTable>
      </figure>

      <figure className="rounded-[14px] border border-line bg-surface px-[18px] pt-4 pb-3">
        <figcaption className="mb-2 flex flex-wrap justify-between gap-2">
          <span className="text-[15px] font-semibold">
            Segment downloads{" "}
            <span className="font-normal text-fg-3">
              · one bar per video segment, colour = quality
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2.5 text-[13px] text-fg-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden="true">
                {(["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const).map((shade) => (
                  <svg key={shade} width="10" height="10">
                    <rect width="10" height="10" rx="2" className={shade} />
                  </svg>
                ))}
              </span>
              {ladderEnds(levels)}
            </span>
            <Key
              swatch={
                <rect
                  x="0.75"
                  y="0.75"
                  width="10.5"
                  height="8.5"
                  rx="2"
                  fill="none"
                  strokeDasharray="2 2"
                  className="stroke-error-text"
                />
              }
              label="Abandoned"
            />
          </span>
        </figcaption>
        <canvas
          ref={downloadsRef}
          role="img"
          aria-label={describeDownloadsChart(timeline, untilS, range, curve.lengthS)}
          className={`block h-10 w-full ${canvasClass}`}
        />
        <DataTable label="Segment downloads as a table">
          {() => (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <Th>Started</Th>
                  <Th>Quality</Th>
                  <Th>Took</Th>
                  <Th>Size</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {downloadRows(timeline, range, untilS).map((row, i) => (
                  <tr key={`${row.start}-${i}`} className="border-t border-fg/6">
                    <Td mono>{formatClock(row.start, 1)}</Td>
                    <Td>{row.quality}</Td>
                    <Td>{row.tookS === undefined ? "—" : formatDuration(row.tookS)}</Td>
                    <Td>{row.bytes === undefined ? "—" : `${(row.bytes / 1e6).toFixed(2)} MB`}</Td>
                    <Td>
                      {row.state === "done"
                        ? "Done"
                        : row.state === "abandoned"
                          ? "Abandoned"
                          : "Downloading"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTable>
      </figure>
    </div>
  );
}

/** "240p → 1080p", from the ladder once the player has read it. */
function ladderEnds(levels: readonly Level[]): string {
  const sorted = [...levels].sort((a, b) => a.bitrate - b.bitrate);
  const low = sorted[0]?.name;
  const high = sorted.at(-1)?.name;
  return low && high && sorted.length > 1 ? `${low} → ${high}` : "lowest → highest quality";
}

function Key({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="10" aria-hidden="true" className="overflow-visible">
        {swatch}
      </svg>
      {label}
    </span>
  );
}

/** A closed disclosure; its table is only built while it's open. */
function DataTable({ label, children }: { label: string; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-2 text-sm"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="w-fit cursor-pointer text-[13px] text-fg-2 hover:text-fg">
        {label}
      </summary>
      {open && (
        <div
          role="region"
          aria-label={label}
          tabIndex={0}
          className="mt-2 max-h-72 overflow-auto tabular-nums"
        >
          {children()}
        </div>
      )}
    </details>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="sticky top-0 bg-surface py-1.5 pr-4 font-medium text-fg-2">
      {children}
    </th>
  );
}

function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`py-1.5 pr-4 ${mono ? "font-mono text-fg-3" : ""}`}>{children}</td>;
}
