import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useSyncExternalStore } from "react";
import { presetById } from "@/core/netsim/presets";
import { DEFAULT_NETWORK_ID, DEFAULT_PLAYER_ID, runSearchFor } from "@/core/run/setup";
import { DEFAULT_STREAM } from "@/core/samples";
import { RunSetup } from "@/ui/home/RunSetup";

// Saved runs come from IndexedDB after the page is up, so their code loads then too.
const RecentRuns = lazy(() =>
  import("@/ui/home/RecentRuns").then((module) => ({ default: module.RecentRuns })),
);

const subscribeNever = () => () => undefined;

/**
 * False in the markup made at build time (scripts/prerender.mjs) and while React takes it over, true after: saved
 * runs exist only in the browser.
 */
const useInBrowser = () =>
  useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

const tunnelS = presetById(DEFAULT_NETWORK_ID)?.curve.lengthS ?? 90;
const tryTheTunnel = runSearchFor(
  { streamUrl: DEFAULT_STREAM.url, networkId: DEFAULT_NETWORK_ID, playerId: DEFAULT_PLAYER_ID },
  { start: true },
);

const steps = [
  {
    title: "A real player",
    text: "hls.js plays the stream in this page with the settings you chose. Nothing about its logic is faked.",
  },
  {
    title: "A simulated network",
    text: "Segment bytes reach the player on the schedule your network curve allows, shared between parallel downloads.",
  },
  {
    title: "Honest numbers",
    text: "The same setup gives the same result. If your real connection was the bottleneck, the report says so.",
  },
];

export function HomePage() {
  const inBrowser = useInBrowser();
  return (
    <>
      <section className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pt-18 pb-10 sm:px-8">
        <p className="font-mono text-[13px] tracking-[0.08em] text-accent uppercase">
          HLS network lab
        </p>
        <h1 className="max-w-[18ch] text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-[56px]">
          See how a video player survives a bad network.
        </h1>
        <p className="max-w-[560px] text-lg text-fg-2">
          Pick a stream and a network, press Run, and watch hls.js fight it in real time: the
          bandwidth it gets, the quality it picks, the buffer, every stall. Then read a report with
          the numbers viewers feel.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/run"
            search={tryTheTunnel}
            className="inline-flex min-h-12 items-center gap-2.5 rounded-[10px] bg-accent px-5.5 text-[17px] font-semibold text-accent-ink hover:bg-accent-hover"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5 L13 8 L4 13.5 Z" className="fill-accent-ink" />
            </svg>
            Try the tunnel
          </Link>
          <a
            href="#setup"
            className="inline-flex min-h-12 items-center rounded-[10px] border border-line-strong px-5 font-medium text-fg hover:border-fg-3"
          >
            Set up your own run
          </a>
        </div>
        <p className="text-sm text-fg-3">
          {tunnelS} seconds. Runs in your browser; nothing is uploaded.
        </p>
      </section>

      <RunSetup />

      {inBrowser && (
        <Suspense fallback={null}>
          <RecentRuns />
        </Suspense>
      )}

      <section aria-labelledby="how-h" className="mx-auto max-w-[1280px] px-4 pt-2 pb-16 sm:px-8">
        <h2 id="how-h" className="mb-4 text-[22px] font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.title} className="border-t border-fg/12 pt-4">
              <p className="mb-1.5 font-semibold">{step.title}</p>
              <p className="text-[15px] text-fg-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
