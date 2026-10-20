import {
  describeRange,
  isWhole,
  MIN_SPAN_S,
  panRange,
  wholeRange,
  zoomRange,
  type TimeRange,
} from "@/core/run/range";

interface ZoomBarProps {
  range: TimeRange;
  lengthS: number;
  onChange: (range: TimeRange) => void;
}

/**
 * Zoom for the Report's charts by keyboard (AGENTS.md rule 4): in, out, earlier, later and back to the whole run, with
 * the stretch on view read out as it changes. Dragging across a chart does the same with a mouse.
 */
export function ZoomBar({ range, lengthS, onChange }: ZoomBarProps) {
  const whole = isWhole(range, lengthS);
  const narrowest = range.to - range.from <= Math.min(MIN_SPAN_S, lengthS) + 1e-6;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <div role="group" aria-label="Zoom the charts" className="flex flex-wrap gap-1">
        <ZoomButton
          label="Zoom in"
          off={narrowest}
          onPress={() => {
            onChange(zoomRange(range, 0.5, lengthS));
          }}
        />
        <ZoomButton
          label="Zoom out"
          off={whole}
          onPress={() => {
            onChange(zoomRange(range, 2, lengthS));
          }}
        />
        <ZoomButton
          label="Earlier"
          symbol="‹"
          off={range.from <= 1e-6}
          onPress={() => {
            onChange(panRange(range, -0.5, lengthS));
          }}
        />
        <ZoomButton
          label="Later"
          symbol="›"
          off={range.to >= lengthS - 1e-6}
          onPress={() => {
            onChange(panRange(range, 0.5, lengthS));
          }}
        />
        <ZoomButton
          label="Whole run"
          off={whole}
          onPress={() => {
            onChange(wholeRange(lengthS));
          }}
        />
      </div>
      <p role="status" className="font-mono text-xs text-fg-2 tabular-nums">
        {describeRange(range, lengthS)}
      </p>
    </div>
  );
}

/**
 * A button that stays focusable when there's nothing for it to do, so focus isn't lost at the end of a zoom. With a
 * `symbol` it shows that and keeps `label` as its name.
 */
function ZoomButton({
  label,
  symbol,
  off,
  onPress,
}: {
  label: string;
  symbol?: string;
  off: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={off}
      {...(symbol && { "aria-label": label, title: label })}
      onClick={() => {
        if (!off) onPress();
      }}
      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-line-strong px-2.5 text-[13px] text-fg hover:border-fg-3 aria-disabled:cursor-default aria-disabled:border-line aria-disabled:text-fg-3 aria-disabled:hover:border-line"
    >
      {symbol ?? label}
    </button>
  );
}
