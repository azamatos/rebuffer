import { MenuItem, Popover } from "rebuffer";

// The app's secondary button, as the Report's actions use it.
const secondary =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3";

// The Report's "More actions" menu, open: an icon button, Export JSON, and Delete in red.
export function MoreActions() {
  return (
    <div className="flex items-start justify-end rounded-xl bg-ground p-5" style={{ minHeight: 190 }}>
      <Popover
        label="More actions"
        align="end"
        open
        onOpenChange={() => undefined}
        buttonClassName={`${secondary} px-3 aria-expanded:border-fg-3`}
        button={
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
          </svg>
        }
      >
        {() => (
          <>
            <MenuItem onSelect={() => undefined}>Export JSON</MenuItem>
            <MenuItem danger onSelect={() => undefined}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

// The Networks editor's Import / Export, open from a text button with a chevron.
export function ImportExport() {
  return (
    <div className="rounded-xl bg-ground p-5" style={{ minHeight: 210 }}>
      <Popover
        open
        onOpenChange={() => undefined}
        buttonClassName={`${secondary} aria-expanded:border-fg-3`}
        button={
          <>
            Import / Export
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </>
        }
      >
        {() => (
          <>
            <MenuItem onSelect={() => undefined}>Import JSON, CSV or HAR</MenuItem>
            <MenuItem onSelect={() => undefined}>Export JSON</MenuItem>
            <MenuItem onSelect={() => undefined}>Export CSV</MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

// Closed, as it first appears.
export function Closed() {
  return (
    <div className="rounded-xl bg-ground p-5">
      <Popover
        buttonClassName={`${secondary} aria-expanded:border-fg-3`}
        button={<>Import / Export</>}
      >
        {() => <MenuItem onSelect={() => undefined}>Export JSON</MenuItem>}
      </Popover>
    </div>
  );
}
