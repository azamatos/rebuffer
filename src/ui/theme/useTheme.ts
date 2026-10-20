import { useSyncExternalStore } from "react";
import { currentTheme, subscribeTheme, type Theme } from "./theme";

/** The theme in use; components that draw on a canvas redraw when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => "dark");
}
