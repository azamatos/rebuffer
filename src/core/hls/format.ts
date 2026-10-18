import type { Resolution, VariantBase } from "./types";

/** Formats bits per second for prose: `2_800_000` → "2.8 Mbps", `128_000` → "128 kbps". */
export function formatBitrate(bitsPerSecond: number): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "0 kbps";
  if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} bps`;
  const kbps = Math.round(bitsPerSecond / 1000);
  if (kbps < 1000) return `${kbps} kbps`;
  const mbps = bitsPerSecond / 1e6;
  return `${Number(mbps.toFixed(mbps < 10 ? 1 : 0))} Mbps`;
}

/** Formats seconds as written in playlists, up to milliseconds: `6.6` → "6.6 s", `4` → "4 s". */
export function formatSeconds(seconds: number): string {
  return `${Number(seconds.toFixed(3))} s`;
}

/** Formats a whole number with thousands separators: `2800000` → "2,800,000". */
export function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The quality class people know a picture size by: 1920×800 (a 2.4:1 film) is "1080p", 1280×720
 * is "720p", 640×480 is "480p". It's the short side, widened to 16:9 for wide pictures.
 */
export function qualityLabel(resolution: Resolution): string {
  const long = Math.max(resolution.width, resolution.height);
  const short = Math.min(resolution.width, resolution.height);
  return `${Math.max(short, Math.round((long * 9) / 16))}p`;
}

/** "720p", or "the variant on line 12" when the variant has no RESOLUTION. */
export function variantName(variant: Pick<VariantBase, "line" | "resolution">): string {
  return variant.resolution === undefined
    ? `the variant on line ${variant.line}`
    : qualityLabel(variant.resolution);
}

/** "720p (2.8 Mbps)", "the 128 kbps variant on line 12", or "the variant on line 12". */
export function variantNameWithBitrate(
  variant: Pick<VariantBase, "line" | "resolution" | "bandwidth">,
): string {
  const { bandwidth, resolution, line } = variant;
  if (bandwidth === undefined) return variantName(variant);
  return resolution === undefined
    ? `the ${formatBitrate(bandwidth)} variant on line ${line}`
    : `${qualityLabel(resolution)} (${formatBitrate(bandwidth)})`;
}

/** Capitalises the first letter, for names used at the start of a sentence. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
