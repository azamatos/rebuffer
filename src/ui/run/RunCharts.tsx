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
import { ChartOrTable, Key, ShowAs, Td, Th } from "./chart-parts";

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

  const [tables, setTables] = useState({ network: false, buffer: false, downloads: false });
  const showAs = (chart: keyof typeof tables) => ({
    table: tables[chart],
    onChange: (table: boolean) => {
      setTables((previous) => ({ ...previous, [chart]: table }));
    },
  });

  const timeline = useMemo(() => buildTimeline(events), [events]);
  const levels = timeline.levels;
  const canvasClass = onPick ? "cursor-crosshair touch-pan-y" : "";

  return (
    <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
      <ChartFrame
        title="Bandwidth and quality"
        unit="Mbps, log scale"
        keys={
          <>
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
          </>
        }
        {...showAs("network")}
        renderTable={() => (
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
      >
        <canvas
          ref={networkRef}
          role="img"
          aria-label={describeNetworkChart(timeline, curve, untilS, range)}
          className={`block h-[200px] w-full ${canvasClass}`}
        />
      </ChartFrame>

      <ChartFrame
        title="Buffer"
        unit="seconds of video ahead"
        keys={
          <>
            <Key
              swatch={<rect width="14" height="10" rx="2" className="fill-buffer/45" />}
              label="Buffer"
            />
            <Key
              swatch={<rect width="12" height="10" rx="2" className="fill-error/35" />}
              label="Stall"
            />
          </>
        }
        {...showAs("buffer")}
        renderTable={() => (
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
      >
        <canvas
          ref={bufferRef}
          role="img"
          aria-label={describeBufferChart(timeline, untilS, range, curve.lengthS)}
          className={`block h-[110px] w-full ${canvasClass}`}
        />
      </ChartFrame>

      <ChartFrame
        title="Segment downloads"
        unit="one bar per segment, colour = quality"
        keys={
          <>
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
          </>
        }
        {...showAs("downloads")}
        renderTable={() => (
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
      >
        <canvas
          ref={downloadsRef}
          role="img"
          aria-label={describeDownloadsChart(timeline, untilS, range, curve.lengthS)}
          className={`block h-10 w-full ${canvasClass}`}
        />
      </ChartFrame>
    </div>
  );
}

/** One chart's card: its title, legend and Chart | Table toggle on one line, then the chart or its table. */
function ChartFrame({
  title,
  unit,
  keys,
  table,
  onChange,
  renderTable,
  children,
}: {
  title: string;
  unit: string;
  keys: ReactNode;
  table: boolean;
  onChange: (table: boolean) => void;
  renderTable: () => ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-xl border border-line bg-surface px-4 pt-3 pb-2.5">
      <figcaption className="mb-1.5 flex items-start gap-3.5">
        <span className="flex min-w-0 flex-auto flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5">
          <span className="text-sm font-semibold">
            {title} <span className="font-normal text-fg-3">· {unit}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
            {keys}
          </span>
        </span>
        <ShowAs name={title} table={table} onChange={onChange} />
      </figcaption>
      <ChartOrTable table={table} label={`${title} as a table`} renderTable={renderTable}>
        {children}
      </ChartOrTable>
    </figure>
  );
}

/** "240p → 1080p", from the ladder once the player has read it. */
function ladderEnds(levels: readonly Level[]): string {
  const sorted = [...levels].sort((a, b) => a.bitrate - b.bitrate);
  const low = sorted[0]?.name;
  const high = sorted.at(-1)?.name;
  return low && high && sorted.length > 1 ? `${low} → ${high}` : "lowest → highest quality";
}
