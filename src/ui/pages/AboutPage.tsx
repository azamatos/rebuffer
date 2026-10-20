import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { presets } from "@/core/netsim/presets";
import { recordedTraces, TRACE_CREDIT } from "@/core/netsim/traces";
import { SAMPLE_STREAMS } from "@/core/samples";

const REPO = "https://github.com/azamatos/rebuffer";

const sections = [
  { id: "run", title: "How a run works" },
  { id: "limits", title: "Where the simulation stops" },
  { id: "repeatable", title: "How repeatable it is" },
  { id: "numbers", title: "The numbers" },
  { id: "privacy", title: "Privacy" },
  { id: "credits", title: "Credits" },
] as const;

const metrics: { name: string; definition: string }[] = [
  {
    name: "First frame",
    definition: "From the start of the run to the first picture on screen.",
  },
  {
    name: "Stalls",
    definition:
      "How often, and for how long, playback waited for data after the first frame. Seeks don't count.",
  },
  { name: "Rebuffer ratio", definition: "Stall time ÷ (play time + stall time)." },
  {
    name: "Average bitrate",
    definition: "Of the quality on screen, weighted by how long each was shown.",
  },
  {
    name: "Quality switches",
    definition: "Changes of the quality on screen, up and down counted apart.",
  },
  {
    name: "At top quality",
    definition: "The share of play time at the stream's highest quality.",
  },
  {
    name: "Wasted data",
    definition: "Bytes downloaded and never played: abandoned downloads and replaced segments.",
  },
];

const libraries: { name: string; href: string; licence: string }[] = [
  { name: "hls.js", href: "https://github.com/video-dev/hls.js", licence: "Apache-2.0" },
  { name: "React", href: "https://react.dev", licence: "MIT" },
  { name: "TanStack Router", href: "https://tanstack.com/router", licence: "MIT" },
  { name: "Zod", href: "https://zod.dev", licence: "MIT" },
  {
    name: "idb-keyval",
    href: "https://github.com/jakearchibald/idb-keyval",
    licence: "Apache-2.0",
  },
  { name: "Tailwind CSS", href: "https://tailwindcss.com", licence: "MIT" },
  { name: "Vite", href: "https://vite.dev", licence: "MIT" },
  { name: "Geist", href: "https://vercel.com/font", licence: "OFL-1.1" },
  { name: "Space Mono", href: "https://github.com/googlefonts/spacemono", licence: "OFL-1.1" },
];

const thirdParty = SAMPLE_STREAMS.filter((stream) => stream.host === "third-party");

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-accent underline underline-offset-2 hover:text-accent-hover">
      {children}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="flex scroll-mt-6 flex-col gap-3 border-t border-line pt-6"
    >
      <h2 id={`${id}-h`} className="text-[22px] font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** How the lab works, where it stops, how each number is computed, and credits. */
