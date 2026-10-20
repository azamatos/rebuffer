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

/** A one-line tip for a first visit, until "Got it" (remembered in this browser). `title` names it. */
export function Hint({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => dismissed().includes(id));
  if (hidden) return null;
  return (
    <div
      role="note"
      aria-label={title}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-accent/8 py-1.5 pr-1.5 pl-3.5 text-sm text-fg-2"
    >
      <p className="min-w-0 flex-[1_1_520px] py-1">{children}</p>
      <button
        type="button"
        onClick={() => {
          dismiss(id);
          setHidden(true);
          // The button goes with the hint; keep keyboard users where they were, at the top of the screen.
          document.getElementById("main")?.focus();
        }}
        className="min-h-9 rounded-md px-2.5 font-medium text-accent-hover hover:bg-accent/10"
      >
        Got it
      </button>
    </div>
  );
}
