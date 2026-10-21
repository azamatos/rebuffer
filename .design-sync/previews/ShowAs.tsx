import { useState } from "react";
import { ShowAs } from "rebuffer";

// Chart | Table in a chart's header, named after the chart: press Table to read the data as rows.
export function InAChartHeader() {
  const [table, setTable] = useState(false);
  return (
    <div className="rounded-xl bg-ground p-5">
      <div className="flex items-start gap-3.5 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="flex-auto pt-0.5 text-sm font-semibold text-fg">
          Buffer <span className="font-normal text-fg-3">· seconds of video ahead</span>
        </span>
        <ShowAs name="Buffer" table={table} onChange={setTable} />
      </div>
    </div>
  );
}

// With Table pressed.
export function TablePressed() {
  const [table, setTable] = useState(true);
  return (
    <div className="rounded-xl bg-ground p-5">
      <ShowAs name="Segment downloads" table={table} onChange={setTable} />
    </div>
  );
}
