import { DEFAULT_STREAM } from "@/core/samples";

/** What Home's setup picks: a stream link, a network preset and a player preset. */
export interface SetupChoice {
  streamUrl: string;
  networkId: string;
  playerId: string;
}

/** The Run screen's defaults when its link leaves a part out. */
export const DEFAULT_NETWORK_ID = "tunnel";
/** A drawn network's name when its link doesn't give one. */
export const CUSTOM_NETWORK_NAME = "Custom network";
export const DEFAULT_PLAYER_ID = "defaults";

/** The Run screen's URL search params for a setup, as strings. */
export interface RunLinkSearch {
  stream?: string;
  network?: string;
  player?: string;
  /** Player settings changed from the preset's, as `abrEwmaFastVoD:1.5`. */
  set?: string;
  /**
   * "now": start the run as soon as the screen opens; the screen drops it from the URL once it has. A word, not
   * "1": the router quotes values that read as numbers.
   */
  start?: string;
  /**
   * A saved run this one is the second half of a comparison with ("Change one thing"): when it ends, Compare opens
   * with that run as A and this one as B.
   */
  vs?: string;
}

/** The Run screen's search params for `choice`. Defaults are left out, so links stay short. */
export function runSearchFor(choice: SetupChoice, { start = false } = {}): RunLinkSearch {
  return {
    ...(choice.streamUrl === DEFAULT_STREAM.url ? {} : { stream: choice.streamUrl }),
    ...(choice.networkId === DEFAULT_NETWORK_ID ? {} : { network: choice.networkId }),
    ...(choice.playerId === DEFAULT_PLAYER_ID ? {} : { player: choice.playerId }),
    ...(start ? { start: "now" } : {}),
  };
}

export type StreamLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Reads a stream link someone typed. It must be a web address; an `http:` one only works on an `http:` page,
 * because browsers block plain-HTTP media on a secure page. `pageProtocol` is the page's own (`location.protocol`).
 */
export function readStreamLink(text: string, pageProtocol: string): StreamLinkResult {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Paste the link to an HLS playlist; it usually ends in .m3u8." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error:
        "That isn't a web address. A stream link looks like https://example.com/video/master.m3u8.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "The link must start with https://." };
  }
  if (url.protocol === "http:" && pageProtocol === "https:") {
    return {
      ok: false,
      error:
        "Browsers block http:// streams on a secure page. Use the https:// link, if the server has one.",
    };
  }
  return { ok: true, url: url.href };
}
