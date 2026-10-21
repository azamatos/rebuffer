import { useState } from "react";
import { ZoomBar } from "rebuffer";

// The Report's zoom, for keyboard and mouse alike: in, out, earlier, later and the whole run, with what's on show.
export function WholeRun() {
  const [range, setRange] = useState({ from: 0, to: 90 });
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <ZoomBar range={range} lengthS={90} onChange={setRange} />
    </div>
  );
}

// Zoomed in on the tunnel: Earlier, Later and Whole run come alive.
export function ZoomedIn() {
  const [range, setRange] = useState({ from: 36, to: 60 });
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <ZoomBar range={range} lengthS={90} onChange={setRange} />
    </div>
  );
}
