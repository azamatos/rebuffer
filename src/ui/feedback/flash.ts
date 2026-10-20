/**
 * Rings `element` for a moment where the eye lands after a jump within the page (`.flash` in src/styles.css). Not
 * with reduced motion, where `.flash` has no animation to end.
 */
export function flash(element: Element | null | undefined): void {
  if (!(element instanceof HTMLElement)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.classList.remove("flash");
  // A layout read in between restarts the animation when the same target is flashed again before it ends.
  element.getBoundingClientRect();
  element.classList.add("flash");
  // Its own animation's end: one inside it (a table fading in) bubbles up here too.
  const done = (event: AnimationEvent) => {
    if (event.target !== element) return;
    element.classList.remove("flash");
    element.removeEventListener("animationend", done);
  };
  element.addEventListener("animationend", done);
}
