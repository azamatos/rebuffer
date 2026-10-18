import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", heading: "See how a video player survives a bad network." },
  { path: "/run", heading: /Train through a tunnel · hls\.js defaults/ },
  { path: "/inspect", heading: "Inspect a stream" },
  { path: "/networks", heading: "Networks" },
  { path: "/runs", heading: "Runs" },
  { path: "/about", heading: "About" },
];

for (const { path, heading } of pages) {
  test(`${path} renders its heading and passes axe`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

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
