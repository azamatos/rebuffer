import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/core/format/time";
import { presets } from "@/core/netsim/presets";
import type { SavedRun } from "@/core/persist/runs";
import { PLAYER_PRESETS } from "@/core/player/settings";
import { changeOneSearch } from "@/core/run/report";
import { CurveThumb } from "@/ui/networks/CurveThumb";
import { RunSwatch } from "@/ui/runs/RunSwatch";

type Kind = "player" | "network";

/**
 * The Report's "Change one thing": pick another player preset or another network, and run B with only that change;
 * when B ends, Compare opens with this run as A.
 */
export function ChangeOne({
  id,
  run,
  onClose,
}: {
  id: string;
  run: SavedRun;
  onClose: () => void;
}) {
  const { network, player, streamName } = run.setup;
  const [kind, setKind] = useState<Kind>("player");
  const [picks, setPicks] = useState<Record<Kind, string>>(() => ({
    player: PLAYER_PRESETS.find((preset) => preset.id !== player.presetId)?.id ?? "",
    network: presets.find((preset) => preset.id !== network.id)?.id ?? "",
  }));
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const options =
    kind === "player"
      ? PLAYER_PRESETS.map((preset) => ({
          id: preset.id,
          name: preset.name,
          description: preset.description,
          isA: preset.id === player.presetId,
          curve: undefined,
        }))
      : presets.map((preset) => ({
          id: preset.id,
          name: preset.name,
          description: `${preset.description} ${formatClock(preset.curve.lengthS)}.`,
          isA: preset.id === network.id,
          curve: preset.curve,
        }));
  const picked = options.find((option) => option.id === picks[kind]);
  const pickedNetwork =
    kind === "network" ? presets.find((preset) => preset.id === picks.network) : undefined;
  const lengthB = pickedNetwork?.curve.lengthS ?? network.curve.lengthS;
  const lengthA = network.curve.lengthS;

  return (
    <section
      id={id}
      aria-labelledby="change-h"
      className="pop-in flex flex-col gap-4 rounded-[14px] border border-accent/35 bg-accent/6 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="change-h" className="text-lg font-semibold">
            Change one thing, then compare
          </h2>
          <p className="text-sm text-fg-2">
            Run B is this run with one change. When it ends, Compare opens with this run as A.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-9 flex-none items-center justify-center rounded-lg text-fg-2 hover:bg-fg/6 hover:text-fg"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`${id}-what`} className="text-sm text-fg-2">
          What to change
        </span>
        <span
          role="group"
          aria-labelledby={`${id}-what`}
          className="inline-flex flex-none rounded-lg bg-fg/6 p-0.5 text-sm"
        >
          {(
            [
              ["player", "Player setup"],
              ["network", "Network"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              ref={value === "player" ? first : undefined}
              type="button"
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
              }}
              className="rounded-md px-3 py-1.5 text-fg-2 transition-colors duration-200 hover:text-fg aria-pressed:bg-segment aria-pressed:text-fg aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.14)]"
            >
              {label}
            </button>
          ))}
        </span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="sr-only">
          {kind === "player" ? "Player setup for B" : "Network for B"}
        </legend>
        <div className="grid gap-1 md:grid-cols-2">
          {options.map((option) => (
            <label
              key={option.id}
              aria-disabled={option.isA}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-[15px] hover:bg-fg/4 has-checked:bg-fg/8 aria-disabled:cursor-default"
            >
              <input
                type="radio"
                name={`${id}-choice`}
                value={option.id}
                checked={option.id === picks[kind]}
                disabled={option.isA}
                onChange={() => {
                  setPicks((previous) => ({ ...previous, [kind]: option.id }));
                }}
                className="mt-0.5 size-4 flex-none accent-accent"
              />
              <span className="flex min-w-0 flex-auto flex-col">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium">{option.name}</span>
                  {option.isA && (
                    <span className="rounded-full bg-fg/6 px-2 py-0.5 text-xs text-fg-2">
                      A · this run
                    </span>
                  )}
                </span>
                <span className="text-sm text-fg-2">{option.description}</span>
              </span>
              {option.curve && (
                <CurveThumb curve={option.curve} className="mt-1 h-5 w-16 flex-none" />
              )}
            </label>
          ))}
        </div>
        {kind === "network" && (
          <p className="px-2 text-sm text-fg-2">
            Or{" "}
            <Link to="/networks" search={{ run: run.id }} className="underline underline-offset-2">
              draw a network in the editor
            </Link>
            ; a drawn network still counts as one change.
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-accent/35 pt-4">
        <p className="min-w-0 flex-[1_1_320px] text-[15px]">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <RunSwatch side="b" />
            B:
          </span>{" "}
          {streamName} ·{" "}
          {kind === "network" ? (
            <strong className="font-semibold">{picked?.name}</strong>
          ) : (
            network.name
          )}{" "}
          ·{" "}
          {kind === "player" ? (
            <strong className="font-semibold">{picked?.name}</strong>
          ) : (
            player.name
          )}
          .{" "}
          <span className="text-fg-2">
            Everything else as in A.
            {lengthB !== lengthA &&
              ` It runs ${formatClock(lengthB)}, A ran ${formatClock(lengthA)}; Compare lines them up from 0:00.`}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {picked && !picked.isA && (
            <Link
              to="/run"
              search={changeOneSearch(
                run,
                kind === "player" ? { kind, presetId: picked.id } : { kind, networkId: picked.id },
              )}
              className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
              </svg>
              Run B · {formatClock(lengthB)}
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-[10px] px-3 text-fg-2 hover:bg-fg/6 hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
