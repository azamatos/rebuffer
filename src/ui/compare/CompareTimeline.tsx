import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  laneLayout,
  lanesBufferTop,
  mountLanes,
  networkTop,
  type LaneCanvas,
  type LaneLayout,
  type LaneScales,
  type Lanes,
} from "@/charts/lanes";
import { formatMbps } from "@/core/format/bitrate";
import { formatClock } from "@/core/format/time";
import { playerLabel, timelineRows, type Comparison, type CompareSide } from "@/core/run/compare";
import type { Moment } from "@/core/run/compare-story";
import { ChartOrTable, Key, ShowAs, Td, Th } from "@/ui/run/chart-parts";
import { RunSwatch } from "@/ui/runs/RunSwatch";
import { useTheme } from "@/ui/theme/useTheme";

const NARROW = "(max-width: 639px)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", onChange);
      return () => {
        query.removeEventListener("change", onChange);
      };
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

/** A row's heading: the run, and what sets its row apart. */
function laneHeading(c: Comparison, s: CompareSide): string {
  const { setup } = s.run;
  return [
    c.sameNetwork ? playerLabel(s.run) : `${playerLabel(s.run)} on ${setup.network.name}`,
    c.streams && setup.streamName,
    s.stopped && `stopped at ${formatClock(s.endS)}`,
    s.held && "held back by your network",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" · ");
}

/** One row per run, on the same scales: networks, quality on screen, buffer and stalls, with numbered moments. */
export function CompareTimeline({
  c,
  found,
  look,
}: {
  c: Comparison;
  found: readonly Moment[];
  look: string;
}) {
  const narrow = useNarrow();
  const theme = useTheme();
  const [table, setTable] = useState(false);
  const sharedRef = useRef<HTMLCanvasElement>(null);
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);
  const lanesRef = useRef<Lanes>(undefined);

  const layouts = useMemo(() => {
    const own = !c.sameNetwork;
    return {
      shared: laneLayout({ network: true, run: false, axis: false, narrow }),
      a: laneLayout({ network: own, run: true, axis: false, narrow }),
      b: laneLayout({ network: own, run: true, axis: true, narrow }),
    };
  }, [c.sameNetwork, narrow]);

  const scales = useMemo<LaneScales>(
    () => ({
      lengthS: c.lengthS,
      mbps: c.streams,
      topBps: networkTop(
        [c.a.run.setup.network.curve, c.b.run.setup.network.curve],
        c.streams ? [...c.a.whole.timeline.levels, ...c.b.whole.timeline.levels] : [],
      ),
      bufferTopS: lanesBufferTop([c.a.whole.timeline, c.b.whole.timeline]),
      untilS: c.untilS,
    }),
    [c],
  );

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    const markers = (side: "a" | "b") =>
      found.flatMap((moment, i) =>
        moment.side === side ? [{ t: moment.t, label: String(i + 1) }] : [],
      );
    const lane = (canvas: HTMLCanvasElement, layout: LaneLayout, s: CompareSide): LaneCanvas => ({
      canvas,
      layout,
      network: c.sameNetwork ? undefined : s.run.setup.network.curve,
      run: {
        timeline: s.whole.timeline,
        curve: s.run.setup.network.curve,
        endS: s.endS,
        markers: markers(s.key),
      },
    });
    const canvases: LaneCanvas[] = [lane(a, layouts.a, c.a), lane(b, layouts.b, c.b)];
    const shared = sharedRef.current;
    if (shared && c.sameNetwork) {
      canvases.unshift({
        canvas: shared,
        layout: layouts.shared,
        network: c.a.run.setup.network.curve,
        run: undefined,
      });
    }
    const lanes = mountLanes(canvases, scales);
    lanesRef.current = lanes;
    return () => {
      lanes.destroy();
      lanesRef.current = undefined;
    };
  }, [c, found, layouts, scales, table]);

  useEffect(() => {
    lanesRef.current?.retheme();
  }, [theme]);

  const anyStopped = c.a.stopped || c.b.stopped;
  const faded =
    c.untilS !== undefined && (c.a.endS > c.untilS + 1e-6 || c.b.endS > c.untilS + 1e-6);
  const gutter = { marginLeft: layouts.a.gutter };
  const rows = table ? timelineRows(c) : [];

  return (
    <section aria-labelledby="timeline-h" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="timeline-h" className="text-lg font-semibold">
            Timeline
          </h2>
          <p className="text-[13px] text-fg-3">One row per run, on the same scales.</p>
        </div>
        <ShowAs name="Timeline" table={table} onChange={setTable} />
      </div>
      <figure className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <figcaption className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <span className="max-w-[880px] min-w-0 flex-[1_1_320px] text-sm text-fg-2">{look}</span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-2">
            <Key
              swatch={<rect width="14" height="10" rx="2" className="fill-net/45" />}
              label="Network"
            />
            <Key
              swatch={<path d="M0 5 H16" strokeWidth="2.5" className="stroke-onscreen" />}
              label={c.streams ? "Quality on screen, Mbps" : "Quality on screen"}
            />
            <Key
              swatch={<rect width="14" height="10" rx="2" className="fill-buffer/45" />}
              label="Buffer: seconds of video ahead"
            />
            <Key
              swatch={<rect width="10" height="10" rx="2" className="fill-error" />}
              label="Stall"
            />
            {faded && (
              <Key
                swatch={<rect width="14" height="10" rx="2" className="fill-fg-3/30" />}
                label="Not compared"
              />
            )}
            {anyStopped && (
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
                    className="stroke-fg-3"
                  />
                }
                label="Not played"
              />
            )}
          </span>
        </figcaption>
        <ChartOrTable
          table={table}
          label="Both runs as a table"
          minHeight={384}
          renderTable={() => (
            <table className="w-full bg-surface text-left">
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>{c.sameNetwork ? "Network" : "A’s network"}</Th>
                  <Th>A on screen</Th>
                  <Th>A’s buffer</Th>
                  {!c.sameNetwork && <Th>B’s network</Th>}
                  <Th>B on screen</Th>
                  <Th>B’s buffer</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.t} className="border-t border-fg/6">
                    <Td mono>{formatClock(row.t)}</Td>
                    <Td>{formatMbps(row.a.network)}</Td>
                    <Td>{row.a.shown}</Td>
                    <Td>{row.a.buffer}</Td>
                    {!c.sameNetwork && <Td>{formatMbps(row.b.network)}</Td>}
                    <Td>{row.b.shown}</Td>
                    <Td>{row.b.buffer}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        >
          <div
            role="img"
            aria-label={`Both runs on one time axis. ${look} The table and the list below say the same in words.`}
            className="flex flex-col gap-1.5 pt-1"
          >
            {c.sameNetwork && (
              <div className="flex flex-col gap-1">
                <p className="text-[13px] text-fg-2" style={gutter}>
                  <span className="font-semibold text-fg">Network</span> ·{" "}
                  {c.a.run.setup.network.name}, the same in both
                </p>
                <canvas
                  ref={sharedRef}
                  className="block w-full"
                  style={{ height: layouts.shared.height }}
                />
              </div>
            )}
            {(
              [
                [c.a, aRef, layouts.a],
                [c.b, bRef, layouts.b],
              ] as const
            ).map(([s, ref, layout]) => (
              <div key={s.key} className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px]" style={gutter}>
                  <RunSwatch side={s.key} />
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-fg-2">{laneHeading(c, s)}</span>
                </p>
                <canvas ref={ref} className="block w-full" style={{ height: layout.height }} />
              </div>
            ))}
          </div>
        </ChartOrTable>
      </figure>
    </section>
  );
}
