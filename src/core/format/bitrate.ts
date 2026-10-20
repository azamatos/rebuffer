/** A bitrate for people: "400 kbps", "2.8 Mbps", "6 Mbps", "50 Mbps". */
export function formatMbps(bitsPerSecond: number): string {
  const mbps = bitsPerSecond / 1e6;
  return mbps >= 10
    ? `${mbps.toFixed(0)} Mbps`
    : mbps >= 1
      ? `${Number(mbps.toFixed(1))} Mbps`
      : `${Math.round(bitsPerSecond / 1000)} kbps`;
}
