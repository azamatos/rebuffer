/**
 * Rings `element` for a moment where the eye lands after a jump within the page (`.flash` in src/styles.css, which
 * does nothing with reduced motion).
 */
export function flash(element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove("flash");
  // A layout read in between restarts the animation when the same target is flashed again before it ends.
  element.getBoundingClientRect();
  element.classList.add("flash");
  element.addEventListener(
    "animationend",
    () => {
      element.classList.remove("flash");
    },
    { once: true },
  );
}
