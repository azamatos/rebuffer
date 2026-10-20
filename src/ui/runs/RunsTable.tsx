import { Link } from "@tanstack/react-router";
import { formatDuration, formatWhen } from "@/core/format/time";
import type { RunSummary } from "@/core/persist/runs";
import { formatMbps } from "@/core/format/bitrate";

/** Saved runs as a table, newest first; each row opens its report. */
export function RunsTable({
  runs,
  caption,
  now,
}: {
  runs: readonly RunSummary[];
  caption: string;
  /** Epoch milliseconds that "Today" and "Yesterday" count from. */
  now: number;
}) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
      <table className="w-full min-w-[760px] border-collapse text-[15px] tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-[13px] text-fg-3">
            <th scope="col" className="px-5 py-3 font-medium">
              Score
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Network
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Player
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Stalls
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Avg bitrate
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              First frame
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const when = formatWhen(run.savedAt, now);
            return (
              <tr key={run.id} className="border-t border-white/6">
                <td className="px-5 py-3.5">
                  <Link
                    to="/runs/$runId"
                    params={{ runId: run.id }}
                    className="inline-flex items-center gap-2.5 font-semibold text-fg hover:text-accent"
                  >
                    <span className="inline-flex h-7 w-10 items-center justify-center rounded-md bg-white/6">
                      {Math.round(run.score)}
                    </span>
                    Report
                    <span className="sr-only">
                      : {run.networkName}, {when}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3.5">{run.networkName}</td>
                <td className="px-3 py-3.5 text-fg-2">
                  hls.js {run.playerTitle ?? run.playerName.toLowerCase()}
                </td>
                <td className="px-3 py-3.5">
                  {run.stalls.count === 0
                    ? "0"
                    : `${run.stalls.count} · ${formatDuration(run.stalls.totalS)}`}
                </td>
                <td className="px-3 py-3.5">
                  {run.averageBitrate === undefined ? "—" : formatMbps(run.averageBitrate)}
                </td>
                <td className="px-3 py-3.5">
                  {run.firstFrameS === undefined ? "—" : `${run.firstFrameS.toFixed(2)} s`}
                </td>
                <td className="px-5 py-3.5 text-fg-2">{when}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
