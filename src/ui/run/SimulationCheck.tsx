import type { NetworkCurve } from "@/core/netsim/curve";
import type { Honesty } from "@/core/metrics";
import { describeHonesty, honestyWarning } from "@/core/run/describe";

/**
 * Whether the real network let the simulation work as set: a quiet line when it did, a banner with a one-line
 * headline and the details behind it when it didn't. The Report shows it under its title, the Run screen in its
 * result.
 */
export function SimulationCheck({
  honesty,
  curve,
  label = "Simulation check",
}: {
  honesty: Honesty;
  curve: NetworkCurve;
  /** The region's name; Compare names each run's ("B’s simulation check"). */
  label?: string;
}) {
  const sentences = describeHonesty(honesty, curve);
  const warning = honestyWarning(honesty);
  return (
    <section aria-label={label}>
      {warning ? (
        <details className="group rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5">
          <summary className="flex cursor-pointer list-none items-start gap-2.5 [&::-webkit-details-marker]:hidden">
            <svg
              width="16"
              height="16"
              viewBox="0 0 12 12"
              aria-hidden="true"
              className="mt-1 flex-none"
            >
              <path d="M6 0.8 L11.5 11 H0.5 Z" className="fill-warning" />
            </svg>
            <span className="min-w-0 flex-auto">
              <strong className="font-semibold">Simulation check:</strong> {warning}
            </span>
            <span className="inline-flex flex-none items-center gap-1 pt-0.5 text-sm text-warning-text">
              Details
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
                className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              >
                <path
                  d="M2 3.5 L5 6.5 L8 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-11 text-sm text-fg-2">
            {sentences.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="flex items-start gap-2 text-sm text-fg-2">
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" className="flex-none">
            <circle cx="9" cy="9" r="8" fill="none" strokeWidth="1.6" className="stroke-accent" />
            <path
              d="M5.5 9.2 L8 11.5 L12.5 6.5"
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-accent"
            />
          </svg>
          <span>
            <span className="font-medium text-fg">Simulation check:</span>{" "}
            {sentences.length === 0
              ? "No downloads went through the simulated network."
              : sentences.join(" ")}
          </span>
        </p>
      )}
    </section>
  );
}
