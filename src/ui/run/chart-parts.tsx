import { useState, type ReactNode } from "react";

/** Pieces the run charts and the comparison share: a legend entry, a data table behind a disclosure, its cells. */

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

/** A closed disclosure; its table is only built while it's open. */
export function DataTable({ label, children }: { label: string; children: () => ReactNode }) {
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

export function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="sticky top-0 bg-surface py-1.5 pr-4 font-medium text-fg-2">
      {children}
    </th>
  );
}

export function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`py-1.5 pr-4 ${mono ? "font-mono text-fg-3" : ""}`}>{children}</td>;
}
