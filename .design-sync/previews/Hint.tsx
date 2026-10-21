import { Hint } from "rebuffer";

// A one-line note for first-time visitors, until "Got it" (remembered in this browser by its id).
export function WhatToWatch() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <Hint id="preview-run-charts" title="What to watch">
        First run? On the charts, the blue area is the network, pink dashes the player&apos;s estimate,
        green steps the quality on screen, purple the buffer, red bands stalls.
      </Hint>
    </div>
  );
}

export function Short() {
  return (
    <div className="rounded-xl bg-ground p-5 text-fg">
      <Hint id="preview-zoom" title="Zoom">
        Drag across a chart to zoom in; double-click to see the whole run.
      </Hint>
    </div>
  );
}
