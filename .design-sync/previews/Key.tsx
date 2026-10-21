import { Key } from "rebuffer";

// A chart's legend: each series with its own swatch, drawn as SVG (an area as a rect, a line as a path). The colours
// mean one thing everywhere: blue the network, pink the player's estimate, green the quality on screen, purple the
// buffer, red a stall.
export function BandwidthAndQuality() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ground p-5 text-xs text-fg-2">
      <Key swatch={<rect width="14" height="10" rx="2" className="fill-net/45" />} label="Network" />
      <Key
        swatch={<path d="M0 5 H16" strokeWidth="2" strokeDasharray="4 3" className="stroke-estimate" />}
        label="Player's estimate"
      />
      <Key swatch={<path d="M0 5 H16" strokeWidth="2.5" className="stroke-onscreen" />} label="Quality on screen" />
      <Key swatch={<rect width="12" height="10" rx="2" className="fill-error/35" />} label="Stall" />
    </div>
  );
}

export function Buffer() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ground p-5 text-xs text-fg-2">
      <Key swatch={<rect width="14" height="10" rx="2" className="fill-buffer/45" />} label="Buffer" />
      <Key swatch={<rect width="12" height="10" rx="2" className="fill-error/35" />} label="Stall" />
    </div>
  );
}
