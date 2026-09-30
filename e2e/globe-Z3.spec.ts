import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

const scratch = "/private/tmp/claude-501/-Users-darkpandawarrior-Repos/740d63f5-5ee4-444c-898d-1c7247dd41ab/scratchpad/lanes/Z3";
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf8"));

async function openGlobe(page: Page) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
  await page.route("**/api/**", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    if (name === "weather") return route.fulfill({ json: fixture("weather-2026-09-24") });
    if (name === "tle" || name === "aircraft") return route.fulfill({ json: fixture(name) });
    if (name === "whereami") return route.fulfill({ json: fixture("whereami-IN") });
    return route.fulfill({ json: { connected: false, recent: [] } });
  });
  await page.route("https://earthquake.usgs.gov/**", route => route.fulfill({ json: {
    type: "FeatureCollection", features: [{ id: "z3-quake", properties: { mag: 6.5, place: "Z3 Test Trench", time: Date.parse("2026-09-27T11:00:00Z"), url: "https://earthquake.usgs.gov/" }, geometry: { type: "Point", coordinates: [73.8567, 30.5204, 12] } }],
  } }));
  await page.route("https://eonet.gsfc.nasa.gov/**", route => route.fulfill({ json: { events: [] } }));
  await page.route("https://www.gdacs.org/**", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://services.swpc.noaa.gov/**", route => route.abort());
  await page.route("https://ll.thespacedevs.com/**", route => route.fulfill({ json: { results: [] } }));
  await page.route("https://services*.arcgis.com/**", route => route.fulfill({ json: { features: [] } }));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });
}

for (const close of ["Escape", "Close"] as const) {
  test(`Inspector returns focus to the clicked live-feed control on ${close}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    const inspector = page.locator("[data-globe-inspector]");
    // Close the desktop's initial Pune selection before testing a new opening.
    await inspector.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Live", exact: true }).click();
    const opener = page.locator("[data-globe-feed-rail]").getByRole("button", { name: /Z3 Test Trench/ });
    await expect(opener).toBeVisible({ timeout: 15_000 });
    await opener.click();
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "Close", exact: true }).focus();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await inspector.getByRole("button", { name: "Close", exact: true }).click();
    await expect(inspector).toHaveCount(0);
    await expect(opener).toBeFocused();
    if (close === "Close") await page.screenshot({ path: `${scratch}/desktop-1440x900.png` });
  });
}

test("changing reduced motion stops the actual quake ripple buffers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGlobe(page);
  await expect.poll(() => page.evaluate(() => window.__Z3_QUAKE_MOTION__?.().ripples ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__Z3_QUAKE_MOTION__!().scale);
  await expect.poll(() => page.evaluate(() => window.__Z3_QUAKE_MOTION__!().scale)).not.toBe(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.__Z3_QUAKE_MOTION__!().ripples)).toBe(0);
  const resting = await page.evaluate(() => window.__Z3_QUAKE_MOTION__!().resting);
  expect(resting).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__Z3_QUAKE_MOTION__!())).toEqual({ resting, ripples: 0, scale: 0 });
});

test.describe("phone touch composition", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("captures the reduced-motion globe at 390x844", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    await expect.poll(() => page.locator("[data-subsolar-probe]").getAttribute("data-globe-x")).not.toBeNull();
    await page.screenshot({ path: `${scratch}/phone-390x844.png` });
  });
});
