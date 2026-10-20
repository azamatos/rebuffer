import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { tabTo } from "./helpers";

test("About: its contents work by keyboard, and it credits the film and the traces", async ({
  page,
  browserName,
}) => {
  test.skip(browserName === "webkit", "WebKit skips links on Tab by default");
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();

  const contents = page.getByRole("navigation", { name: "On this page" });
  const credits = contents.getByRole("link", { name: "Credits" });
  await tabTo(page, browserName, credits);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#credits$/);
  const section = page.getByRole("region", { name: "Credits" });
  await expect(section).toBeInViewport();

  await expect(section).toContainText(
    "Tears of Steel, (CC) Blender Foundation | mango.blender.org",
  );
  await expect(section.getByRole("link", { name: "CC BY 3.0" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/3.0/",
  );
  await expect(section).toContainText("Raca et al., ACM MMSys 2018");
  await expect(section.getByRole("link", { name: "CC BY 4.0" })).toBeVisible();
  await expect(section.getByRole("link", { name: "hls.js" })).toBeVisible();

  for (const name of ["How a run works", "Where the simulation stops", "The numbers", "Privacy"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
