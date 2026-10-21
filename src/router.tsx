import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { PAGES } from "@/seo";
import { AppShell } from "@/ui/layout/AppShell";
import { HomePage } from "@/ui/pages/HomePage";
import { NotFoundPage } from "@/ui/pages/NotFoundPage";
import type { NetworksSearch } from "@/ui/networks/NetworkList";
import type { CompareSearch } from "@/ui/pages/ComparePage";
import type { InspectSearch } from "@/ui/pages/InspectPage";
import type { RunSearch } from "@/ui/pages/RunPage";

// Every screen but Home loads its code when it's needed (the Run screen brings hls.js and the simulator client).
// The router loads a route's code as part of loading the route, on intent (hover, focus) and before the first render
// (src/app.tsx), so a screen appears whole: no "Loading…" that the content then pushes down. `pending` shows only when
// a screen's code takes over a second to arrive. It's set per screen, not as the router's default: a default would
// wrap the root route in a Suspense boundary in the browser but not in Home's build-time render, and React couldn't
// hydrate it.
const pending = () => <p className="px-8 py-10 text-fg-2">Loading…</p>;

const title = (page: string) => ({ meta: [{ title: `${page} · Rebuffer` }] });

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
  head: () => ({ meta: [{ title: PAGES.home.title }] }),
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
  component: lazyRouteComponent(() => import("@/ui/pages/RunPage"), "RunRoute"),
  pendingComponent: pending,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  head: () => ({ meta: [{ title: PAGES.runs.title }] }),
  component: lazyRouteComponent(() => import("@/ui/pages/RunsPage"), "RunsPage"),
  pendingComponent: pending,
});

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  head: () => title("Report"),
  // The Report draws the same charts as the Run screen.
  component: lazyRouteComponent(() => import("@/ui/pages/ReportPage"), "ReportRoute"),
  pendingComponent: pending,
});

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
  component: lazyRouteComponent(() => import("@/ui/pages/ComparePage"), "CompareRoute"),
  pendingComponent: pending,
});

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
  head: () => ({ meta: [{ title: PAGES.networks.title }] }),
  validateSearch: networksSearch,
  component: lazyRouteComponent(() => import("@/ui/pages/NetworksPage"), "NetworksRoute"),
  pendingComponent: pending,
});

const inspectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inspect",
  head: () => ({ meta: [{ title: PAGES.inspect.title }] }),
  validateSearch: (search: Record<string, unknown>): InspectSearch =>
    typeof search.url === "string" && search.url !== "" ? { url: search.url } : {},
  component: lazyRouteComponent(() => import("@/ui/pages/InspectPage"), "InspectRoute"),
  pendingComponent: pending,
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  head: () => ({ meta: [{ title: PAGES.about.title }] }),
  component: lazyRouteComponent(() => import("@/ui/pages/AboutPage"), "AboutPage"),
  pendingComponent: pending,
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
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    // The page scrolls smoothly within a screen (src/styles.css); a new screen starts at its top at once.
    scrollRestorationBehavior: "instant",
    ...(history && { history }),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
