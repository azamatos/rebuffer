import type { LadderRow } from "@/core/inspect/model";
import { describePlayback } from "@/core/inspect/model";
import { formatBitrate } from "@/core/hls";
import { SeverityIcon } from "./SeverityIcon";
import type { PlaybackAnswer } from "./usePlayback";

const shades = ["fill-q0", "fill-q1", "fill-q2", "fill-q3", "fill-q4"] as const;
const cell = "px-3 py-3 align-top";

const mbps = (bps: number | undefined) => (bps === undefined ? "—" : formatBitrate(bps));

/** The quality ladder, highest first: declared and measured bit rates, picture, codecs, and what this browser says. */
export function LadderTable({
  rows,
  playback,
  measuring,
}: {
  rows: readonly LadderRow[];
  playback: ReadonlyMap<number, PlaybackAnswer | "unknown" | undefined>;
  measuring: boolean;
}) {
  return (
    <div role="region" aria-label="Quality ladder table" tabIndex={0} className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-left text-[15px] tabular-nums">
        <thead>
          <tr className="text-[13px] text-fg-3">
            {[
              "Quality",
              "Declared",
              "Average",
              "Measured peak",
              "Picture",
              "Video",
              "Audio",
              "This browser",
            ].map((heading, i) => (
              <th
                key={heading}
                scope="col"
                className={`py-2.5 font-medium ${i === 0 ? "pr-3" : "px-3"}`}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.line}
              className={`border-t border-white/6 ${row.over ? "bg-warning/6" : ""}`}
            >
              <th scope="row" className="py-3 pr-3 align-top font-semibold">
                <span className="inline-flex items-center gap-2.5">
                  <svg width="10" height="20" aria-hidden="true">
                    <rect
                      width="10"
                      height="20"
                      rx="2"
                      className={shades[row.shade] ?? "fill-q0"}
                    />
                  </svg>
                  {row.name}
                </span>
              </th>
              <td className={cell}>{mbps(row.bandwidth)}</td>
              <td className={`${cell} text-fg-2`}>{mbps(row.averageBandwidth)}</td>
              <td className={cell}>
                {row.over ? (
                  <span className="font-semibold text-warning-text">
                    <span className="inline-flex items-center gap-1.5">
                      <SeverityIcon severity="warning" />
                      {mbps(row.measuredBps)}
                    </span>
                    <span className="block text-xs font-normal">
                      {Math.round(row.over * 100)}% over declared
                    </span>
                  </span>
                ) : row.measuredBps === undefined ? (
                  <span className="text-fg-3">{measuring ? "Measuring…" : "—"}</span>
                ) : (
                  mbps(row.measuredBps)
                )}
                {row.withAudio && <span className="block text-xs text-fg-3">with its audio</span>}
              </td>
              <td className={cell}>
                {row.resolution
                  ? `${String(row.resolution.width)}×${String(row.resolution.height)}`
                  : "—"}
                {row.frameRate !== undefined &&
                  ` · ${String(Number(row.frameRate.toFixed(3)))} fps`}
              </td>
              {row.codecs === undefined ? (
                <td className={`${cell} text-warning-text`} colSpan={2}>
                  <span className="inline-flex items-center gap-1.5">
                    <SeverityIcon severity="warning" />
                    No CODECS attribute
                  </span>
                </td>
              ) : (
                <>
                  <td className={cell}>
                    {row.video?.label ?? "—"}
                    {row.video && (
                      <span className="block font-mono text-xs text-fg-3">{row.video.codec}</span>
                    )}
                  </td>
                  <td className={cell}>
                    {row.audio?.label ?? "—"}
                    {row.audio && (
                      <span className="block font-mono text-xs text-fg-3">{row.audio.codec}</span>
                    )}
                  </td>
                </>
              )}
              <td
                className={`${cell} pr-0 ${playback.get(row.line) === undefined ? "text-fg-2" : ""}`}
              >
                {describePlayback(playback.get(row.line))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
