import { useEffect, useState } from "react";
import type { ParseIssue } from "@/core/hls";
import { loadInspection, measureMedia, type Inspection, type Measured } from "@/core/inspect/load";
import { describeReadError, fetchReader } from "@/core/inspect/read";

/** What to inspect: a link, or text pasted or read from a file. */
export type InspectSource =
  { kind: "url"; url: string } | { kind: "text"; text: string; name: string | undefined };

export type InspectState =
  | { status: "idle" }
  | { status: "reading"; message: string }
  | { status: "failed"; message: string; issues: ParseIssue[] }
  | {
      status: "ready";
      inspection: Inspection;
      measured: ReadonlyMap<string, Measured>;
      /** Media playlists still being measured. */
      measuring: number;
    };

/**
 * Reads a stream for the Inspect screen: the playlist, the media playlists it names, then the first segments of each
 * video and audio playlist, whose measurements arrive one playlist at a time.
 */
export function useInspection(source: InspectSource | undefined): InspectState {
  const [state, setState] = useState<InspectState>({ status: "idle" });
  useEffect(() => {
    if (!source) return;
    let current = true;
    const reader = fetchReader();
    const set = (next: InspectState | ((previous: InspectState) => InspectState)) => {
      if (current) setState(next);
    };
    void (async () => {
      set({ status: "reading", message: "Reading the playlist…" });
      let text: string;
      try {
        text = source.kind === "url" ? await reader.text(source.url) : source.text;
      } catch (error) {
        set({ status: "failed", message: describeReadError(error), issues: [] });
        return;
      }
      const result = await loadInspection(
        source.kind === "url" ? { url: source.url, text } : { text, name: source.name },
        reader,
      );
      if (!result.ok) {
        set({
          status: "failed",
          message: "This isn't an HLS playlist the inspector can read.",
          issues: result.issues,
        });
        return;
      }
      const { inspection } = result;
      const toMeasure =
        inspection.top.kind === "media"
          ? [{ url: inspection.url, playlist: inspection.top }]
          : inspection.media.filter((media) => media.kind !== "subtitles" && media.playlist);
      set({ status: "ready", inspection, measured: new Map(), measuring: toMeasure.length });
      await Promise.all(
        toMeasure.map(async ({ url, playlist }) => {
          if (!playlist || url === undefined) return;
          const measured = await measureMedia(playlist, reader);
          set((previous) =>
            previous.status === "ready" && previous.inspection === inspection
              ? {
                  ...previous,
                  measured: new Map(previous.measured).set(url, measured),
                  measuring: previous.measuring - 1,
                }
              : previous,
          );
        }),
      );
      set((previous) => (previous.status === "ready" ? { ...previous, measuring: 0 } : previous));
    })();
    return () => {
      current = false;
    };
  }, [source]);
  return state;
}
