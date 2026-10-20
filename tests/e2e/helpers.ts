import { expect, type Locator, type Page } from "@playwright/test";

// The synthetic stream from tests/e2e/fixtures/make-stream.mjs, served cross-origin by tests/e2e/servers/files.mjs.
export const STREAM = "http://localhost:4013/hls/ladder/master.m3u8";

/**
 * Opens a page and waits until the app runs it. Home comes with its markup made at build time, which looks ready
 * before the app has taken it over and can react to keys.
 */
export async function openApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator("#root:not([data-prerendered])")).toBeAttached();
}

/** Moves focus to `target` with Tab, as a keyboard user would. WebKit only tabs to text fields by default. */
export async function tabTo(page: Page, browserName: string, target: Locator): Promise<void> {
  if (browserName === "webkit") {
    await target.focus();
    return;
  }
  for (let i = 0; i < 40 && !(await target.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

export async function canPlayH264(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      typeof MediaSource !== "undefined" &&
      MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001f,mp4a.40.2"'),
  );
}
