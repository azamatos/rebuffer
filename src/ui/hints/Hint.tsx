import { useState, type ReactNode } from "react";

const KEY = "rebuffer-hints-dismissed";

function dismissed(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch {
    // Blocked or broken storage: the hint shows, and "Got it" hides it for this visit.
    return [];
  }
}

function dismiss(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...dismissed(), id])]));
  } catch {
    // Not kept for the next visit.
  }
}

/** A tip for a first visit, until "Got it" (remembered in this browser). */
export function Hint({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => dismissed().includes(id));
  if (hidden) return null;
  return (
    <div
      role="note"
      aria-label={title}
      className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-[14px] border border-accent/35 bg-accent/6 px-5 py-4"
    >
      <div className="min-w-0 flex-[1_1_480px]">
        <p className="mb-1.5 font-semibold">{title}</p>
        <div className="text-[15px] text-fg-2">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          dismiss(id);
          setHidden(true);
        }}
        className="min-h-10 rounded-lg border border-line-strong px-4 font-medium hover:border-fg-3"
      >
        Got it
      </button>
    </div>
  );
}
