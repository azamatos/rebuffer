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

// The page comes with Home's markup (scripts/prerender.mjs). On Home, React takes it over (hydrates) once the route
// is ready, keeping the nodes already on screen; anywhere else the markup isn't this screen's (the CSS hides it), so
// it goes and the app renders afresh.
if (root.hasAttribute("data-prerendered") && window.location.pathname === "/") {
  void router.load().then(() => {
    hydrateRoot(root, app);
  });
} else {
  root.replaceChildren();
  root.removeAttribute("data-prerendered");
  createRoot(root).render(app);
}
