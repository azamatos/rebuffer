import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { createAppRouter } from "./router";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

const router = createAppRouter();
const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// The router loads the route first (and with it the screen's code: src/router.tsx), so the first render is the whole
// screen. The page comes with Home's markup (scripts/prerender.mjs): on Home, React takes it over (hydrates), keeping
// the nodes already on screen; anywhere else that markup isn't this screen's (the CSS hides it), so it goes.
void router.load().then(() => {
  if (root.hasAttribute("data-prerendered") && window.location.pathname === "/") {
    hydrateRoot(root, app);
    return;
  }
  root.replaceChildren();
  root.removeAttribute("data-prerendered");
  createRoot(root).render(app);
});
