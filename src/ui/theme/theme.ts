/**
 * Light or dark. The visitor picks System (the default), Light or Dark; the choice is kept in `localStorage`, and the
 * page's `<html data-theme>` always holds the theme in use, so the CSS needs one set of light tokens. A script in
 * `index.html` sets it before the first paint (its hash is in the CSP in `public/_headers`); this module takes over
 * once the app is up and follows the system's setting while the choice is System.
 */

export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

/** Also read by the script in index.html; change both together. */
export const THEME_KEY = "rebuffer-theme";

/** The page's ground in each theme, for the browser's own UI (`<meta name="theme-color">`); index.html's script too. */
const GROUND: Record<Theme, string> = { dark: "#050607", light: "#f4f5f6" };

const lightQuery = () => window.matchMedia("(prefers-color-scheme: light)");

export function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Storage can be blocked (private windows, site data turned off): the system's setting still works.
    return "system";
  }
}

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice !== "system") return choice;
  return lightQuery().matches ? "light" : "dark";
}

/** The theme in use, as the page shows it. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const listeners = new Set<() => void>();
let current: ThemeChoice = "system";

function apply(choice: ThemeChoice): void {
  const theme = resolveTheme(choice);
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", GROUND[theme]);
  for (const listener of listeners) listener();
}

export function setChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Not kept for the next visit, but it still applies now.
  }
  current = choice;
  apply(choice);
}

/** Applies the stored choice and follows the system's setting and other tabs. Call once, before the app renders. */
export function startTheme(): void {
  current = readChoice();
  apply(current);
  lightQuery().addEventListener("change", () => {
    if (current === "system") apply(current);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    current = readChoice();
    apply(current);
  });
}

/** For `useSyncExternalStore`: called whenever the choice or the theme in use changes. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const currentChoice = (): ThemeChoice => current;
