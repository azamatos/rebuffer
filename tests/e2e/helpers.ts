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

/**
 * Waits for the animations on `target` and inside it to finish: a table fading in or a menu popping open. axe
 * measures contrast on what's painted, so a check halfway through a fade fails.
 */
export async function settle(target: Locator): Promise<void> {
  await target.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
}

/** Waits until `target` stops moving: jumps within a page scroll smoothly, so a box measured mid-way is stale. */
export async function steady(target: Locator): Promise<void> {
  let last: string | undefined;
  await expect
    .poll(
      async () => {
        const box = JSON.stringify(await target.boundingBox());
        const same = box === last;
        last = box;
        return same;
      },
      { intervals: [100] },
    )
    .toBe(true);
}
