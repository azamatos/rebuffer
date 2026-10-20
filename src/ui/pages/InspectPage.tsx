import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent, type SubmitEvent } from "react";
import { MEASURED_SEGMENTS } from "@/core/inspect/load";
import {
  countFindings,
  describeSummary,
  describeTracks,
  inspectionFindings,
  ladderRows,
  streamRunSearch,
} from "@/core/inspect/model";
import { readStreamLink } from "@/core/run/setup";
import { SAMPLE_STREAMS } from "@/core/samples";
import { FindingsList } from "@/ui/inspect/FindingsList";
import { LadderTable } from "@/ui/inspect/LadderTable";
import { SegmentsPanel, type SegmentsChoice } from "@/ui/inspect/SegmentsPanel";
import { SeverityIcon } from "@/ui/inspect/SeverityIcon";
import { useInspection, type InspectSource, type InspectState } from "@/ui/inspect/useInspection";
import { usePlayback } from "@/ui/inspect/usePlayback";

export interface InspectSearch {
  /** The playlist to inspect. */
  url?: string;
}

const card = "rounded-2xl border border-line bg-surface px-5 py-4.5";
const secondary =
  "inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4 text-fg hover:border-fg-3";
const textLink = "text-accent underline underline-offset-2 hover:text-accent-hover";

