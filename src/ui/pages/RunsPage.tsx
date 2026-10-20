import { Link } from "@tanstack/react-router";
import { MAX_SAVED_RUNS } from "@/core/persist/runs";
import { RunsTable } from "@/ui/runs/RunsTable";
import { useNow } from "@/ui/runs/useNow";
import { useSavedRuns } from "@/ui/runs/useSavedRuns";

export function RunsPage() {
  const runs = useSavedRuns();
  const now = useNow();
  return (
    <section className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-10 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[32px] font-semibold tracking-tight">Runs</h1>
        <p className="text-sm text-fg-3">
          Saved in this browser only, the newest {MAX_SAVED_RUNS}.
        </p>
      </div>
      {runs === undefined && <p className="text-fg-2">Loading…</p>}
      {runs === "unavailable" && (
        <p className="text-warning-text">
          This browser doesn't let the lab keep runs (private browsing can block it).
        </p>
      )}
      {Array.isArray(runs) && runs.length === 0 && (
        <p className="text-fg-2">
          No runs yet.{" "}
          <Link
            to="/"
            hash="setup"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Set one up on Home
          </Link>
          .
        </p>
      )}
      {Array.isArray(runs) && runs.length > 0 && (
        <RunsTable runs={runs} caption="Runs saved in this browser, newest first" now={now} />
      )}
    </section>
  );
}
