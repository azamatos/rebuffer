import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "@/ui/layout/AppShell";
import { HomePage } from "@/ui/pages/HomePage";
import { NotFoundPage } from "@/ui/pages/NotFoundPage";
import type { NetworksSearch } from "@/ui/networks/NetworkList";
import type { CompareSearch } from "@/ui/pages/ComparePage";
import type { InspectSearch } from "@/ui/pages/InspectPage";
import type { RunSearch } from "@/ui/pages/RunPage";

// The Run screen brings hls.js, zod and the simulator client, so it loads only when opened.
const RunPage = lazy(() =>
  import("@/ui/pages/RunPage").then((module) => ({ default: module.RunPage })),
);
const RunsPage = lazy(() =>
  import("@/ui/pages/RunsPage").then((module) => ({ default: module.RunsPage })),
);
const InspectPage = lazy(() =>
  import("@/ui/pages/InspectPage").then((module) => ({ default: module.InspectPage })),
);
const NetworksPage = lazy(() =>
  import("@/ui/pages/NetworksPage").then((module) => ({ default: module.NetworksPage })),
);
const ComparePage = lazy(() =>
  import("@/ui/pages/ComparePage").then((module) => ({ default: module.ComparePage })),
);
const AboutPage = lazy(() =>
  import("@/ui/pages/AboutPage").then((module) => ({ default: module.AboutPage })),
);
// The Report draws the same charts, so it loads on demand too.
const ReportPage = lazy(() =>
  import("@/ui/pages/ReportPage").then((module) => ({ default: module.ReportPage })),
);

const title = (page: string) => ({ meta: [{ title: `${page} · Rebuffer` }] });

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
  head: () => ({ meta: [{ title: "Rebuffer: see how a video player survives a bad network" }] }),
});

/** Keeps the string params the Run screen knows; anything else in the URL is ignored. */
function runSearch(search: Record<string, unknown>): RunSearch {
  const result: RunSearch = {};
  for (const key of ["stream", "network", "curve", "name", "player", "set", "start"] as const) {
    const value = search[key];
    if (typeof value === "string" && value !== "") result[key] = value;
  }
  return result;
}

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/run",
  head: () => title("Run"),
  validateSearch: runSearch,
  component: RunRoute,
});

function RunRoute() {
  const search = runRoute.useSearch();
  return (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the lab…</p>}>
      <RunPage search={search} />
    </Suspense>
  );
}

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  head: () => title("Runs"),
  component: () => (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the runs…</p>}>
      <RunsPage />
    </Suspense>
  ),
});

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  head: () => title("Report"),
  component: ReportRoute,
});

function ReportRoute() {
  const { runId } = reportRoute.useParams();
  return (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the report…</p>}>
      <ReportPage runId={runId} />
    </Suspense>
  );
}

// A static segment, so it wins over /runs/$runId.
const compareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/compare",
  head: () => title("Compare runs"),
  validateSearch: (search: Record<string, unknown>): CompareSearch => {
    const result: CompareSearch = {};
    for (const key of ["a", "b"] as const) {
      const value = search[key];
      // The router reads an id that looks like a number as one.
      if ((typeof value === "string" && value !== "") || typeof value === "number")
        result[key] = String(value);
    }
    return result;
  },
  component: CompareRoute,
});

function CompareRoute() {
  const search = compareRoute.useSearch();
  return (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the comparison…</p>}>
      <ComparePage search={search} />
    </Suspense>
  );
}

/** Keeps the string params the Networks screen knows. */
function networksSearch(search: Record<string, unknown>): NetworksSearch {
  const result: NetworksSearch = {};
  for (const key of ["network", "saved", "run", "new"] as const) {
    const value = search[key];
    if (typeof value === "string" && value !== "") result[key] = value;
  }
  return result;
}

const networksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/networks",
  head: () => title("Networks"),
  validateSearch: networksSearch,
  component: NetworksRoute,
});

function NetworksRoute() {
  const search = networksRoute.useSearch();
  return (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the networks…</p>}>
      <NetworksPage search={search} />
    </Suspense>
  );
}

const inspectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inspect",
  head: () => title("Inspect a stream"),
  validateSearch: (search: Record<string, unknown>): InspectSearch =>
    typeof search.url === "string" && search.url !== "" ? { url: search.url } : {},
  component: InspectRoute,
});

function InspectRoute() {
  const search = inspectRoute.useSearch();
  return (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading the inspector…</p>}>
      <InspectPage search={search} />
    </Suspense>
  );
}

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  head: () => title("About"),
  component: () => (
    <Suspense fallback={<p className="px-8 py-10 text-fg-2">Loading…</p>}>
      <AboutPage />
    </Suspense>
  ),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  runRoute,
  runsRoute,
  compareRoute,
  reportRoute,
  networksRoute,
  inspectRoute,
  aboutRoute,
]);

/** The app's router: in the browser with its address bar, or at a given path when Home is rendered at build time. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, defaultPreload: "intent", ...(history && { history }) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
