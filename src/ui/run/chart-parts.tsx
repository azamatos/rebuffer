import type { ReactNode } from "react";

/** Pieces the run charts and the comparison share: a legend entry, the Chart | Table toggle and its table, cells. */

export function Key({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="10" aria-hidden="true" className="overflow-visible">
        {swatch}
      </svg>
      {label}
    </span>
  );
}

/** Chart | Table, in a chart's header: two pressed-or-not buttons, named after the chart. */
export function ShowAs({
  name,
  table,
  onChange,
}: {
  name: string;
  table: boolean;
  onChange: (table: boolean) => void;
}) {
  return (
    <span
      role="group"
      aria-label={`${name}: show as`}
      className="inline-flex flex-none rounded-lg bg-fg/6 p-0.5 text-xs"
    >
      {[false, true].map((asTable) => (
        <button
          key={String(asTable)}
          type="button"
          aria-pressed={table === asTable}
          onClick={() => {
            onChange(asTable);
          }}
          className="rounded-md px-2.5 py-1 text-fg-2 transition-colors duration-200 hover:text-fg aria-pressed:bg-segment aria-pressed:text-fg aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.14)] motion-reduce:transition-none"
        >
          {asTable ? "Table" : "Chart"}
        </button>
      ))}
    </span>
  );
}

/**
 * A chart, or its data as a table in the chart's place (at least `minHeight` tall), so what's below barely moves.
 * The chart stays mounted under the table, so a canvas keeps drawing; the table is only built while it shows.
 */
export function ChartOrTable({
  table,
  label,
  minHeight = 176,
  renderTable,
  children,
}: {
  table: boolean;
  /** The table's name, as "Buffer as a table". */
  label: string;
  minHeight?: number;
  renderTable: () => ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="relative transition-[min-height] duration-200 motion-reduce:transition-none"
      style={{ minHeight: table ? minHeight : 0 }}
    >
      <div
        className={`transition-[opacity,visibility] duration-200 motion-reduce:transition-none ${table ? "invisible opacity-0" : ""}`}
      >
        {children}
      </div>
      {table && (
        <div
          role="region"
          aria-label={label}
          tabIndex={0}
          className="fade-in absolute inset-0 overflow-auto rounded-lg border border-line text-sm tabular-nums"
        >
          {renderTable()}
        </div>
      )}
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="sticky top-0 border-b border-line bg-surface py-1.5 pr-4 font-medium text-fg-2 first:pl-3"
    >
      {children}
    </th>
  );
}

export function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <td className={`py-1.5 pr-4 first:pl-3 ${mono ? "font-mono text-fg-3" : ""}`}>{children}</td>
  );
}
