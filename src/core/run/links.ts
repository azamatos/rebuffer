import type { NetworkCurve } from "@/core/netsim/curve-math";
import { curveToParam } from "@/core/netsim/url";
import { CUSTOM_NETWORK_NAME, DEFAULT_NETWORK_ID } from "./setup";

/** A network in the Run screen's link: a preset or recorded trace by id, or a drawn one as its curve and name. */
export interface NetworkSearch {
  network?: string;
  curve?: string;
  name?: string;
}

/** Longest network name a link carries. */
export const MAX_NETWORK_NAME = 60;

/**
 * The Run screen's network params: by id (the default network left out, so links stay short), or the curve itself
 * with its name, so a drawn network keeps it in the run. Kept out of setup.ts: the curve format brings zod, and Home
 * loads setup.ts.
 */
export function networkSearch(network: {
  id: string | undefined;
  name: string;
  curve: NetworkCurve;
}): NetworkSearch {
  if (network.id !== undefined)
    return network.id === DEFAULT_NETWORK_ID ? {} : { network: network.id };
  const name = network.name.trim().slice(0, MAX_NETWORK_NAME);
  return {
    curve: curveToParam(network.curve),
    ...(name === "" || name === CUSTOM_NETWORK_NAME ? {} : { name }),
  };
}
