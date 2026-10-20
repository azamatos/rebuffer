import { useEffect, useState } from "react";
import { playbackQuery, type LadderRow, type PlaybackQuery } from "@/core/inspect/model";

export type PlaybackAnswer = { supported: boolean; smooth: boolean };

/** Asks this browser whether it can decode a variant: Media Capabilities, or MediaSource where that's missing. */
async function ask(query: PlaybackQuery): Promise<PlaybackAnswer> {
  const capabilities = typeof navigator === "undefined" ? undefined : navigator.mediaCapabilities;
  if (capabilities?.decodingInfo) {
    try {
      const info = await capabilities.decodingInfo({
        type: "media-source",
        ...(query.video ? { video: query.video } : {}),
        ...(query.audio ? { audio: query.audio } : {}),
      });
      return { supported: info.supported, smooth: info.smooth };
    } catch {
      // A configuration the browser won't even consider: fall through to the plain check.
    }
  }
  const supported = typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(query.type);
  return { supported, smooth: supported };
}

/**
 * What this browser says about each ladder row, by its line: an answer, "unknown" while it's asked, or undefined
 * when the row declares no codecs to ask about.
 */
export function usePlayback(
  rows: readonly LadderRow[],
): ReadonlyMap<number, PlaybackAnswer | "unknown" | undefined> {
  const [answers, setAnswers] = useState<ReadonlyMap<number, PlaybackAnswer>>(new Map());
  useEffect(() => {
    let current = true;
    void Promise.all(
      rows.map(async (row) => {
        const query = playbackQuery(row);
        return [row.line, query ? await ask(query) : undefined] as const;
      }),
    ).then((entries) => {
      if (!current) return;
      const found = new Map<number, PlaybackAnswer>();
      for (const [line, answer] of entries) if (answer) found.set(line, answer);
      setAnswers(found);
    });
    return () => {
      current = false;
    };
  }, [rows]);
  return new Map(
    rows.map((row) => [
      row.line,
      playbackQuery(row) === undefined ? undefined : (answers.get(row.line) ?? "unknown"),
    ]),
  );
}
