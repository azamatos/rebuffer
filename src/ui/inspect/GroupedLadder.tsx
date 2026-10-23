import { useId, useState } from "react";
import { formatMbps } from "@/core/format/bitrate";
import { heightName, matchesFind, type VideoGroup, type VideoRow } from "@/core/inspect/groups";
import { SeverityIcon } from "./SeverityIcon";
import type { PlaybackAnswer } from "./usePlayback";

const shades = ["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const;
const cell = "px-3 py-2.5 align-top";
const segmentsButton =
  "inline-flex min-h-8 items-center rounded-lg border border-line-strong px-2.5 text-[13px] text-fg hover:border-fg-3 aria-pressed:border-accent aria-pressed:bg-accent/10";

type Answers = ReadonlyMap<number, PlaybackAnswer | "unknown" | undefined>;

/** "17.7–18.4 Mbps", or one bitrate when its variants all declare the same. */
function declaredText(row: VideoRow): string {
  if (!row.declared) return "—";
  const low = formatMbps(row.declared.low);
  const high = formatMbps(row.declared.high);
  if (low === high) return high;
  return low.endsWith(" Mbps") && high.endsWith(" Mbps")
    ? `${low.slice(0, -5)}–${high}`
    : `${low}–${high}`;
}

/** "Dolby Digital Plus (E-AC-3), Dolby Digital (AC-3) or AAC-LC" */
function audioText(row: VideoRow): string {
  const { audio } = row;
  return audio.length <= 1
    ? (audio[0] ?? "—")
    : `${audio.slice(0, -1).join(", ")} or ${audio.at(-1) ?? ""}`;
}

function pictureText(row: VideoRow): string {
  const size = row.resolution
    ? `${String(row.resolution.width)}×${String(row.resolution.height)}`
    : undefined;
  const fps =
    row.frameRate === undefined ? undefined : `${String(Number(row.frameRate.toFixed(3)))} fps`;
  return [size, fps].filter(Boolean).join(" · ");
}

/** Whether this browser plays a group: every variant, none, or some; empty while it's asked. */
function playsHere(rows: readonly VideoRow[], answers: Answers): string {
  const said = rows.flatMap((row) => row.lines.map((line) => answers.get(line)));
  if (said.includes("unknown")) return "";
  const known = said.filter(
    (answer): answer is PlaybackAnswer => answer !== undefined && answer !== "unknown",
  );
  if (known.length === 0) return "";
  const playable = known.filter((answer) => answer.supported).length;
  if (playable === known.length) return "Plays in this browser";
  return playable === 0 ? "Won't play in this browser" : "Some play in this browser";
}

/** "11 video playlists · 19 variants · 270p–1080p · 0.41–18.4 Mbps" */
function groupFacts(group: VideoGroup): string {
  const heights = group.rows.flatMap((row) => (row.resolution ? [row.resolution.height] : []));
  const rates = group.rows.flatMap((row) =>
    row.declared ? [row.declared.low, row.declared.high] : [],
  );
  const playlists = group.rows.length;
  return [
    `${String(playlists)} video ${playlists === 1 ? "playlist" : "playlists"}`,
    group.variants !== playlists && `${String(group.variants)} variants`,
    heights.length > 0 && `${String(Math.min(...heights))}p–${String(Math.max(...heights))}p`,
    rates.length > 0 && `${formatMbps(Math.min(...rates))}–${formatMbps(Math.max(...rates))}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Peak({ row, measuring }: { row: VideoRow; measuring: boolean }) {
  if (row.measuredBps === undefined)
    return <span className="text-fg-3">{measuring ? "Measuring…" : "—"}</span>;
  return (
    <>
      {formatMbps(row.measuredBps)}
      {row.over !== undefined && (
        <span className="flex items-center gap-1.5 text-xs text-warning-text">
          <SeverityIcon severity="warning" size={12} />
          {Math.round(row.over * 100)}% over declared
        </span>
      )}
    </>
  );
}

interface RowsProps {
  group: VideoGroup;
  rows: readonly VideoRow[];
  measuring: boolean;
  selected: string | undefined;
  /** The playlists the Segments panel can show; a row's button opens it there. */
  charted: ReadonlySet<string>;
  onSegments: (url: string) => void;
}

function SegmentsButton({
  row,
  selected,
  charted,
  onSegments,
}: Omit<RowsProps, "group" | "rows" | "measuring"> & { row: VideoRow }) {
  if (row.url === undefined || !charted.has(row.url)) return null;
  const url = row.url;
  return (
    <button
      type="button"
      aria-pressed={selected === url}
      onClick={() => {
        onSegments(url);
      }}
      className={segmentsButton}
    >
      Segments<span className="sr-only"> of {row.name}</span>
    </button>
  );
}

/** One group's rows: a table on wide screens, a list on phones. */
function Rows({ group, rows, measuring, ...segments }: RowsProps) {
  return (
    <>
      <div className="overflow-x-auto max-sm:hidden">
        <table className="w-full min-w-[760px] border-collapse text-left text-[15px] tabular-nums">
          <caption className="sr-only">
            {group.codec} · {group.range}
          </caption>
          <thead>
            <tr className="text-[13px] text-fg-3">
              {["Picture", "Video playlist", "Audio pairings", "Declared", "Measured peak"].map(
                (heading, i) => (
                  <th
                    key={heading}
                    scope="col"
                    className={`py-2 font-medium ${i === 0 ? "pr-3" : "px-3"}`}
                  >
                    {heading}
                  </th>
                ),
              )}
              <th scope="col">
                <span className="sr-only">Segments</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.url ?? row.path}
                className={`border-t border-fg/6 ${row.over ? "bg-warning/6" : ""}`}
              >
                <th scope="row" className="py-2.5 pr-3 align-top font-semibold">
                  <span className="inline-flex items-center gap-2.5">
                    <svg width="10" height="20" aria-hidden="true">
                      <rect width="10" height="20" rx="2" className={shades[row.shade]} />
                    </svg>
                    {heightName(row.resolution) ?? "—"}
                  </span>
                  <span className="block text-xs font-normal text-fg-3">{pictureText(row)}</span>
                </th>
                <td className={cell}>
                  <span className="font-mono text-[13px] break-all">{row.name}</span>
                  <span className="block text-xs text-fg-3">{row.video?.label ?? "—"}</span>
                </td>
                <td className={`${cell} text-sm text-fg-2`}>{audioText(row)}</td>
                <td className={cell}>{declaredText(row)}</td>
                <td className={cell}>
                  <Peak row={row} measuring={measuring} />
                </td>
                <td className="py-2.5 pl-3 text-right align-top">
                  <SegmentsButton row={row} {...segments} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={`${group.codec} · ${group.range}`} className="sm:hidden">
        {rows.map((row) => (
          <li
            key={row.url ?? row.path}
            className="flex flex-col gap-1.5 border-t border-fg/6 py-3 tabular-nums"
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{heightName(row.resolution) ?? "—"}</span>
              <span className="text-xs text-fg-3">{pictureText(row)}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-auto font-mono text-xs break-all text-fg-2">
                {row.name} · {row.video?.label ?? "—"}
              </span>
              <SegmentsButton row={row} {...segments} />
            </span>
            <span className="text-sm text-fg-2">
              <span className="text-fg">{declaredText(row)}</span> declared · peak{" "}
              <Peak row={row} measuring={measuring} /> · {audioText(row)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The quality ladder, grouped by video codec and range, one row per video playlist with its audio pairings. A big
 * stream's groups fold, H.264 open (every browser plays it), and "Find a rendition" searches them all.
 */
export function GroupedLadder({
  groups,
  playback,
  measuring,
  tracks,
  ...segments
}: Omit<RowsProps, "group" | "rows"> & {
  groups: readonly VideoGroup[];
  playback: Answers;
  /** The renditions and I-frame playlists in words, under the ladder. */
  tracks: readonly string[];
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(groups[0] ? [groups[0].key] : []),
  );
  const [query, setQuery] = useState("");
  const findId = useId();
  const several = groups.length > 1;
  const playlists = groups.reduce((total, group) => total + group.rows.length, 0);
  const variants = groups.reduce((total, group) => total + group.variants, 0);
  const shown = groups
    .map((group) => ({
      group,
      rows: group.rows.filter((row) => matchesFind(group, row, query)),
    }))
    .filter(({ rows }) => rows.length > 0 || query.trim() === "");
  const matches = shown.reduce((total, { rows }) => total + rows.length, 0);

  return (
    <section
      aria-labelledby="ladder-h"
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-[18px] py-4"
    >
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="min-w-0 flex-[1_1_360px]">
          <h2 id="ladder-h" className="text-lg font-semibold">
            Quality ladder{" "}
            <span className="text-sm font-normal text-fg-3">
              {variants === playlists
                ? `· ${String(variants)} ${variants === 1 ? "quality" : "qualities"}`
                : `· ${String(variants)} variants on ${String(playlists)} video playlists`}
            </span>
          </h2>
          <p className="text-[13px] text-fg-2">
            {variants === playlists
              ? "Declared: the bandwidth the multivariant playlist says each quality needs."
              : "One row per video playlist, with the audio its variants pair it with. Declared: the bandwidth they say they need."}{" "}
            Measured peak: the busiest of the first segments this browser read, audio included.
          </p>
        </div>
        {several && (
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 sm:max-w-[340px]">
            <label htmlFor={findId} className="text-[13px] text-fg-2">
              Find a rendition
            </label>
            <input
              id={findId}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="1080p, hevc, 18 Mbps…"
              className="min-h-10 rounded-[10px] border border-line-strong bg-ground px-3 text-sm text-fg placeholder:text-fg-3"
            />
          </div>
        )}
      </div>
      {several && (
        <p aria-live="polite" className="text-[13px] text-fg-2 empty:hidden">
          {query.trim() === ""
            ? ""
            : matches > 0
              ? `${String(matches)} of ${String(playlists)} video playlists match “${query.trim()}”.`
              : `Nothing matches “${query.trim()}”. Try a height like 720p, a playlist's name or a bitrate.`}
        </p>
      )}
      <div className="flex flex-col">
        {shown.map(({ group, rows }) => {
          const expanded = !several || query.trim() !== "" || open.has(group.key);
          return (
            <div key={group.key} className={several ? "border-t border-line" : ""}>
              {several && (
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => {
                      setOpen((previous) => {
                        const next = new Set(previous);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      });
                    }}
                    className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-1 py-2 text-left hover:bg-fg/4"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                      className="flex-none fill-none stroke-current text-fg-2"
                      strokeWidth="1.5"
                    >
                      <path d={expanded ? "M2.5 4.5 L6 8 L9.5 4.5" : "M4.5 2.5 L8 6 L4.5 9.5"} />
                    </svg>
                    <span className="font-semibold">{group.codec}</span>
                    <span className="rounded-md bg-fg/6 px-2 py-0.5 text-xs text-fg-2">
                      {group.range}
                    </span>
                    <span className="min-w-0 flex-[1_1_300px] text-[13px] text-fg-2 tabular-nums">
                      {groupFacts(group)}
                    </span>
                    <span className="text-[13px] text-fg-2">{playsHere(group.rows, playback)}</span>
                  </button>
                </h3>
              )}
              {expanded && <Rows group={group} rows={rows} measuring={measuring} {...segments} />}
            </div>
          );
        })}
      </div>
      {!several && groups[0] && (
        <p className="text-[13px] text-fg-2">{playsHere(groups[0].rows, playback)}</p>
      )}
      {tracks.length > 6 ? (
        <details className="text-sm text-fg-2">
          <summary className="cursor-pointer">All {tracks.length} tracks</summary>
          <p className="mt-1">{tracks.join(" · ")}</p>
        </details>
      ) : (
        <p className="text-sm text-fg-2">Tracks: {tracks.join(" · ")}</p>
      )}
    </section>
  );
}
