import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const DAY = 86_400_000;
const features = [["older-one", 25, 5.2], ["older-two", 24, 4.6], ["small", 3, 3], ["recent", 1, 5.1]].map(([id, days, mag]) => ({
  id, properties: { mag, time: NOW - Number(days) * DAY, place: `Fixture ${id}` }, geometry: { type: "Point", coordinates: [140, 35, 12] },
}));
export async function setupE4(page: Page, state: "ready" | "loading" | "failed" | "partial" = "ready") {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Fixture unavailable" } });
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname === "earthquake.usgs.gov" && /(?:4\.5_month|2\.5_week)/.test(url.pathname)) {
      if (state === "loading") return; // held response, explicitly unknown
      if (state === "failed" || (state === "partial" && url.pathname.includes("month"))) return route.abort();
      const month = url.pathname.includes("month");
      return route.fulfill({ json: { type: "FeatureCollection", metadata: { generated: NOW }, features: features.filter((f) => month ? Number(f.properties.mag) >= 4.5 : f.properties.time >= NOW - 7 * DAY) } });
    }
    return route.abort();
  });
  await page.goto("/globe");
  await waitForHydration(page);
  if (page.viewportSize()!.width < 640) await page.getByRole("button", { name: "Open the time sheet" }).tap();
  const strip = page.locator("[data-event-strip]:visible");
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await strip.locator("summary").click();
  return strip;
}
for (const mobile of [false, true]) test.describe(mobile ? "phone touch" : "desktop", () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
  test("bins loaded replay records, keys select and Fly to reaches the camera", async ({ page }) => {
    const strip = await setupE4(page);
    await expect(strip).toContainText("3 loaded records");
    await expect(strip).toContainText("Source range: M4.5+");
    const bins = strip.locator("[data-event-bin]");
    await expect(bins).toHaveCount(7);
    if (mobile) await bins.nth(1).tap(); else await bins.nth(1).click();
    await expect(strip.locator("[data-event-records]")).toContainText("2 loaded matches");
    await expect(strip).toContainText("Fixture older-one");
    await expect(page.locator("[data-globe-not-live]:visible")).toBeVisible();
    await expect(page.getByRole("slider", { name: mobile ? /\(sheet\)/ : /Simulated time offset.*ahead$/ })).toHaveAttribute("aria-valuetext", "25 days ago");
    await bins.nth(1).focus();
    await page.keyboard.press("ArrowRight");
    await expect(bins.nth(2)).toBeFocused();
    await expect(bins.nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(strip).toContainText("No matching records in this covered bin.");
    await expect(page.getByRole("slider", { name: mobile ? /\(sheet\)/ : /Simulated time offset.*ahead$/ })).toHaveAttribute("aria-valuetext", "21 days ago");
    await bins.nth(6).click();
    await expect(strip).toContainText("Incomplete source coverage.");
    await strip.getByLabel("Minimum earthquake magnitude").selectOption("2.5");
    await expect(strip).toContainText("4 loaded records");
    await bins.nth(1).click();
    await expect(strip).toContainText("Known records only.");
    const stripBox = await strip.boundingBox();
    const slider = page.getByRole("slider", { name: mobile ? /\(sheet\)/ : /Simulated time offset.*ahead$/ });
    const sliderBox = await slider.boundingBox();
    expect(stripBox && sliderBox && stripBox.y + stripBox.height <= sliderBox.y).toBeTruthy();
    const sizes = await bins.evaluateAll((buttons) => buttons.map((button) => { const { width, height } = button.getBoundingClientRect(); return { width, height }; }));
    expect(sizes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await strip.getByRole("button", { name: "Fly to" }).first().click();
    await expect(page.locator("[data-globe-root] canvas").first()).toHaveAttribute("data-camera-flying", "true");
    await expect(page.locator("[data-globe-root] canvas").first()).toHaveAttribute("data-camera-flying", "false", { timeout: 10_000 });
  });
  for (const state of ["loading", "failed", "partial"] as const) test(`${state} never masquerades as zero events`, async ({ page }) => {
    const strip = await setupE4(page, state);
    if (state === "loading") await expect(strip).toContainText("Loading historical records, not zero events.");
    else if (state === "failed") {
      await expect(strip).toContainText("Counts are unknown.");
      await expect(strip.locator("[data-event-bin]")).toHaveCount(0);
    } else {
      await expect(strip).toContainText("1 loaded record");
      await strip.locator("[data-event-bin]").first().click();
      await expect(strip).toContainText("this is not a zero-event count.");
    }
  });
});
