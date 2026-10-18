import { HeadContent, Link, Outlet } from "@tanstack/react-router";
import { Wordmark } from "./Logo";

const nav = [
  { to: "/", label: "Run" },
  { to: "/inspect", label: "Inspect" },
  { to: "/networks", label: "Networks" },
  { to: "/runs", label: "Runs" },
  { to: "/about", label: "About" },
] as const;

export function AppShell() {
  return (
    <>
      <HeadContent />
      <a
        href="#main"
        className="sr-only z-10 rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-6 px-4 py-4 sm:px-8">
            <Link to="/" className="text-fg">
              <Wordmark />
            </Link>
            <nav aria-label="Main" className="flex flex-auto flex-wrap gap-1">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-lg px-3 py-2 text-fg-2 hover:text-fg"
                  activeProps={{ className: "bg-white/6 text-fg" }}
                  activeOptions={{ exact: true }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <Outlet />
        </main>

        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1360px] flex-wrap justify-between gap-x-6 gap-y-2 px-4 pt-5 pb-7 text-sm text-fg-3 sm:px-8">
            <p>
              Sample film: <cite>Tears of Steel</cite>, (CC) Blender Foundation | mango.blender.org,
              CC BY 3.0, re-encoded for streaming.
            </p>
            <p>
              Built by{" "}
              <a href="https://azamatos.com" className="text-accent hover:text-accent-hover">
                Azamat Jorayev
              </a>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
