import { startTheme } from "./ui/theme/theme";
import "./styles.css";

startTheme();

// Until the app has taken Home's markup over, a submit would reload the page with the form in its address (Run, or
// Enter in the setup): hold it; the app handles it from then on.
document.addEventListener(
  "submit",
  (event) => {
    if (document.getElementById("root")?.hasAttribute("data-prerendered")) event.preventDefault();
  },
  { capture: true },
);

// The page arrives with Home's markup (scripts/prerender.mjs). The app's code runs after that has been painted, so
// the first paint never waits for it, however fast the scripts arrive. A tab opened in the background paints nothing
// and gets no animation frames, so there it starts at once.
const startApp = () => {
  void import("./app");
};
if (document.visibilityState === "visible") {
  requestAnimationFrame(() => {
    setTimeout(startApp);
  });
} else {
  startApp();
}
