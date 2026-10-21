import { useState } from "react";
import { ChartOrTable, Key, ShowAs, Td, Th } from "rebuffer";

const points = [
  { t: "0:00", mbps: 6 },
  { t: "0:20", mbps: 3 },
  { t: "0:30", mbps: 2.5 },
  { t: "0:42", mbps: 0 },
  { t: "0:54", mbps: 0 },
  { t: "1:03", mbps: 6 },
];

// A chart card as the Run screen and the Networks editor draw them: title and unit, legend keys, Chart | Table, and
// the chart (here a sketch of the tunnel network; in the app a canvas) or its data as a table in the same place.
function NetworkCard({ startWithTable }: { startWithTable: boolean }) {
  const [table, setTable] = useState(startWithTable);
  return (
    <figure className="rounded-xl border border-line bg-surface px-4 pt-3 pb-2.5">
      <figcaption className="mb-1.5 flex items-start gap-3.5">
        <span className="flex min-w-0 flex-auto flex-wrap items-center gap-x-3.5 gap-y-1 pt-0.5">
          <span className="text-sm font-semibold">
            Network <span className="font-normal text-fg-3">· Mbps</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-2">
            <Key swatch={<rect width="14" height="10" rx="2" className="fill-net/45" />} label="Bandwidth" />
          </span>
        </span>
        <ShowAs name="Network" table={table} onChange={setTable} />
      </figcaption>
      <ChartOrTable
        table={table}
        label="Network as a table"
        renderTable={() => (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <Th>Point</Th>
                <Th>Time</Th>
                <Th>Bandwidth</Th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, i) => (
                <tr key={point.t} className="border-t border-fg/6">
                  <Td>{i + 1}</Td>
                  <Td mono>{point.t}</Td>
                  <Td>{point.mbps} Mbps</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      >
        <svg
          viewBox="0 0 560 150"
          preserveAspectRatio="none"
          width="100%"
          height="150"
          role="img"
          aria-label="6 Mbps, weaker in the tunnel, 12 s of nothing, and back to 6 Mbps"
        >
          <path d="M0 20 H160 V80 H240 V95 H336 V150 H432 L504 20 H560 V150 H0 Z" className="fill-net/45" />
          <path
            d="M0 20 H160 V80 H240 V95 H336 V150 H432 L504 20 H560"
            fill="none"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="stroke-net"
          />
        </svg>
      </ChartOrTable>
    </figure>
  );
}

export function ChartShown() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <NetworkCard startWithTable={false} />
    </div>
  );
}

export function TableShown() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <NetworkCard startWithTable />
    </div>
  );
}
