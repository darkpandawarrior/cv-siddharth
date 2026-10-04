import type { Page } from "@playwright/test";
import type { CaptureHost } from "../../src/world/v2/captureControl.ts";

type CaptureWindow = Window & CaptureHost;

export async function enableWorldCapture(page: Page): Promise<void> {
  await page.addInitScript(() => { (window as CaptureWindow).__WORLD_CAPTURE_TEST__ = true; });
}

/** Preserve the rendered frame while Chromium copies the full viewport. */
export async function worldScreenshot(page: Page, options: Parameters<Page["screenshot"]>[0]): Promise<Buffer> {
  const world = await page.locator("[data-world='v2'] canvas").count() > 0;
  if (world) {
    await page.waitForFunction(() => !!(window as CaptureWindow).__WORLD_CAPTURE__);
    await page.evaluate(() => (window as CaptureWindow).__WORLD_CAPTURE__!.pause());
  }
  try {
    return await page.screenshot(options);
  } finally {
    if (world && !page.isClosed()) await page.evaluate(() => (window as CaptureWindow).__WORLD_CAPTURE__?.resume());
  }
}
