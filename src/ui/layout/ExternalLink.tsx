import type { ReactNode } from "react";

/**
 * A link to another site. It opens in a new tab, so a run or a comparison here isn't lost, and it says so: an arrow
 * out of a box for the eye, words for a screen reader. Links within the lab use the router's Link and stay in the tab.
 */
export function ExternalLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {children}
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-none opacity-70"
      >
        <path d="M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
