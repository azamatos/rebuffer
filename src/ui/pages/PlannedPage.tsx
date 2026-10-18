import { Link } from "@tanstack/react-router";

/** Stand-in for screens that aren't built yet, so routes, navigation and tests exist from day one. */
export function PlannedPage({ title, summary }: { title: string; summary: string }) {
  return (
    <section className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-14 sm:px-8">
      <h1 className="text-[32px] font-semibold tracking-tight">{title}</h1>
      <p className="max-w-[65ch] text-fg-2">{summary}</p>
      <p className="inline-flex w-fit items-center gap-2 rounded-full border border-line-strong px-3 py-1 text-sm text-fg-2">
        Not built yet
      </p>
      <p>
        <Link to="/" className="text-accent hover:text-accent-hover">
          Back to the start
        </Link>
      </p>
    </section>
  );
}
