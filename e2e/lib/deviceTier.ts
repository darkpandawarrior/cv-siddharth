import type { Page } from "@playwright/test";
import type { DeviceTier } from "../../src/world/deviceTier.ts";

/** Keep graphics feature tests on their intended branch under software WebGL. */
export async function forceDeviceTier(page: Page, tier: DeviceTier | "viewport"): Promise<void> {
  await page.addInitScript((value) => {
    window.__DEVICE_TIER_TEST__ = value === "viewport"
      ? window.matchMedia("(max-width: 820px)").matches ? 2 : 1
      : value;
  }, tier);
}
