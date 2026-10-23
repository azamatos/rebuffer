/** A's solid line or B's dashed one, as Compare's charts draw them. */
export function RunSwatch({ side }: { side: "a" | "b" }) {
  return (
    <svg width="18" height="10" aria-hidden="true" className="flex-none overflow-visible">
      <path
        d="M0 5 H18"
        strokeWidth="2.5"
        strokeDasharray={side === "b" ? "5 3" : undefined}
        className={side === "a" ? "stroke-fg" : "stroke-accent"}
      />
    </svg>
  );
}
