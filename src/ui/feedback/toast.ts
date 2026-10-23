/** Short confirmations ("Link copied.") at the bottom right of the screen, read out politely (Toaster.tsx). */
export interface Toast {
  id: number;
  text: string;
  /** Fading out: it goes once the fade is over. */
  leaving: boolean;
}

const SHOW_MS = 3200;
const LEAVE_MS = 220;

let current: Toast | undefined;
let nextId = 1;
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();

function set(next: Toast | undefined): void {
  current = next;
  for (const listener of listeners) listener();
}

/** Shows `text` for a few seconds (`showMs`), in place of any toast already showing. */
export function toast(text: string, { showMs = SHOW_MS } = {}): void {
  for (const timer of timers) clearTimeout(timer);
  const id = nextId++;
  set({ id, text, leaving: false });
  timers = [
    setTimeout(() => {
      set({ id, text, leaving: true });
    }, showMs),
    setTimeout(() => {
      set(undefined);
    }, showMs + LEAVE_MS),
  ];
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const currentToast = (): Toast | undefined => current;
