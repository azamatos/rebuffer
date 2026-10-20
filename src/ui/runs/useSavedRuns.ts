import { useEffect, useState } from "react";
import { savedRuns, type RunSummary } from "@/core/persist/runs";

/** The runs saved in this browser, newest first: undefined while loading, "unavailable" if storage is blocked. */
export function useSavedRuns(): RunSummary[] | "unavailable" | undefined {
  const [runs, setRuns] = useState<RunSummary[] | "unavailable">();
  useEffect(() => {
    let current = true;
    savedRuns()
      .list()
      .then(
        (list) => {
          if (current) setRuns(list);
        },
        () => {
          if (current) setRuns("unavailable");
        },
      );
    return () => {
      current = false;
    };
  }, []);
  return runs;
}
