import { Link } from "@tanstack/react-router";
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { formatClock, parseClock } from "@/core/format/time";
import { curveToJson } from "@/core/netsim/curve";
import type { NetworkCurve } from "@/core/netsim/curve-math";
import { curveFromFile, curveToCsv } from "@/core/netsim/csv";
import {
  addPointAfter,
  deletePoint,
  placePoint,
  record,
  redo,
  setLength,
  setRtt,
  setShape,
  startHistory,
  undo,
  type History,
} from "@/core/netsim/edit";
import { TRACE_CREDIT } from "@/core/netsim/traces";
import {
  NETWORK_FORMAT,
  newNetworkId,
  savedNetworks,
  type SavedNetwork,
} from "@/core/persist/networks";
import type { SavedRun } from "@/core/persist/runs";
import { MAX_NETWORK_NAME, networkSearch } from "@/core/run/links";
import { runSearchWithNetwork } from "@/core/run/report";
import { DEFAULT_LADDER, DEFAULT_STREAM } from "@/core/samples";
import { CurveEditor } from "./CurveEditor";

/** What the editor opens with. */
export interface EditorStart {
  name: string;
  description: string | undefined;
  curve: NetworkCurve;
  /** The preset or trace id a run link may use while the curve is unchanged. */
  runsAs: string | undefined;
  /** Whether it's a recorded trace, whose credit is shown with it. */
  trace: boolean;
  /** The network saved in this browser that's being edited. */
  saved: SavedNetwork | undefined;
  /** The saved run whose network is being changed (the Report's "Change network"). */
  run: SavedRun | undefined;
}

interface NetworkEditorProps {
  start: EditorStart;
  /** After a save, so the list shows it and the address names it. */
  onSaved: (network: SavedNetwork) => void;
  onDeleted: () => void;
}

const card = "rounded-2xl border border-line bg-surface px-5 py-4.5";
const button =
  "inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3 text-sm text-fg hover:border-fg-3 aria-disabled:cursor-default aria-disabled:border-line aria-disabled:text-fg-3";
const field =
  "min-h-10 w-full rounded-lg border border-line-strong bg-ground px-2.5 font-mono text-sm text-fg aria-invalid:border-error";

const clock = (t: number) => formatClock(t, t % 1 === 0 ? 0 : 1);

/** A file name from a network's name: "rebuffer-network-train-through-a-tunnel.json". */
function fileName(name: string, extension: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `rebuffer-network-${slug || "network"}.${extension}`;
}

