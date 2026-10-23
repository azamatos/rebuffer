import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { declaredRunSearch, declaredRunSpeed, type SourcedFinding } from "@/core/inspect/model";
import { severityText, severityWord } from "./severity";
import { SeverityIcon } from "./SeverityIcon";

/** "720p/index.m3u8, line 28", or "426/index.m3u8, 640/index.m3u8 and 1280/index.m3u8, line 28". */
function describeSources(finding: SourcedFinding): string {
  const lines = new Set(finding.sources.map((source) => source.line));
  const files = finding.sources.map((source) => source.file);
  const join = (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
  if (lines.size === 1) {
    const [line] = lines;
    return line === undefined ? join(files) : `${join(files)}, line ${String(line)}`;
  }
  return join(
    finding.sources.map((source) =>
      source.line === undefined ? source.file : `${source.file} line ${String(source.line)}`,
    ),
  );
}

const KINDS = {
  variant: ["quality", "qualities"],
  video: ["video rendition", "video renditions"],
  audio: ["audio playlist", "audio playlists"],
  subtitles: ["subtitle playlist", "subtitle playlists"],
} as const;

/** A few names, then how many more: "English, Italiano (SDH), Français and 10 more". */
function shortList(names: readonly string[]): string {
  const counted = new Map<string, number>();
  for (const name of names) counted.set(name, (counted.get(name) ?? 0) + 1);
  const unique = [...counted].map(([name, n]) => (n === 1 ? name : `${name} (${String(n)})`));
  if (unique.length <= 4) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} and ${String(unique.length - 3)} more`;
}

/**
 * Many sources named by what they are: "13 subtitle playlists: English (Forced), Italiano (SDH), … and 10 more,
 * line 2". The file names, long and alike on big streams, go behind a disclosure.
 */
function describeKinds(finding: SourcedFinding): string {
  const byKind = new Map<keyof typeof KINDS, string[]>();
  const files: string[] = [];
  for (const source of finding.sources) {
    if (source.kind && source.name)
      byKind.set(source.kind, [...(byKind.get(source.kind) ?? []), source.name]);
    else files.push(source.file);
  }
  const parts = [
    ...files,
    ...[...byKind].map(([kind, names]) => {
      const [one, many] = KINDS[kind];
      return `${String(names.length)} ${names.length === 1 ? one : many}: ${shortList(names)}`;
    }),
  ];
  const lines = new Set(finding.sources.map((source) => source.line));
  const [line] = lines;
  return lines.size === 1 && line !== undefined
    ? `${parts.join("; ")}, line ${String(line)}`
    : parts.join("; ");
}

/** Buttons that open a finding's playlists in the Segments panel: four, then the rest on request. */
function SeeSegments({
  urls,
  charted,
  onSegments,
}: {
  urls: string[];
  charted: ReadonlyMap<string, string>;
  onSegments: (url: string) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? urls : urls.slice(0, 4);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-fg-3">See segments:</span>
      {shown.map((url) => (
        <button
          key={url}
          type="button"
          onClick={() => {
            onSegments(url);
          }}
          className="inline-flex min-h-8 items-center rounded-lg border border-line-strong px-2 font-mono text-xs text-fg hover:border-fg-3"
        >
          {charted.get(url)}
        </button>
      ))}
      {urls.length > 4 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => {
            setAll((open) => !open);
          }}
          className="inline-flex min-h-8 items-center px-2 text-[13px] text-accent hover:text-accent-hover"
        >
          {all ? "Show fewer" : `+${String(urls.length - 4)} more`}
        </button>
      )}
    </div>
  );
}

/** The findings, errors first, each with where it comes from and the rule it breaks. */
export function FindingsList({
  findings,
  streamUrl,
  charted,
  onSegments,
}: {
  findings: readonly SourcedFinding[];
  /** The stream's address, to offer "run it" links; undefined for pasted text. */
  streamUrl: string | undefined;
  /** The playlists the Segments panel can show, by address, with their short names. */
  charted: ReadonlyMap<string, string>;
  onSegments: (url: string) => void;
}) {
  if (findings.length === 0) {
    return (
      <p className="text-fg-2">
        No findings: the playlists follow every rule the inspector checks.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {findings.map((finding) => (
        <li
          key={`${finding.id}-${finding.message}`}
          className="flex gap-3.5 border-t border-fg/6 py-3.5"
        >
          <span className="mt-1">
            <SeverityIcon severity={finding.severity} size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">
              <span className={severityText[finding.severity]}>
                {severityWord[finding.severity]} ·
              </span>{" "}
              {finding.message}
            </p>
            <p className="mt-1 text-fg-2">{finding.detail}</p>
            <p className="mt-1.5 font-mono text-xs break-words text-fg-3">
              {finding.sources.length > 3 ? describeKinds(finding) : describeSources(finding)} ·{" "}
              <a
                href={finding.ref.url}
                className="text-fg-2 underline underline-offset-2 hover:text-fg"
              >
                {finding.ref.spec}
                {finding.ref.section && ` §${finding.ref.section}`}
              </a>
              {streamUrl && finding.declaredBps !== undefined && (
                <>
                  {" · "}
                  <Link
                    to="/run"
                    search={declaredRunSearch(streamUrl, finding.declaredBps)}
                    className="text-accent underline underline-offset-2 hover:text-accent-hover"
                  >
                    Run it on a {declaredRunSpeed(finding.declaredBps)} network
                  </Link>
                </>
              )}
            </p>
            {finding.sources.length > 3 && (
              <details className="mt-1 font-mono text-xs text-fg-3">
                <summary className="cursor-pointer">The {finding.sources.length} files</summary>
                <p className="mt-1 break-words">{describeSources(finding)}</p>
              </details>
            )}
            {(() => {
              const urls = [
                ...new Set(
                  finding.sources.flatMap((source) =>
                    source.url !== undefined && charted.has(source.url) ? [source.url] : [],
                  ),
                ),
              ];
              return urls.length > 0 ? (
                <SeeSegments urls={urls} charted={charted} onSegments={onSegments} />
              ) : null;
            })()}
          </div>
        </li>
      ))}
    </ul>
  );
}
