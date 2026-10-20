import type { Severity } from "@/core/hls";

/** Severity in words, and the text colour that goes with it (always with its icon, never colour alone). */
export const severityWord: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  note: "Note",
};

export const severityText: Record<Severity, string> = {
  error: "text-error-text",
  warning: "text-warning-text",
  note: "text-note-text",
};
