import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ReactNode, type SubmitEvent } from "react";
import { formatClock } from "@/core/format/time";
import { presets, type NetworkPreset } from "@/core/netsim/presets";
import { PLAYER_PRESETS, type PlayerPreset } from "@/core/player/settings";
import {
  DEFAULT_NETWORK_ID,
  DEFAULT_PLAYER_ID,
  readStreamLink,
  runSearchFor,
} from "@/core/run/setup";
import { DEFAULT_STREAM, SAMPLE_STREAMS } from "@/core/samples";
import { CurveThumb } from "@/ui/networks/CurveThumb";

/** The stream choice that reveals a field for any HLS link. */
const OWN_LINK = "own-link";

const cardClass =
  "flex min-w-0 flex-col gap-3 rounded-[14px] border border-line bg-surface p-5 [&>legend]:float-left [&>legend]:w-full";

function StepLabel({ step, children }: { step: number; children: ReactNode }) {
  return (
    <span className="font-mono text-xs tracking-[0.06em] text-fg-3 uppercase">
      <span aria-hidden="true">{step} · </span>
      {children}
    </span>
  );
}

/** One radio in a list: a native input, so arrow keys move through the group in every browser. */
function Choice({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[15px] hover:bg-white/4 has-checked:bg-white/6">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => {
          onChange(value);
        }}
        className="size-4 flex-none accent-accent"
      />
      {children}
    </label>
  );
}

/** Home's setup: a stream, a network and a player, then Run opens the Run screen and starts. */
export function RunSetup() {
  const navigate = useNavigate();
  const [streamId, setStreamId] = useState(DEFAULT_STREAM.id);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string>();
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK_ID);
  const [playerId, setPlayerId] = useState(DEFAULT_PLAYER_ID);
  const linkRef = useRef<HTMLInputElement>(null);

  const sample = SAMPLE_STREAMS.find((stream) => stream.id === streamId);
  const network: NetworkPreset | undefined = presets.find((preset) => preset.id === networkId);
  const player: PlayerPreset | undefined = PLAYER_PRESETS.find((preset) => preset.id === playerId);
  const lengthS = network?.curve.lengthS ?? 0;

  const run = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    let streamUrl = sample?.url ?? DEFAULT_STREAM.url;
    if (streamId === OWN_LINK) {
      const read = readStreamLink(link, window.location.protocol);
      if (!read.ok) {
        setLinkError(read.error);
        linkRef.current?.focus();
        return;
      }
      streamUrl = read.url;
    }
    void navigate({
      to: "/run",
      search: runSearchFor({ streamUrl, networkId, playerId }, { start: true }),
    });
  };

  const ours = SAMPLE_STREAMS.filter((stream) => stream.host === "ours");
  const theirs = SAMPLE_STREAMS.filter((stream) => stream.host === "third-party");

  return (
    <section
      id="setup"
      aria-labelledby="setup-h"
      className="mx-auto max-w-[1280px] scroll-mt-6 px-4 pt-6 pb-12 sm:px-8"
    >
      <h2 id="setup-h" className="mb-4 text-[22px] font-semibold">
        Set up a run
      </h2>
      <form
        noValidate
        onSubmit={run}
        className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-4"
      >
        <fieldset className={cardClass}>
          <legend className="mb-1">
            <StepLabel step={1}>Stream</StepLabel>
          </legend>
          <div className="flex flex-col">
            {ours.map((stream) => (
              <Choice
                key={stream.id}
                name="stream"
                value={stream.id}
                checked={streamId === stream.id}
                onChange={setStreamId}
              >
                {stream.name}
              </Choice>
            ))}
            <p className="px-2 pt-2 pb-1 text-xs text-fg-3">
              Public test streams, hosted by others
            </p>
            {theirs.map((stream) => (
              <Choice
                key={stream.id}
                name="stream"
                value={stream.id}
                checked={streamId === stream.id}
                onChange={setStreamId}
              >
                {stream.name}
              </Choice>
            ))}
            <Choice
              name="stream"
              value={OWN_LINK}
              checked={streamId === OWN_LINK}
              onChange={setStreamId}
            >
              Your own link
            </Choice>
          </div>
          {streamId === OWN_LINK ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stream-link" className="text-sm text-fg-2">
                Link to an HLS playlist (.m3u8)
              </label>
              <input
                ref={linkRef}
                id="stream-link"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://example.com/video/master.m3u8"
                value={link}
                onChange={(event) => {
                  setLink(event.target.value);
                  setLinkError(undefined);
                }}
                aria-invalid={linkError !== undefined}
                aria-describedby={linkError ? "stream-link-error" : undefined}
                className="min-h-11 rounded-lg border border-line-strong bg-ground px-3 font-mono text-sm placeholder:text-fg-3 aria-invalid:border-error"
              />
              {linkError && (
                <p id="stream-link-error" role="alert" className="text-sm text-error-text">
                  {linkError}
                </p>
              )}
            </div>
          ) : (
            sample && (
              <p className="text-sm text-fg-2">
                {sample.description}
                {sample.host === "third-party" &&
                  " Someone else hosts it, so it may change or disappear."}
              </p>
            )
          )}
        </fieldset>

        <fieldset className={cardClass}>
          <legend className="mb-1">
            <StepLabel step={2}>Network</StepLabel>
          </legend>
          <div className="flex flex-col">
            {presets.map((preset) => (
              <Choice
                key={preset.id}
                name="network"
                value={preset.id}
                checked={networkId === preset.id}
                onChange={setNetworkId}
              >
                <span className="min-w-0">{preset.name}</span>
                <CurveThumb curve={preset.curve} className="ml-auto h-5 w-16 flex-none" />
              </Choice>
            ))}
          </div>
          {network && (
            <p className="text-sm text-fg-2">
              {network.description}{" "}
              <span className="font-mono text-[13px] text-fg-3 tabular-nums">
                {formatClock(network.curve.lengthS)} · RTT {network.curve.rttMs} ms
              </span>
            </p>
          )}
        </fieldset>

        <fieldset className={cardClass}>
          <legend className="mb-1">
            <StepLabel step={3}>Player</StepLabel>
          </legend>
          <p className="font-semibold">hls.js</p>
          <div className="flex flex-wrap gap-1.5">
            {PLAYER_PRESETS.map((preset) => (
              <label
                key={preset.id}
                className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line-strong px-3 text-sm text-fg-2 hover:text-fg has-checked:border-accent has-checked:bg-accent/12 has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="player"
                  value={preset.id}
                  checked={playerId === preset.id}
                  onChange={() => {
                    setPlayerId(preset.id);
                  }}
                  className="sr-only"
                />
                {preset.name}
              </label>
            ))}
          </div>
          {player && <p className="text-sm text-fg-2">{player.description}</p>}
        </fieldset>

        <div className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-accent/35 bg-accent/6 p-5">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs tracking-[0.06em] text-accent uppercase">
              <span aria-hidden="true">4 · </span>Run
            </span>
            <p className="text-sm text-fg-2">
              Plays in real time for {formatClock(lengthS)}. Charts update live, and the result
              appears at the end.
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-[10px] bg-accent text-[17px] font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Run · {formatClock(lengthS)}
          </button>
        </div>
      </form>
    </section>
  );
}
