import { Link } from "@tanstack/react-router";
import { RunsTable } from "@/ui/runs/RunsTable";
import { useNow } from "@/ui/runs/useNow";
import { useSavedRuns } from "@/ui/runs/useSavedRuns";

const SHOWN = 5;

/** The newest runs saved in this browser; nothing at all until there's one. */
export function RecentRuns() {
  const runs = useSavedRuns();
  const now = useNow();
  if (!Array.isArray(runs) || runs.length === 0) return null;
  return (
    <section aria-labelledby="recent-h" className="mx-auto max-w-[1280px] px-4 pt-2 pb-12 sm:px-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="recent-h" className="text-[22px] font-semibold">
          Recent runs
        </h2>
        <p className="text-sm text-fg-3">
          Saved in this browser only
          {runs.length > SHOWN && (
            <>
              {" · "}
              <Link
                to="/runs"
                className="text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                All {runs.length} runs
              </Link>
            </>
          )}
        </p>
      </div>
      <RunsTable runs={runs.slice(0, SHOWN)} caption="Recent runs, newest first" now={now} />
    </section>
  );
}