/** The Inspect screen: read an HLS playlist and everything it names, measure it, and explain what's wrong. */
export function InspectPage({ search }: { search: InspectSearch }) {
  const navigate = useNavigate();
  const [link, setLink] = useState(search.url ?? "");
  const [linkError, setLinkError] = useState<string>();
  // A sample link or the back button changes the address: the field follows it.
  const [seenUrl, setSeenUrl] = useState(search.url);
  if (seenUrl !== search.url) {
    setSeenUrl(search.url);
    if (search.url) setLink(search.url);
  }
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [textSource, setTextSource] = useState<InspectSource>();
  const fileRef = useRef<HTMLInputElement>(null);

  const urlSource = useMemo<InspectSource | undefined>(
    () => (search.url ? { kind: "url", url: search.url } : undefined),
    [search.url],
  );
  const source = urlSource ?? textSource;
  const state = useInspection(source);

  const inspectLink = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = readStreamLink(link, window.location.protocol);
    if (!result.ok) {
      setLinkError(result.error);
      return;
    }
    setLinkError(undefined);
    setTextSource(undefined);
    void navigate({ to: "/inspect", search: { url: result.url } });
  };

  const inspectText = (text: string, name: string | undefined) => {
    setTextSource({ kind: "text", text, name });
    if (search.url) void navigate({ to: "/inspect", search: {} });
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) inspectText(await file.text(), file.name);
  };

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 py-7 sm:px-8">
      <section aria-labelledby="inspect-h" className={`${card} flex flex-col gap-3`}>
        <h1 id="inspect-h" className="text-[22px] font-semibold">
          Inspect a stream
        </h1>
        <form onSubmit={inspectLink} className="flex flex-wrap items-end gap-2.5" noValidate>
          <label className="flex min-w-0 flex-[1_1_480px] flex-col gap-1 text-[13px] text-fg-2">
            HLS link (.m3u8)
            <input
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
              aria-describedby={linkError ? "inspect-link-error" : undefined}
              className="min-h-11 rounded-[10px] border border-line-strong bg-ground px-3 font-mono text-sm text-fg placeholder:text-fg-3 aria-invalid:border-error"
            />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-[10px] bg-accent px-5 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            Inspect
          </button>
          <button
            type="button"
            aria-expanded={pasteOpen}
            aria-controls="paste-form"
            onClick={() => {
              setPasteOpen((open) => !open);
            }}
            className={secondary}
          >
            Paste playlist text
          </button>
          <button
            type="button"
            onClick={() => {
              fileRef.current?.click();
            }}
            className={secondary}
          >
            Open file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".m3u8,.m3u,.txt,application/vnd.apple.mpegurl,audio/mpegurl,text/plain"
            className="hidden"
            onChange={(event) => void openFile(event)}
          />
        </form>
        {linkError && (
          <p id="inspect-link-error" role="alert" className="text-sm text-error-text">
            {linkError}
          </p>
        )}
        {pasteOpen && (
          <form
            id="paste-form"
            onSubmit={(event) => {
              event.preventDefault();
              inspectText(pasted, undefined);
            }}
            className="flex flex-col gap-2"
          >
            <label className="flex flex-col gap-1 text-[13px] text-fg-2">
              Playlist text
              <textarea
                rows={8}
                spellCheck={false}
                value={pasted}
                onChange={(event) => {
                  setPasted(event.target.value);
                }}
                placeholder="#EXTM3U"
                className="rounded-[10px] border border-line-strong bg-ground p-3 font-mono text-sm text-fg placeholder:text-fg-3"
              />
            </label>
            <button type="submit" className={`${secondary} self-start`}>
              Inspect the text
            </button>
          </form>
        )}
        <p className="text-sm text-fg-2">
          Samples:{" "}
          {SAMPLE_STREAMS.filter((sample) => sample.host === "ours").map((sample, i) => (
            <span key={sample.id}>
              {i > 0 && " · "}
              <Link to="/inspect" search={{ url: sample.url }} className={textLink}>
                {sample.name}
              </Link>
            </span>
          ))}{" "}
          · third-party test streams, no guarantees:{" "}
          {SAMPLE_STREAMS.filter((sample) => sample.host === "third-party").map((sample, i) => (
            <span key={sample.id}>
              {i > 0 && ", "}
              <Link to="/inspect" search={{ url: sample.url }} className={textLink}>
                {sample.name}
              </Link>
            </span>
          ))}
        </p>
      </section>

      <p role="status" className="text-sm text-fg-2 empty:hidden">
        {statusText(state)}
      </p>

      {state.status === "failed" && (
        <section aria-label="Problem" className={card}>
          <p className="text-error-text">{state.message}</p>
          {state.issues.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-fg-2">
              {state.issues.map((issue) => (
                <li key={`${String(issue.line)}-${issue.message}`}>
                  Line {issue.line}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {state.status === "ready" && <Results state={state} />}
    </div>
  );
}

function statusText(state: InspectState): string {
  if (state.status === "reading") return state.message;
  if (state.status !== "ready") return "";
  if (state.measuring > 0) {
    return `Measuring the first ${String(MEASURED_SEGMENTS)} segments of each playlist: ${String(state.measuring)} to go…`;
  }
  return state.measured.size > 0
    ? `Measured the first ${String(MEASURED_SEGMENTS)} segments of each playlist.`
    : "";
}

function Results({ state }: { state: Extract<InspectState, { status: "ready" }> }) {
  const { inspection, measured } = state;
  const rows = useMemo(() => ladderRows(inspection, measured), [inspection, measured]);
  const playback = usePlayback(useMemo(() => ladderRows(inspection, new Map()), [inspection]));
  const findings = useMemo(() => inspectionFindings(inspection, measured), [inspection, measured]);
  const counts = countFindings(findings);
  const unread = inspection.media.filter((media) => !media.playlist);
  const choices: SegmentsChoice[] =
    inspection.top.kind === "media"
      ? [{ key: "top", label: inspection.file, playlist: inspection.top }]
      : inspection.media.flatMap((media) =>
          media.playlist
            ? [{ key: media.url ?? media.label, label: media.label, playlist: media.playlist }]
            : [],
        );

  return (
    <>
      <section aria-label="Summary" className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
        <p className="min-w-0 flex-[1_1_520px] text-fg-2 tabular-nums">
          {describeSummary(inspection)}
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Findings">
          {(["error", "warning", "note"] as const).map((severity) => (
            <li
              key={severity}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-sm"
            >
              <SeverityIcon severity={severity} />
              {counts[severity]} {severity}
              {counts[severity] === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
        {inspection.url && (
          <Link
            to="/run"
            search={streamRunSearch(inspection.url)}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4.5 font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Run this stream
          </Link>
        )}
      </section>

      {unread.length > 0 && (
        <section aria-label="Playlists not read" className={`${card} text-sm`}>
          <p className="mb-1.5 font-semibold">
            {unread.length === 1
              ? "One media playlist"
              : `${String(unread.length)} media playlists`}{" "}
            couldn't be read, so {unread.length === 1 ? "it isn't" : "they aren't"} checked or
            measured:
          </p>
          <ul className="list-disc pl-5 text-fg-2">
            {unread.map((media) => (
              <li key={media.url ?? media.label}>
                {media.label}: {media.problem}
              </li>
            ))}
          </ul>
        </section>
      )}

      {inspection.top.kind === "multivariant" && (
        <section aria-labelledby="ladder-h" className={card}>
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ladder-h" className="text-lg font-semibold">
              Quality ladder
            </h2>
            <p className="text-[13px] text-fg-3">
              Measured: the first {MEASURED_SEGMENTS} segments of each quality, sizes read by this
              browser
            </p>
          </div>
          <LadderTable rows={rows} playback={playback} measuring={state.measuring > 0} />
          <p className="mt-3 text-sm text-fg-2">
            Tracks: {describeTracks(inspection.top).join(" · ")}
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <section aria-labelledby="findings-h" className={`${card} min-w-0 flex-[999_1_620px]`}>
          <h2 id="findings-h" className="mb-3 text-lg font-semibold">
            Findings
          </h2>
          <FindingsList findings={findings} streamUrl={inspection.url} />
        </section>
        {choices.length > 0 && <SegmentsPanel key={inspection.file} choices={choices} />}
      </div>
    </>
  );
}
