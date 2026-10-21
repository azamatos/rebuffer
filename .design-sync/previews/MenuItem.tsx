import { MenuItem, Popover } from "rebuffer";

const secondary =
  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong px-3.5 text-fg hover:border-fg-3 aria-expanded:border-fg-3";

// Menu items live in a Popover's panel: plain ones for what a menu does.
export function Plain() {
  return (
    <div className="rounded-xl bg-ground p-5" style={{ minHeight: 210 }}>
      <Popover open onOpenChange={() => undefined} buttonClassName={secondary} button={<>Import / Export</>}>
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

// `danger` for the one that destroys something: it goes last, in the error text colour.
export function Danger() {
  return (
    <div className="rounded-xl bg-ground p-5" style={{ minHeight: 170 }}>
      <Popover open onOpenChange={() => undefined} buttonClassName={secondary} button={<>More actions</>}>
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
