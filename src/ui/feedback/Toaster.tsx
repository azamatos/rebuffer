import { useSyncExternalStore } from "react";
import { currentToast, subscribeToasts } from "./toast";

/**
 * Where toasts show. A live region without `role="status"`: each screen keeps its one status (the run's state, the
 * charts' zoom), which screen readers and the tests find by that role. The region is always there, so what's put in
 * it is read out.
 */
export function Toaster() {
  const shown = useSyncExternalStore(subscribeToasts, currentToast, () => undefined);
  return (
    <div
      id="toasts"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-30 flex justify-end sm:right-8 sm:bottom-6"
    >
      {shown && (
        <p
          key={shown.id}
          className={`toast-in flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-2.5 rounded-[10px] border border-line-strong bg-toast px-3.5 py-2.5 text-sm text-toast-fg shadow-[0_10px_28px_rgb(0_0_0/0.25)] transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none ${shown.leaving ? "translate-y-4 opacity-0" : ""}`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="flex-none">
            <path
              d="M3 8.5 L6.5 12 L13 4.5"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-toast-icon"
            />
          </svg>
          {shown.text}
        </p>
      )}
    </div>
  );
}
