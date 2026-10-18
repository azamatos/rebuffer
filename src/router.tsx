import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "@/ui/layout/AppShell";
import { HomePage } from "@/ui/pages/HomePage";
import { NotFoundPage } from "@/ui/pages/NotFoundPage";
import { PlannedPage } from "@/ui/pages/PlannedPage";

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

const runRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/run",
  head: () => title("Run"),
  component: () => (
    <PlannedPage
      title="Run"
      summary="A real hls.js player plays the stream through the simulated network while live charts show the bandwidth, the quality it picks, the buffer and every stall."
    />
  ),
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  head: () => title("Runs"),
  component: () => (
    <PlannedPage
      title="Runs"
      summary="Reports of the runs saved in this browser: the score, what happened and what to try next."
    />
  ),
});

const networksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/networks",
  head: () => title("Networks"),
  component: () => (
    <PlannedPage
      title="Networks"
      summary="Presets, recorded 4G traces and a bandwidth curve you draw, with the stream's quality ladder drawn over it."
    />
  ),
});

const inspectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inspect",
  head: () => title("Inspect a stream"),
  component: () => (
    <PlannedPage
      title="Inspect a stream"
      summary="Read an HLS playlist: the quality ladder, codecs in plain words, tracks, segments, measured bitrates and findings with explanations."
    />
  ),
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  head: () => title("About"),
  component: () => (
    <PlannedPage
      title="About"
      summary="How the simulation works and where it stops, how each number is computed, and credits."
    />
  ),
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  runRoute,
  runsRoute,
  networksRoute,
  inspectRoute,
  aboutRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
