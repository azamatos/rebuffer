import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { flushSync } from "react-dom";
import { MEASURED_SEGMENTS, UNRESOLVED, type MediaLoad } from "@/core/inspect/load";
import {
  countFindings,
  describeSummary,
  describeTracks,
  inspectionFindings,
  ladderRows,
  playlistSeverities,
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

const card = "rounded-xl border border-line bg-surface px-[18px] py-4";
const field =
  "min-h-10 rounded-[10px] border border-line-strong bg-ground px-3 font-mono text-sm text-fg placeholder:text-fg-3 aria-invalid:border-error";
const primary =
  "inline-flex min-h-10 items-center rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:bg-accent-hover";
const chip =
  "inline-flex min-h-7 items-center rounded-full border border-line bg-ground px-2.5 text-fg hover:border-fg-3 aria-[current]:border-accent aria-[current]:bg-accent/10";

/** The three ways in, as tabs. */
const SOURCES = [
  {
    id: "link",
    label: "Link",
    icon: (
      <path d="M6.5 9.5 L9.5 6.5 M7 4.5 L8.5 3 A2.5 2.5 0 0 1 13 6.5 L11.5 8 M9 11.5 L7.5 13 A2.5 2.5 0 0 1 3 9.5 L4.5 8" />
    ),
  },
  {
    id: "paste",
    label: "Paste text",
    icon: (
      <>
        <rect x="3.5" y="2.75" width="9" height="11.5" rx="1.5" />
        <path d="M6 2.75 V2 H10 V2.75 M6 7 H10 M6 9.5 H10" />
      </>
    ),
  },
  {
    id: "file",
    label: "File",
    icon: <path d="M4 1.75 H9.5 L12.5 4.75 V14.25 H4 Z M9.5 1.75 V4.75 H12.5" />,
  },
] as const;
type SourceTab = (typeof SOURCES)[number]["id"];

/** The Inspect screen: read an HLS playlist and everything it names, measure it, and explain what's wrong. */
const inspectRoute = getRouteApi("/inspect");

/** The Inspect screen as the router shows it: the playlist's link comes from the URL. */
export function InspectRoute() {
  return <InspectPage search={inspectRoute.useSearch()} />;
}

export function InspectPage({ search }: { search: InspectSearch }) {
  const navigate = useNavigate();
  const [link, setLink] = useState(search.url ?? "");
  const [linkError, setLinkError] = useState<string>();
  const [tab, setTab] = useState<SourceTab>("link");
  // The panel fades in when the visitor switches tabs, not when the screen first paints.
  const [switched, setSwitched] = useState(false);
  // A sample link or the back button changes the address: the field follows it.
  const [seenUrl, setSeenUrl] = useState(search.url);
  // The tab follows it too, so the address being inspected is on screen.
  if (seenUrl !== search.url) {
    setSeenUrl(search.url);
    if (search.url) {
      setLink(search.url);
      setTab("link");
    }
  }
  const [pasted, setPasted] = useState("");
  // The address pasted text came from (optional), so its relative links can be followed.
  const [pastedFrom, setPastedFrom] = useState("");
  const [pastedFromError, setPastedFromError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string>();
  const [textSource, setTextSource] = useState<InspectSource>();
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<SourceTab, HTMLButtonElement | null>>>({});
  // The field each panel opens with, for a tab chosen with a click (or Enter): the cursor is already there.
  const fieldRefs = useRef<Partial<Record<SourceTab, HTMLElement | null>>>({});

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

  const inspectText = (text: string, name: string | undefined, base?: string) => {
    setTextSource({ kind: "text", text, name, base });
    if (search.url) void navigate({ to: "/inspect", search: {} });
  };

  const inspectFile = async (file: File) => {
    try {
      const text = await file.text();
      setFileError(undefined);
      inspectText(text, file.name);
    } catch {
      setFileError(`This browser couldn't read ${file.name}.`);
    }
  };

  const openFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file) void inspectFile(file);
  };

  /** Shows a tab's panel; `into` also puts focus in its field. */
  const choose = (next: SourceTab, into: "field" | "tab") => {
    flushSync(() => {
      setTab(next);
      setSwitched(true);
    });
    (into === "field" ? fieldRefs.current[next] : tabRefs.current[next])?.focus();
  };

  // WAI-ARIA tabs: arrows (and Home, End) move between the tabs and show each one's panel; Enter goes into it.
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SOURCES.findIndex((source) => source.id === tab);
    const to =
      event.key === "ArrowRight"
        ? (index + 1) % SOURCES.length
        : event.key === "ArrowLeft"
          ? (index - 1 + SOURCES.length) % SOURCES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? SOURCES.length - 1
              : undefined;
    const next = to === undefined ? undefined : SOURCES[to];
    if (next) {
      event.preventDefault();
      choose(next.id, "tab");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(tab, "field");
    }
  };

  const ours = SAMPLE_STREAMS.filter((sample) => sample.host === "ours");
  const theirs = SAMPLE_STREAMS.filter((sample) => sample.host === "third-party");
  const sampleChip = (sample: (typeof SAMPLE_STREAMS)[number]) => (
    <Link
      key={sample.id}
      to="/inspect"
      search={{ url: sample.url }}
      aria-current={search.url === sample.url ? "true" : undefined}
      className={chip}
    >
      {sample.name}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 pt-6 pb-12 sm:px-8">
      <section aria-labelledby="inspect-h" className={`${card} flex flex-col gap-3`}>
        <div>
          <h1 id="inspect-h" className="text-[22px] font-semibold">
            Inspect a stream
          </h1>
          <p className="mt-0.5 text-fg-2">
            A playlist&apos;s qualities, codecs and segments, and what&apos;s wrong with it.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="What to inspect"
          className="flex gap-1 border-b border-line"
        >
          {SOURCES.map((source) => (
            <button
              key={source.id}
              ref={(element) => {
                tabRefs.current[source.id] = element;
              }}
              type="button"
              role="tab"
              id={`source-${source.id}`}
              aria-selected={tab === source.id}
              aria-controls={`source-${source.id}-panel`}
              tabIndex={tab === source.id ? 0 : -1}
              onClick={() => {
                choose(source.id, "field");
              }}
              onKeyDown={onTabKey}
              className="-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-fg-2 transition-colors duration-200 hover:text-fg aria-selected:border-accent aria-selected:font-semibold aria-selected:text-fg motion-reduce:transition-none"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="fill-none stroke-current"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {source.icon}
              </svg>
              {source.label}
            </button>
          ))}
        </div>
        <div
          key={tab}
          role="tabpanel"
          id={`source-${tab}-panel`}
          aria-labelledby={`source-${tab}`}
          className={`flex flex-col gap-2 ${switched ? "fade-in" : ""}`}
        >
          {tab === "link" && (
            <>
              <form onSubmit={inspectLink} className="flex flex-wrap items-end gap-2.5" noValidate>
                <label className="flex min-w-0 flex-[1_1_480px] flex-col gap-1 text-[13px] text-fg-2">
                  HLS link (.m3u8)
                  <input
                    ref={(element) => {
                      fieldRefs.current.link = element;
                    }}
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
                    aria-describedby={linkError ? "inspect-link-error" : "inspect-link-help"}
                    className={field}
                  />
                </label>
                <button type="submit" className={primary}>
                  Inspect
                </button>
              </form>
              {linkError ? (
                <p id="inspect-link-error" role="alert" className="text-sm text-error-text">
                  {linkError}
                </p>
              ) : (
                <p id="inspect-link-help" className="text-[13px] text-fg-3">
                  A multivariant (master) playlist shows its qualities and every playlist it names;
                  a media playlist, its segments.
                </p>
              )}
            </>
          )}
          {tab === "paste" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                let base: string | undefined;
                if (pastedFrom.trim() !== "") {
                  const result = readStreamLink(pastedFrom, window.location.protocol);
                  if (!result.ok) {
                    setPastedFromError(result.error);
                    return;
                  }
                  base = result.url;
                }
                setPastedFromError(undefined);
                inspectText(pasted, undefined, base);
              }}
              className="flex flex-col gap-2"
            >
              <label className="flex flex-col gap-1 text-sm text-fg-2">
                Paste the text of an .m3u8 playlist. A multivariant (master) playlist shows its
                qualities; a media playlist, its segments.
                <textarea
                  ref={(element) => {
                    fieldRefs.current.paste = element;
                  }}
                  rows={6}
                  spellCheck={false}
                  value={pasted}
                  onChange={(event) => {
                    setPasted(event.target.value);
                  }}
                  placeholder="#EXTM3U"
                  className="rounded-[10px] border border-line-strong bg-ground px-3 py-2.5 font-mono text-[13px] text-fg placeholder:text-fg-3"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2.5">
                <label className="flex min-w-0 flex-[1_1_480px] flex-col gap-1 text-[13px] text-fg-2">
                  Where it came from (optional): its address, so relative links can be followed
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://example.com/video/master.m3u8"
                    value={pastedFrom}
                    onChange={(event) => {
                      setPastedFrom(event.target.value);
                      setPastedFromError(undefined);
                    }}
                    aria-invalid={pastedFromError !== undefined}
                    aria-describedby={pastedFromError ? "inspect-from-error" : undefined}
                    className={field}
                  />
                </label>
                <button type="submit" className={primary}>
                  Inspect this text
                </button>
              </div>
              {pastedFromError && (
                <p id="inspect-from-error" role="alert" className="text-sm text-error-text">
                  {pastedFromError}
                </p>
              )}
            </form>
          )}
          {tab === "file" && (
            <div
              data-dragging={dragging || undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => {
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void inspectFile(file);
              }}
              className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-4 py-6 text-center transition-colors data-dragging:border-accent data-dragging:bg-accent/6"
            >
              <p className="text-fg-2">Drop an .m3u8 file here, or</p>
              <button
                ref={(element) => {
                  fieldRefs.current.file = element;
                }}
                type="button"
                onClick={() => {
                  fileRef.current?.click();
                }}
                className="inline-flex min-h-10 items-center rounded-[10px] border border-line-strong px-4 text-fg hover:border-fg-3"
              >
                Choose an .m3u8 file
              </button>
              <p className="text-[13px] text-fg-3">
                It&apos;s read in this browser and goes nowhere. Its relative links can&apos;t be
                followed.
              </p>
              {fileError && (
                <p role="alert" className="text-sm text-error-text">
                  {fileError}
                </p>
              )}
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".m3u8,.m3u,.txt,application/vnd.apple.mpegurl,audio/mpegurl,text/plain"
          className="hidden"
          onChange={openFile}
        />
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-fg-3">Or try</span>
          {ours.map(sampleChip)}
          <span className="ml-2 text-fg-3">third-party test streams, no guarantees:</span>
          {theirs.map(sampleChip)}
        </div>
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

/** "1080p (6), 720p (2), audio “English”": each label once, with how many playlists carry it. */
function labelList(list: readonly MediaLoad[]): string {
  const counts = new Map<string, number>();
  for (const media of list) counts.set(media.label, (counts.get(media.label) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n === 1 ? label : `${label} (${String(n)})`)).join(", ");
}

/**
 * The media playlists that weren't read, one sentence per reason, their names behind a disclosure: a pasted
 * multivariant playlist with relative links would otherwise list each of its playlists with the same reason.
 */
function Unread({ unread }: { unread: readonly MediaLoad[] }) {
  const reasons = new Map<string, MediaLoad[]>();
  for (const media of unread) {
    const problem = media.problem ?? "";
    reasons.set(problem, [...(reasons.get(problem) ?? []), media]);
  }
  return (
    <section aria-label="Playlists not read" className={`${card} flex flex-col gap-2.5 text-sm`}>
      {[...reasons].map(([problem, list]) => (
        <div key={problem}>
          {problem === UNRESOLVED ? (
            <p>
              <strong className="font-semibold">
                {list.length === 1
                  ? "Its media playlist wasn't"
                  : `Its ${String(list.length)} media playlists weren't`}{" "}
                read or checked:
              </strong>{" "}
              pasted text has no address to resolve their relative links against. Add the address it
              came from under Paste text, or inspect the link itself.
            </p>
          ) : (
            <p>
              <strong className="font-semibold">
                {list.length === 1 && list[0]
                  ? list[0].label
                  : `${String(list.length)} media playlists`}{" "}
                couldn&apos;t be read, so {list.length === 1 ? "it isn't" : "they aren't"} checked
                or measured:
              </strong>{" "}
              {problem}
            </p>
          )}
          {list.length > 1 && (
            <details className="mt-1 text-fg-2">
              <summary className="cursor-pointer">Which ones</summary>
              <p className="mt-1">{labelList(list)}</p>
            </details>
          )}
        </div>
      ))}
    </section>
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

const countChip = {
  error: "bg-error/10 text-error-text",
  warning: "bg-warning/10 text-warning-text",
  note: "bg-note/10 text-note-text",
} as const;

function Results({ state }: { state: Extract<InspectState, { status: "ready" }> }) {
  const { inspection, measured } = state;
  const rows = useMemo(() => ladderRows(inspection, measured), [inspection, measured]);
  const playback = usePlayback(useMemo(() => ladderRows(inspection, new Map()), [inspection]));
  const findings = useMemo(() => inspectionFindings(inspection, measured), [inspection, measured]);
  const counts = countFindings(findings);
  const unread = inspection.media.filter((media) => !media.playlist);
  const choices = useMemo<SegmentsChoice[]>(() => {
    if (inspection.top.kind === "media")
      return [
        { key: "top", label: inspection.file, playlist: inspection.top, severity: undefined },
      ];
    const severities = playlistSeverities(inspection, measured);
    return inspection.media.flatMap((media) =>
      media.playlist
        ? [
            {
              key: media.url ?? media.label,
              label: media.label,
              playlist: media.playlist,
              severity: media.url === undefined ? undefined : severities.get(media.url),
            },
          ]
        : [],
    );
  }, [inspection, measured]);

  return (
    <>
      <section aria-label="Summary" className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <p className="min-w-0 flex-[1_1_520px] text-fg-2 tabular-nums">
          {describeSummary(inspection)}
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Findings">
          {(["error", "warning", "note"] as const).map((severity) => (
            <li
              key={severity}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] ${counts[severity] === 0 ? "bg-fg/6 text-fg-2" : countChip[severity]}`}
            >
              <SeverityIcon severity={severity} size={10} />
              {counts[severity]} {severity}
              {counts[severity] === 1 ? "" : "s"}
            </li>
          ))}
          {unread.length > 0 && (
            <li className="inline-flex items-center rounded-full bg-fg/6 px-2.5 py-1 text-[13px] text-fg-2">
              {unread.length} not read
            </li>
          )}
        </ul>
        {inspection.url && (
          <Link to="/run" search={streamRunSearch(inspection.url)} className={`${primary} gap-2`}>
            <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Run this stream
          </Link>
        )}
      </section>

      {unread.length > 0 && <Unread unread={unread} />}

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
        <section
          aria-labelledby="findings-h"
          className="min-w-0 flex-[999_1_560px] rounded-xl border border-line bg-surface px-[18px] pt-3.5 pb-1.5"
        >
          <h2 id="findings-h" className="mb-1 text-lg font-semibold">
            Findings
          </h2>
          <FindingsList findings={findings} streamUrl={inspection.url} />
        </section>
        {choices.length > 0 && <SegmentsPanel key={inspection.file} choices={choices} />}
      </div>
    </>
  );
}
