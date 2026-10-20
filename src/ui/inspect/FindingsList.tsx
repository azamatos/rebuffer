import { Link } from "@tanstack/react-router";
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

/** The findings, errors first, each with where it comes from and the rule it breaks. */
export function FindingsList({
  findings,
  streamUrl,
}: {
  findings: readonly SourcedFinding[];
  /** The stream's address, to offer "run it" links; undefined for pasted text. */
  streamUrl: string | undefined;
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
              {describeSources(finding)} ·{" "}
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
          </div>
        </li>
      ))}
    </ul>
  );
}