export function AboutPage() {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-8 px-4 py-14 sm:px-8 lg:flex-row lg:gap-16">
      <nav
        aria-labelledby="toc-h"
        className="lg:sticky lg:top-6 lg:w-56 lg:flex-none lg:self-start"
      >
        <h2 id="toc-h" className="mb-2 text-sm font-semibold text-fg-2">
          On this page
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[15px] lg:flex-col">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-fg-2 hover:text-fg">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="flex max-w-[72ch] min-w-0 flex-col gap-8 text-fg-2 [&_strong]:font-semibold [&_strong]:text-fg">
        <header className="flex flex-col gap-4">
          <h1 className="text-[32px] font-semibold tracking-tight text-fg">About</h1>
          <p className="text-lg">
            Rebuffer is a lab for HLS video streaming that runs in your browser. A real player plays
            a stream through a network you choose, live charts show what it decides, and a report
            scores the result. There is no server behind it: the page, the player and the simulated
            network all run on your device.
          </p>
        </header>

        <Section id="run" title="How a run works">
          <ol className="flex list-decimal flex-col gap-2.5 pl-5">
            <li>
              <strong>A real player.</strong> hls.js 1.7.3 plays the stream with the settings you
              chose. Its own logic picks the quality, measures the bandwidth and decides when to
              give up on a download; the lab changes none of it.
            </li>
            <li>
              <strong>A simulated network.</strong> A Service Worker in this page answers every
              download the player makes. It fetches the real bytes and hands them over on the
              schedule your network allows: each download waits one round trip (the network's
              latency) for its first byte, and downloads that run at the same time share the
              bandwidth.
            </li>
            <li>
              <strong>A log of everything.</strong> Every download, quality change, stall and buffer
              level goes into one log, timed from the start of the run. The charts draw from it as
              it grows.
            </li>
            <li>
              <strong>A report.</strong> At the end, the log becomes numbers, a score, notes on what
              happened and ideas to try next. Runs are saved in this browser, the newest 50.
            </li>
          </ol>
          <p>
            A network is a curve of bandwidth over time plus a latency. There are {presets.length}{" "}
            presets, {recordedTraces.length} recorded 4G journeys, and your own: draw one in the{" "}
            <Link to="/networks" className="text-accent underline underline-offset-2">
              network editor
            </Link>
            , with the keyboard or a pointer, or import JSON or CSV.
          </p>
        </Section>

        <Section id="limits" title="Where the simulation stops">
          <ul className="flex list-disc flex-col gap-2.5 pl-5">
            <li>
              <strong>It can slow your network down, not speed it up.</strong> If your real
              connection answers later or delivers slower than the simulated one, downloads arrive
              late. A check before each run measures your real latency, and the result says how many
              downloads started or arrived late, and why, with the speed your connection managed.
            </li>
            <li>
              <strong>The first run of a stream goes over your real network.</strong> The browser
              keeps what runs download (up to 300 MB, what was used longest ago goes first), and
              later runs take the bytes from that copy, still through the simulated network, so
              repeats don&apos;t depend on your connection. The result has a button that forgets the
              copy.
            </li>
            <li>
              <strong>One link, no packets.</strong> The network is the bandwidth the player gets
              and a fixed round trip per request. There is no packet loss, no TCP slow start and no
              jitter within a step of the curve; a recorded trace brings its own ups and downs.
            </li>
            <li>
              <strong>Background tabs.</strong> A browser slows a hidden tab&apos;s timers. The
              report says how long the tab was in the background.
            </li>
            <li>
              <strong>Streams the lab can play.</strong> HLS that the stream&apos;s server lets a
              browser read (CORS), without DRM. Low-latency HLS and DASH aren&apos;t supported. The
              lab plays through hls.js in every browser, Safari included, and is tested in Chromium,
              Firefox and WebKit.
            </li>
          </ul>
        </Section>

        <Section id="repeatable" title="How repeatable it is">
          <p>
            The same setup should give the same result. What has been measured so far, on one Mac:
          </p>
          <ul className="flex list-disc flex-col gap-2.5 pl-5">
            <li>
              The simulated network delivers 3–24 ms behind its curve, never ahead, in Chromium,
              Firefox and WebKit (a 1 MiB file at 4 Mbps steps, 100 ms latency). Two downloads at
              once each take twice as long.
            </li>
            <li>
              Repeat runs from the saved copy matched in Chromium: the tunnel four times scored 31,
              25, 25 and 25. The first run went over the real network, and its result said so.
            </li>
          </ul>
        </Section>

        <Section id="numbers" title="The numbers">
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[max-content_1fr]">
            {metrics.map((metric) => (
              <div key={metric.name} className="contents">
                <dt className="font-semibold text-fg">{metric.name}</dt>
                <dd>{metric.definition}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-3 text-lg font-semibold text-fg">The score</h3>
          <p>
            Each segment played earns its bitrate in Mbps. Each quality change costs the size of the
            jump, in Mbps. Each second of stall costs as much as a segment at the top quality, and
            so does each second before the first frame. The total is divided by what a perfect run
            would earn (top quality all the way, no stalls, an instant start) and shown out of 100.
          </p>
          <p className="overflow-x-auto rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[13px] whitespace-nowrap text-fg">
            QoE = Σ q(R<sub>k</sub>) − λ Σ |q(R<sub>k+1</sub>) − q(R<sub>k</sub>)| − μ · stall s − μ
            <sub>s</sub> · startup s
          </p>
          <p>
            q(R) is the bitrate in Mbps, λ = 1, and μ = μ<sub>s</sub> = the top bitrate. This is the
            linear model from Yin et al., “A Control-Theoretic Approach for Dynamic Adaptive Video
            Streaming over HTTP”, SIGCOMM 2015. It measures against the stream&apos;s top quality,
            not against what the network allows: on a network slower than the top quality, even a
            run without a stall scores low.
          </p>
        </Section>

        <Section id="privacy" title="Privacy">
          <p>
            Stream links, networks and runs stay in this browser (IndexedDB). Downloaded media is
            kept in the browser&apos;s cache for repeat runs. The page talks only to the
            stream&apos;s own servers, to this site, and to Cloudflare Web Analytics, which counts
            visits without cookies.
          </p>
        </Section>

        <Section id="credits" title="Credits">
          <ul className="flex list-disc flex-col gap-2.5 pl-5">
            <li>
              Sample film: <cite>Tears of Steel</cite>, (CC) Blender Foundation |{" "}
              <ExternalLink href="https://mango.blender.org">mango.blender.org</ExternalLink>,{" "}
              <ExternalLink href="https://creativecommons.org/licenses/by/3.0/">
                CC BY 3.0
              </ExternalLink>
              . Re-encoded for streaming, never cut. A second copy has a playlist with planted
              mistakes, for the inspector.
            </li>
            <li>
              Recorded networks: {TRACE_CREDIT.authors}, “{TRACE_CREDIT.dataset}”,{" "}
              {TRACE_CREDIT.citation} (
              <ExternalLink href={TRACE_CREDIT.sourceUrl}>the dataset</ExternalLink>),{" "}
              <ExternalLink href={TRACE_CREDIT.licenceUrl}>{TRACE_CREDIT.licence}</ExternalLink>.
              Changes: {TRACE_CREDIT.changes}
            </li>
            <li>
              Public test streams, hosted by others and offered as they are:{" "}
              {thirdParty.map((stream, index) => (
                <span key={stream.id}>
                  {index > 0 && (index === thirdParty.length - 1 ? " and " : ", ")}
                  {stream.name}
                </span>
              ))}
              .
            </li>
            <li>
              Built with{" "}
              {libraries.map((library, index) => (
                <span key={library.name}>
                  {index > 0 && (index === libraries.length - 1 ? " and " : ", ")}
                  <ExternalLink href={library.href}>{library.name}</ExternalLink> ({library.licence}
                  )
                </span>
              ))}
              .
            </li>
          </ul>
          <p>
            The code is open (MIT) at{" "}
            <ExternalLink href={REPO}>github.com/azamatos/rebuffer</ExternalLink>. Built by{" "}
            <ExternalLink href="https://azamatos.com">Azamat Jorayev</ExternalLink>.
          </p>
        </Section>
      </article>
    </div>
  );
}
