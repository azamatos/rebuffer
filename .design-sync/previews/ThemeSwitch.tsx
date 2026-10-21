import { ThemeSwitch, Wordmark } from "rebuffer";

const nav = ["Run", "Inspect", "Networks", "Runs", "About"];

// The header every screen shares: the wordmark, the main navigation (the current screen on a tint), and the
// System / Light / Dark switch at the end.
export function InTheHeader() {
  return (
    <header className="rounded-xl border-b border-line bg-ground text-fg">
      <div className="flex min-h-15 flex-wrap items-center gap-x-7 gap-y-1 px-4 py-2.5">
        <a href="#" className="text-fg">
          <Wordmark />
        </a>
        <nav aria-label="Main" className="flex flex-auto flex-wrap gap-0.5 text-[15px]">
          {nav.map((label) => (
            <a
              key={label}
              href="#"
              aria-current={label === "Inspect" ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 ${label === "Inspect" ? "bg-fg/7 font-medium text-fg" : "text-fg-2 hover:bg-fg/4 hover:text-fg"}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <ThemeSwitch />
      </div>
    </header>
  );
}

// On its own: three radios, System (the default), Light and Dark, which set <html data-theme>.
export function Alone() {
  return (
    <div className="flex rounded-xl bg-ground p-5 text-fg">
      <ThemeSwitch />
    </div>
  );
}
