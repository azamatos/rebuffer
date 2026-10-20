import type { Severity } from "@/core/hls";

/** Severity as a shape as well as a colour: an octagon for errors, a triangle for warnings, a circle for notes. */
export function SeverityIcon({ severity, size = 12 }: { severity: Severity; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="flex-none">
      {severity === "error" ? (
        <path
          d="M3.5 0.5 H8.5 L11.5 3.5 V8.5 L8.5 11.5 H3.5 L0.5 8.5 V3.5 Z"
          className="fill-error"
        />
      ) : severity === "warning" ? (
        <path d="M6 0.8 L11.5 11 H0.5 Z" className="fill-warning" />
      ) : (
        <circle cx="6" cy="6" r="5.5" className="fill-note" />
      )}
    </svg>
  );
}
