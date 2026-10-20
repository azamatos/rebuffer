import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { createAppRouter } from "./router";

/**
 * Home's HTML at build time (scripts/prerender.mjs puts it into dist/index.html), so the first paint doesn't wait for
 * the JavaScript; src/main.tsx takes over from it.
 */
export async function render(path: string): Promise<string> {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  await router.load();
  return renderToString(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
