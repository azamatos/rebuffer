import type { Finding, FindingRef, Severity } from "./types";

const RFC_8216_URL = "https://www.rfc-editor.org/rfc/rfc8216";
const APPLE_AUTHORING_URL =
  "https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices";

/** A reference to a section of RFC 8216, e.g. `rfc8216("4.3.3.1")`. */
export function rfc8216(section: string): FindingRef {
  return { spec: "RFC 8216", section, url: `${RFC_8216_URL}#section-${section}` };
}

export const APPLE_AUTHORING_SPEC: FindingRef = {
  spec: "Apple HLS authoring spec",
  url: APPLE_AUTHORING_URL,
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

/**
 * Errors first, then warnings, then notes; within each, by line (playlist-wide findings without a
 * line come first), then by id and message so the order never depends on rule order.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.id.localeCompare(b.id, "en") ||
      a.message.localeCompare(b.message, "en"),
  );
}

/** "1 variant", "3 variants". */
export function count(amount: number, noun: string): string {
  return `${amount} ${noun}${amount === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