function download(text: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** The Networks screen's editor: the curve, the selected point, the whole network, and what to do with it. */
export function NetworkEditor({ start, onSaved, onDeleted }: NetworkEditorProps) {
  const [history, setHistory] = useState<History>(() => startHistory(start.curve));
  const [selected, setSelected] = useState(0);
  const [name, setName] = useState(start.name);
  const [savedId, setSavedId] = useState(start.saved?.id);
  // The curve as last loaded or saved: anything else is an edit.
  const [baseline, setBaseline] = useState(start.curve);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const fileRef = useRef<HTMLInputElement>(null);

  const curve = history.present;
  const index = Math.min(selected, curve.points.length - 1);
  const edited = curve !== baseline;

  const edit = (next: NetworkCurve, nextSelected = index) => {
    setHistory((current) => record(current, next));
    setSelected(nextSelected);
  };
  const step = (move: (history: History) => History, word: string) => {
    if (move(history) === history) return;
    setHistory(move);
    setNotice({ text: word });
  };

  // An unchanged preset or trace runs by its id; anything else carries its curve, and its name says it was edited.
  const linkName = edited && name === start.name ? `${name}, edited` : name;
  const network = {
    id: curve === start.curve ? start.runsAs : undefined,
    name: linkName,
    curve,
  };
  const runSearch = start.run ? runSearchWithNetwork(start.run, network) : networkSearch(network);

  const save = async () => {
    const id = savedId ?? newNetworkId();
    const basedOn = start.saved?.basedOn ?? start.runsAs;
    const saved: SavedNetwork = {
      format: NETWORK_FORMAT,
      id,
      name: name.trim().slice(0, MAX_NETWORK_NAME) || "My network",
      savedAt: Date.now(),
      curve,
      ...(basedOn ? { basedOn } : {}),
    };
    try {
      await savedNetworks().save(saved);
    } catch {
      setNotice({ text: "This browser didn't let the lab save the network.", error: true });
      return;
    }
    setSavedId(id);
    setBaseline(curve);
    setName(saved.name);
    setNotice({ text: savedId ? "Saved." : "Saved in this browser, under “Yours”." });
    onSaved(saved);
  };

  const remove = async () => {
    if (!savedId) return;
    await savedNetworks().remove(savedId);
    onDeleted();
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const result = curveFromFile(file.name, await file.text());
    if (!result.ok) {
      setNotice({
        text: `${file.name} isn't a network the lab can read. ${result.errors.join(" ")}`,
        error: true,
      });
      return;
    }
    edit(result.curve, 0);
    setName(file.name.replace(/\.[^.]+$/, "").slice(0, MAX_NETWORK_NAME));
    setNotice({
      text: `Imported ${result.curve.points.length} points from ${file.name}. Undo brings the last network back.`,
    });
  };

  const exportAs = (kind: "json" | "csv") => {
    const named = fileName(name, kind);
    if (kind === "json") download(curveToJson(curve), "application/json", named);
    else download(curveToCsv(curve), "text/csv", named);
    setNotice({ text: `Downloaded ${named}.` });
  };

  const changeLength = (lengthS: number) => {
    const next = setLength(curve, lengthS);
    edit(next);
    const dropped = curve.points.length - next.points.length;
    if (dropped > 0) {
      setNotice({
        text: `${dropped} ${dropped === 1 ? "point" : "points"} after ${formatClock(next.lengthS)} went. Undo brings them back.`,
      });
    }
  };

  return (
    <div className="flex min-w-0 flex-[999_1_720px] flex-col gap-4">
      <section aria-labelledby="editor-h" className={card}>
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <h2 id="editor-h" className="min-w-0 flex-[1_1_260px] text-[22px] font-semibold">
            {name || "Untitled network"}
            {edited && (
              <span className="text-base font-normal text-fg-3">
                {" "}
                · {savedId ? "unsaved changes" : "edited copy"}
              </span>
            )}
          </h2>
          <div
            role="group"
            aria-label="Between points"
            className="inline-flex overflow-hidden rounded-lg border border-line-strong"
          >
            {(["steps", "slopes"] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                aria-pressed={curve.shape === shape}
                onClick={() => {
                  edit(setShape(curve, shape));
                }}
                className="min-h-9 px-3 text-sm text-fg-2 aria-pressed:bg-white/10 aria-pressed:text-fg"
              >
                {shape === "steps" ? "Steps" : "Slopes"}
              </button>
            ))}
          </div>
          <IconButton
            label="Undo"
            off={history.past.length === 0}
            onPress={() => {
              step(undo, "Undone.");
            }}
          >
            <path d="M5 3 L2 6 L5 9" />
            <path d="M2 6 H10 A4 4 0 0 1 10 14 H7" />
          </IconButton>
          <IconButton
            label="Redo"
            off={history.future.length === 0}
            onPress={() => {
              step(redo, "Redone.");
            }}
          >
            <path d="M11 3 L14 6 L11 9" />
            <path d="M14 6 H6 A4 4 0 0 0 6 14 H9" />
          </IconButton>
        </div>
        {start.description && <p className="mb-2 text-sm text-fg-2">{start.description}</p>}
        {start.trace && (
          <p className="mb-2 text-[13px] text-fg-3">
            Recorded by {TRACE_CREDIT.authors} ({TRACE_CREDIT.citation}),{" "}
            <a
              href={TRACE_CREDIT.licenceUrl}
              className="text-fg-2 underline underline-offset-2 hover:text-fg"
            >
              {TRACE_CREDIT.licence}
            </a>
            . {TRACE_CREDIT.changes}
          </p>
        )}
        {start.run && (
          <p className="mb-2 text-sm text-fg-2">
            Changing the network of a run of {start.run.setup.streamName}. “Use in a run” keeps its
            stream and player.
          </p>
        )}
        <div className="mb-1.5 flex flex-wrap gap-3.5 text-[13px] text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="10" aria-hidden="true">
              <rect width="14" height="10" rx="2" className="fill-net/45" />
            </svg>
            Bandwidth
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="10" aria-hidden="true">
              <path d="M0 5 H16" strokeDasharray="3 3" className="stroke-fg-3" />
            </svg>
            Qualities of {DEFAULT_STREAM.name}
          </span>
        </div>
        <CurveEditor
          curve={curve}
          ladder={DEFAULT_LADDER}
          selected={index}
          onSelect={setSelected}
          onEdit={edit}
          onUndo={() => {
            step(undo, "Undone.");
          }}
          onRedo={() => {
            step(redo, "Redone.");
          }}
        />
        <p className="mt-2.5 text-sm text-fg-2">
          Where the curve dips below a dashed line, that quality downloads slower than it plays.
          Below the 240p line, every quality does.
        </p>
        <details className="mt-2 text-sm">
          <summary className="w-fit cursor-pointer text-[13px] text-fg-2 hover:text-fg">
            Points as a table
          </summary>
          <div
            role="region"
            aria-label="Points as a table"
            tabIndex={0}
            className="mt-2 max-h-72 overflow-auto tabular-nums"
          >
            <table className="w-full text-left">
              <thead>
                <tr>
                  {["Point", "Time", "Bandwidth"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="sticky top-0 bg-surface py-1.5 pr-4 font-medium text-fg-2"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {curve.points.map((point, i) => (
                  <tr
                    key={i}
                    aria-current={i === index ? "true" : undefined}
                    className="border-t border-white/6 aria-[current]:text-accent"
                  >
                    <td className="py-1.5 pr-4">{i + 1}</td>
                    <td className="py-1.5 pr-4 font-mono">{clock(point.t)}</td>
                    <td className="py-1.5 pr-4">{point.mbps} Mbps</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <PointCard
          curve={curve}
          index={index}
          onPlace={(next) => {
            edit(next);
          }}
          onAdd={() => {
            const added = addPointAfter(curve, index);
            if (added) edit(added.curve, added.index);
            else setNotice({ text: "No room for a point after this one." });
          }}
          onDelete={() => {
            if (curve.points.length <= 1) {
              setNotice({ text: "A network keeps at least one point." });
              return;
            }
            const next = deletePoint(curve, index);
            edit(next, Math.min(index, next.points.length - 1));
          }}
        />

        <section
          aria-labelledby="whole-h"
          className={`${card} flex min-w-0 flex-[1_1_300px] flex-col gap-3`}
        >
          <h2 id="whole-h" className="text-base font-semibold">
            Whole network
          </h2>
          <label className="flex flex-col gap-1 text-[13px] text-fg-2">
            Name
            <input
              type="text"
              value={name}
              maxLength={MAX_NETWORK_NAME}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className={`${field} font-sans`}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <NumberField
              label="Latency (RTT), ms"
              value={String(curve.rttMs)}
              read={(text): Read<number> => {
                const ms = text.trim() === "" ? Number.NaN : Number(text);
                return Number.isInteger(ms) && ms >= 0 && ms <= 5000
                  ? { ok: true, value: ms }
                  : { ok: false, error: "Latency must be a whole number of ms, from 0 to 5000." };
              }}
              apply={(ms) => {
                edit(setRtt(curve, ms));
              }}
            />
            <NumberField
              label="Length"
              value={formatClock(curve.lengthS)}
              read={(text): Read<number> => {
                const t = parseClock(text);
                return t !== undefined && t >= 1 && t <= 3600
                  ? { ok: true, value: t }
                  : { ok: false, error: "Length must be a time from 0:01 to 1:00:00, like 1:30." };
              }}
              apply={changeLength}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() => {
                fileRef.current?.click();
              }}
            >
              Import JSON or CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv,text/plain"
              className="hidden"
              onChange={(event) => void importFile(event)}
            />
            <button
              type="button"
              className={button}
              onClick={() => {
                exportAs("json");
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={button}
              onClick={() => {
                exportAs("csv");
              }}
            >
              Export CSV
            </button>
          </div>
        </section>

        <section aria-labelledby="keys-h" className={`${card} min-w-0 flex-[1_1_300px]`}>
          <h2 id="keys-h" className="mb-2.5 text-base font-semibold">
            Keyboard
          </h2>
          <p className="mb-2 text-[13px] text-fg-3">With the curve focused (Tab to it):</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            <Key keys="← →">move in time, 1 s (Shift: 5 s)</Key>
            <Key keys="↑ ↓">bandwidth up or down 10% (Shift: to the next quality line)</Key>
            <Key keys="[ ]">the point before or after</Key>
            <Key keys="N · Delete">add a point after this one · delete this one</Key>
            <Key keys="⌘Z · ⇧⌘Z">undo · redo (Ctrl on Windows and Linux)</Key>
          </dl>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <p
          aria-live="polite"
          className={`mr-auto text-sm empty:hidden ${notice?.error ? "text-error-text" : "text-fg-2"}`}
        >
          {notice?.text}
        </p>
        {savedId && (
          <button
            type="button"
            onClick={() => void remove()}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-error/50 px-4 text-error-text hover:border-error"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={() => void save()}
          className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4.5 text-fg hover:border-fg-3"
        >
          {savedId ? "Save changes" : "Save to my networks"}
        </button>
        <Link
          to="/run"
          search={runSearch}
          className="inline-flex min-h-11 items-center rounded-[10px] bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
        >
          Use in a run
        </Link>
      </div>
    </div>
  );
}

function IconButton({
  label,
  off,
  onPress,
  children,
}: {
  label: string;
  off: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={off}
      onClick={() => {
        if (!off) onPress();
      }}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong text-fg hover:border-fg-3 aria-disabled:cursor-default aria-disabled:border-line aria-disabled:text-fg-3"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function Key({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-mono text-fg">{keys}</dt>
      <dd className="text-fg-2">{children}</dd>
    </>
  );
}

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A text field for a number that applies on Enter or when focus leaves, and says what's wrong instead. It follows
 * `value` when that changes elsewhere (undo, the keyboard on the curve) without losing focus.
 */
function NumberField<T>({
  label,
  value,
  read,
  apply,
}: {
  label: string;
  value: string;
  read: (text: string) => Read<T>;
  apply: (value: T) => void;
}) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [error, setError] = useState<string>();
  const errorId = useId();
  if (seen !== value) {
    setSeen(value);
    setText(value);
    setError(undefined);
  }
  const commit = () => {
    if (text.trim() === value) return;
    const result = read(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    apply(result.value);
  };
  return (
    <div className="flex min-w-[120px] flex-[1_1_120px] flex-col gap-1">
      <label className="flex flex-col gap-1 text-[13px] text-fg-2">
        {label}
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={error !== undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
          className={field}
        />
      </label>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-error-text">
          {error}
        </p>
      )}
    </div>
  );
}

/** The selected point: its time and bandwidth as fields, and buttons to add a point after it or delete it. */
function PointCard({
  curve,
  index,
  onPlace,
  onAdd,
  onDelete,
}: {
  curve: NetworkCurve;
  index: number;
  onPlace: (curve: NetworkCurve) => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const point = curve.points[index];
  if (!point) return null;
  return (
    <section
      aria-labelledby="point-h"
      className={`${card} flex min-w-0 flex-[1_1_300px] flex-col gap-3`}
    >
      <h2 id="point-h" className="text-base font-semibold">
        Point {index + 1} of {curve.points.length}
      </h2>
      <div className="flex flex-wrap gap-3">
        <NumberField
          label="Time"
          value={clock(point.t)}
          read={(text): Read<NetworkCurve> => {
            const t = parseClock(text);
            if (t === undefined) return { ok: false, error: "Type a time like 0:42 or 42." };
            const placed = placePoint(curve, index, t, point.mbps);
            return placed.ok ? { ok: true, value: placed.curve } : placed;
          }}
          apply={onPlace}
        />
        <NumberField
          label="Bandwidth, Mbps"
          value={String(point.mbps)}
          read={(text): Read<NetworkCurve> => {
            const mbps = text.trim() === "" ? Number.NaN : Number(text.replace(",", "."));
            if (!Number.isFinite(mbps)) {
              return { ok: false, error: "Bandwidth must be a number of Mbps, from 0 to 1000." };
            }
            const placed = placePoint(curve, index, point.t, mbps);
            return placed.ok ? { ok: true, value: placed.curve } : placed;
          }}
          apply={onPlace}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={onAdd}>
          Add point after
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex min-h-10 items-center rounded-lg border border-error/50 px-3 text-sm text-error-text hover:border-error"
        >
          Delete point
        </button>
      </div>
    </section>
  );
}
