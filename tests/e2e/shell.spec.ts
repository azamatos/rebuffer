import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { tabTo } from "./helpers";

const pages = [
  { path: "/", heading: "See how a video player survives a bad network." },
  { path: "/run", heading: /Train through a tunnel · hls\.js defaults/ },
  { path: "/inspect", heading: "Inspect a stream" },
  { path: "/networks", heading: "Networks" },
  { path: "/runs", heading: "Runs" },
  { path: "/about", heading: "About" },
];

// Playwright's browsers report a light system theme unless told otherwise, so the other specs check the light theme;
// these check both.
for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const { path, heading } of pages) {
      test(`${path} renders its heading and passes axe`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);

        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  });
}

test("the theme switch works with the keyboard and is kept", async ({ page, browserName }) => {
  const html = page.locator("html");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html).toHaveAttribute("data-theme", "dark");

  const theme = page.getByRole("group", { name: "Theme" });
  const system = theme.getByRole("radio", { name: "System" });
  await expect(system).toBeChecked();
  await tabTo(page, browserName, system);
  await page.keyboard.press("ArrowRight");
  await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "light");

  // The choice outlives a reload and is applied before the app starts.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked();

  // Back to System: the page follows the system's setting again.
  await theme.getByRole("radio", { name: "Light" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(system).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("the skip link moves focus to the main content", async ({ page, browserName }) => {
  // WebKit only tabs to links when "Press Tab to highlight each item" is on.
  test.skip(browserName === "webkit", "WebKit skips links on Tab by default");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("the main navigation works with the keyboard alone", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit skips links on Tab by default");
  await page.goto("/");
  const inspect = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Inspect" });
  for (let i = 0; i < 10 && !(await inspect.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(inspect).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/inspect$/);
  await expect(page.getByRole("heading", { level: 1, name: "Inspect a stream" })).toBeVisible();
  await expect(inspect).toHaveAttribute("aria-current", "page");
});

test("unknown paths show a not-found page", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "Nothing here" })).toBeVisible();
});
