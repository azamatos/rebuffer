import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { fitCanvas, readTheme, type ChartTheme, type Painter } from "@/charts/draw";
import {
  drawEditor,
  editorDomain,
  editorLayout,
  nearestPoint,
  type LadderLine,
} from "@/charts/editor";
import { formatClock } from "@/core/format/time";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import {
  addPointAfter,
  deletePoint,
  describePoint,
  insertPoint,
  ladderStep,
  moveTime,
  setRate,
  stepRate,
} from "@/core/netsim/edit";
import { useTheme } from "@/ui/theme/useTheme";

interface CurveEditorProps {
  curve: NetworkCurve;
  ladder: readonly LadderLine[];
  selected: number;
  onSelect: (index: number) => void;
  /** A finished edit, for the undo history, and the point to select after it. */
  onEdit: (curve: NetworkCurve, selected: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * The curve editor (AGENTS.md rule 4: the keyboard does everything the mouse does). Arrows move the selected point,
 * Shift for bigger steps; [ and ] pick another point, N adds one, Delete removes it; Tab leaves, as anywhere else.
 * With a pointer: drag a point, double-click to add one. Changes are read out in a polite live region.
 */
export function CurveEditor({
  curve,
  ladder,
  selected,
  onSelect,
  onEdit,
  onUndo,
  onRedo,
}: CurveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<Painter | undefined>(undefined);
  const themeRef = useRef<ChartTheme | undefined>(undefined);
  const drawRef = useRef<() => void>(() => undefined);
  const dragRef = useRef<{ index: number; curve: NetworkCurve | undefined } | undefined>(undefined);
  const [preview, setPreview] = useState<NetworkCurve>();
  const [active, setActive] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // The bandwidth scale keeps at least the loaded network's range, so it doesn't jump back while a point is edited.
  const [loaded] = useState(curve);
  const helpId = useId();

  const theme = useTheme();
  const shown = preview ?? curve;
  const domain = editorDomain(shown, ladder, editorDomain(loaded, ladder));

  // Draw after every render; the resize observer and the font load draw with the latest props through drawRef.
  useEffect(() => {
    drawRef.current = () => {
      const painter = painterRef.current;
      const theme = themeRef.current;
      if (!painter || !theme) return;
      drawEditor(painter, theme, {
        curve: shown,
        ladder,
        domain,
        selected,
        active: active || preview !== undefined,
      });
    };
    drawRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    themeRef.current = readTheme(canvas);
    drawRef.current();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      painterRef.current = fitCanvas(canvas);
      drawRef.current();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    // Labels use Space Mono; draw again once it has loaded.
    void document.fonts.ready.then(() => {
      drawRef.current();
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  const layout = () => {
    const canvas = canvasRef.current;
    return editorLayout(canvas?.clientWidth ?? 1, canvas?.clientHeight ?? 1, curve.lengthS, domain);
  };
  const local = (event: PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect();
    return { px: event.clientX - (box?.left ?? 0), py: event.clientY - (box?.top ?? 0) };
  };

  const commit = (next: NetworkCurve, index: number, say = describePoint(next, index)) => {
    if (next !== curve) onEdit(next, index);
    else if (index !== selected) onSelect(index);
    setAnnouncement(say);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const point = curve.points[selected];
    if (!point) return;
    const modifier = event.metaKey || event.ctrlKey;
    const last = curve.points.length - 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const step = (event.shiftKey ? 5 : 1) * (event.key === "ArrowLeft" ? -1 : 1);
        commit(moveTime(curve, selected, point.t + step), selected);
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
        const direction = event.key === "ArrowUp" ? 1 : -1;
        const mbps = event.shiftKey
          ? ladderStep(
              point.mbps,
              ladder.map((line) => line.bitrate),
              direction,
            )
          : stepRate(point.mbps, direction);
        commit(setRate(curve, selected, mbps), selected);
        break;
      }
      case "[":
        commit(curve, Math.max(0, selected - 1));
        break;
      case "]":
        commit(curve, Math.min(last, selected + 1));
        break;
      case "Home":
        commit(curve, 0);
        break;
      case "End":
        commit(curve, last);
        break;
      case "n":
      case "N": {
        if (modifier) return;
        const added = addPointAfter(curve, selected);
        if (added)
          commit(added.curve, added.index, `Added. ${describePoint(added.curve, added.index)}`);
        else setAnnouncement("No room for a point after this one.");
        break;
      }
      case "Delete":
      case "Backspace": {
        if (curve.points.length <= 1) {
          setAnnouncement("A network keeps at least one point.");
          break;
        }
        const next = deletePoint(curve, selected);
        const index = Math.min(selected, next.points.length - 1);
        commit(next, index, `Deleted. ${describePoint(next, index)}`);
        break;
      }
      case "z":
      case "Z":
        if (!modifier) return;
        if (event.shiftKey) onRedo();
        else onUndo();
        break;
      case "y":
      case "Y":
        if (!event.ctrlKey) return;
        onRedo();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const { px, py } = local(event);
    const hit = nearestPoint(layout(), curve, px, py);
    if (hit === undefined) return;
    onSelect(hit);
    dragRef.current = { index: hit, curve: undefined };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { px, py } = local(event);
    const view = layout();
    const next = setRate(moveTime(curve, drag.index, view.time(px)), drag.index, view.rate(py));
    drag.curve = next;
    setPreview(next);
  };
  const endDrag = (keep: boolean) => {
    const drag = dragRef.current;
    dragRef.current = undefined;
    setPreview(undefined);
    if (keep && drag?.curve) commit(drag.curve, drag.index);
  };
  const onDoubleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const [px, py] = [event.clientX - box.left, event.clientY - box.top];
    const view = layout();
    if (nearestPoint(view, curve, px, py) !== undefined) return;
    const added = insertPoint(curve, view.time(px), view.rate(py));
    if (added)
      commit(added.curve, added.index, `Added. ${describePoint(added.curve, added.index)}`);
  };

  return (
    <div>
      <div
        role="application"
        aria-roledescription="network curve editor"
        aria-label="Network curve"
        aria-describedby={helpId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setActive(true);
        }}
        onBlur={() => {
          setActive(false);
        }}
        className="rounded-lg"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            endDrag(true);
          }}
          onPointerCancel={() => {
            endDrag(false);
          }}
          onDoubleClick={onDoubleClick}
          className="block h-[260px] w-full cursor-crosshair touch-none"
        />
      </div>
      <p id={helpId} className="sr-only">
        {curve.points.length} points over {formatClock(curve.lengthS)}. Selected:{" "}
        {describePoint(curve, selected)}. Arrows move it, with Shift in bigger steps; [ and ] choose
        another point; N adds one, Delete removes it; ? lists every key.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
