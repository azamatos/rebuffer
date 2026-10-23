import { useEffect, useState } from "react";
import { savedRuns, type SavedRun } from "@/core/persist/runs";

export type LoadedRun =
  { status: "loading" } | { status: "ready"; run: SavedRun } | { status: "missing" };

/** A saved run by id, loaded from this browser; undefined when no id is given. */
export function useSavedRun(id: string | undefined): LoadedRun | undefined {
  const [loaded, setLoaded] = useState<{ id: string; value: LoadedRun }>();
  useEffect(() => {
    if (!id) return;
    let current = true;
    savedRuns()
      .get(id)
      .then(
        (run) => {
          if (current)
            setLoaded({ id, value: run ? { status: "ready", run } : { status: "missing" } });
        },
        () => {
          if (current) setLoaded({ id, value: { status: "missing" } });
        },
      );
    return () => {
      current = false;
    };
  }, [id]);
  if (!id) return undefined;
  return loaded?.id === id ? loaded.value : { status: "loading" };
}
