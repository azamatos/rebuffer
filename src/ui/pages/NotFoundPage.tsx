import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-14 sm:px-8">
      <h1 className="text-[32px] font-semibold tracking-tight">Nothing here</h1>
      <p className="text-fg-2">This page doesn't exist. Maybe the link was cut short.</p>
      <p>
        <Link to="/" className="text-accent hover:text-accent-hover">
          Go to the start
        </Link>
      </p>
    </section>
  );
}
