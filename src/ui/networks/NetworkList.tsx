import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { presets } from "@/core/netsim/presets";
import { recordedTraces, TRACE_CREDIT } from "@/core/netsim/traces";
import type { SavedNetwork } from "@/core/persist/networks";
import { formatClock } from "@/core/format/time";
import { CurveThumb } from "./CurveThumb";

/** What the Networks screen shows, as its link's search params. */
export interface NetworksSearch {
  /** A preset or recorded trace, by id. */
  network?: string;
  /** A network saved in this browser, by id. */
  saved?: string;
  /** A saved run whose network to change (the Report's "Change network"). */
  run?: string;
  /** "blank": a new network. */
  new?: string;
}

/** "0.5–1.5 Mbps · 1:30" */
function summary(curve: NetworkCurve): string {
  const rates = curve.points.map((point) => point.mbps);
  const low = Math.min(...rates);
  const high = Math.max(...rates);
  const range = low === high ? `${high} Mbps` : `${low}–${high} Mbps`;
  return `${range} · ${formatClock(curve.lengthS)}`;
}

function NetworkLink({
  search,
  current,
  name,
  curve,
}: {
  search: NetworksSearch;
  current: boolean;
  name: string;
  curve: NetworkCurve;
}) {
  return (
    <li>
      <Link
        to="/networks"
        search={search}
        aria-current={current ? "true" : undefined}
        className="group grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2 py-2 text-fg hover:bg-fg/4 aria-[current]:bg-accent/10"
      >
        <CurveThumb curve={curve} className="h-5 w-16" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block font-mono text-[11px] text-fg-3 tabular-nums group-aria-[current]:text-fg-2">
            {summary(curve)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Group({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-0.5">
      <h2 id={id} className="mx-2 mb-1 text-xs font-semibold tracking-[0.04em] text-fg-3 uppercase">
        {title}
        {count !== undefined && ` · ${count}`}
      </h2>
      {children}
    </section>
  );
}

/** The networks to pick from: presets, recorded traces with their credit, and the visitor's own. */
export function NetworkList({
  current,
  saved,
}: {
  current: NetworksSearch;
  saved: SavedNetwork[] | "unavailable" | undefined;
}) {
  return (
    <nav aria-label="Networks" className="flex flex-col gap-3">
      <Group id="presets-h" title="Presets" count={presets.length}>
        <ul className="flex flex-col gap-0.5">
          {presets.map((preset) => (
            <NetworkLink
              key={preset.id}
              search={{ network: preset.id }}
              current={current.network === preset.id}
              name={preset.name}
              curve={preset.curve}
            />
          ))}
        </ul>
      </Group>
      <Group id="traces-h" title="Recorded 4G" count={recordedTraces.length}>
        <ul className="flex flex-col gap-0.5">
          {recordedTraces.map((trace) => (
            <NetworkLink
              key={trace.id}
              search={{ network: trace.id }}
              current={current.network === trace.id}
              name={trace.name}
              curve={trace.curve}
            />
          ))}
        </ul>
        <p className="mx-2 mt-1 text-[11px] text-fg-3">
          Real 4G recordings: {TRACE_CREDIT.citation},{" "}
          <a
            href={TRACE_CREDIT.licenceUrl}
            className="text-fg-2 underline underline-offset-2 hover:text-fg"
          >
            {TRACE_CREDIT.licence}
          </a>
          . 90 s excerpts, converted;{" "}
          <a
            href={TRACE_CREDIT.sourceUrl}
            className="text-fg-2 underline underline-offset-2 hover:text-fg"
          >
            the dataset
          </a>
          .
        </p>
      </Group>
      <Group id="yours-h" title="Yours">
        {saved === "unavailable" ? (
          <p className="mx-2 text-[13px] text-fg-3">
            This browser doesn&apos;t let the lab save networks.
          </p>
        ) : saved && saved.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {saved.map((network) => (
              <NetworkLink
                key={network.id}
                search={{ saved: network.id }}
                current={current.saved === network.id}
                name={network.name}
                curve={network.curve}
              />
            ))}
          </ul>
        ) : (
          saved && <p className="mx-2 text-[13px] text-fg-3">None saved in this browser yet.</p>
        )}
        <Link
          to="/networks"
          search={{ new: "blank" }}
          aria-current={current.new === "blank" ? "true" : undefined}
          className="mx-2 mt-1 inline-flex min-h-10 items-center justify-center rounded-lg border border-dashed border-line-strong text-sm text-fg-2 hover:border-fg-3 hover:text-fg aria-[current]:border-accent aria-[current]:text-fg"
        >
          + New network
        </Link>
      </Group>
    </nav>
  );
}
