import { HeadContent, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/ui/feedback/Toaster";
import { ExternalLink } from "@/ui/layout/ExternalLink";
import { ThemeSwitch } from "@/ui/theme/ThemeSwitch";
import { Wordmark } from "./Logo";

// Home is where runs are set up, so its link is "Run"; a report counts as part of Runs.
const nav = [
  { to: "/", label: "Run", exact: true },
  { to: "/inspect", label: "Inspect", exact: true },
  { to: "/networks", label: "Networks", exact: true },
  { to: "/runs", label: "Runs", exact: false },
  { to: "/about", label: "About", exact: true },
] as const;

export function AppShell() {
  // From here on, the markup Home came with (scripts/prerender.mjs) is the app's: it reacts to clicks and keys.
  // Tests wait for this (tests/e2e/helpers.ts, openApp).
  useEffect(() => {
    document.getElementById("root")?.removeAttribute("data-prerendered");
  }, []);
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
          <div className="mx-auto flex min-h-15 max-w-[1360px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:gap-x-7 sm:px-8">
            <Link to="/" className="text-fg">
              <Wordmark />
            </Link>
            <nav
              aria-label="Main"
              className="flex flex-auto flex-wrap gap-0.5 text-[15px] max-sm:order-last max-sm:-mx-3 max-sm:w-full"
            >
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="rounded-lg px-3 py-1.5 transition-colors"
                  activeProps={{ className: "bg-fg/7 font-medium text-fg" }}
                  inactiveProps={{ className: "text-fg-2 hover:bg-fg/4 hover:text-fg" }}
                  activeOptions={{ exact: item.exact, includeSearch: false }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="max-sm:ml-auto">
              <ThemeSwitch />
            </div>
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
              <ExternalLink
                href="https://azamatos.com"
                className="text-accent hover:text-accent-hover"
              >
                Azamat Jorayev
              </ExternalLink>
            </p>
          </div>
        </footer>
      </div>
      <Toaster />
    </>
  );
}
