import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise animated quake buffers before reduced motion on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 1);
});

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf8"));

async function openGlobe(page: Page) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  const time = new Date("2026-09-27T12:00:00Z");
  // Installed clocks control performance.now during the synchronous tier
  // benchmark. Keep callbacks running until hydration and Canvas are ready.
  await page.clock.install({ time });
  await page.route("**/api/**", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    if (name === "weather") return route.fulfill({ json: fixture("weather-2026-09-24") });
    if (name === "tle" || name === "aircraft") return route.fulfill({ json: fixture(name) });
    if (name === "whereami") return route.fulfill({ json: fixture("whereami-IN") });
    // Unmocked feeds are unavailable, never a successful body with the wrong schema.
    return route.abort();
  });
  await page.route("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson", route => route.fulfill({ json: {
    type: "FeatureCollection", features: [{ id: "z3-quake", properties: { mag: 6.5, place: "Z3 Test Trench", time: Date.parse("2026-09-27T11:00:00Z"), url: "https://earthquake.usgs.gov/" }, geometry: { type: "Point", coordinates: [73.8567, 30.5204, 12] } }],
  } }));
  await page.route("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson", route => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await page.route("https://eonet.gsfc.nasa.gov/**", route => route.fulfill({ json: { events: [] } }));
  await page.route("https://www.gdacs.org/**", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://services.swpc.noaa.gov/**", route => route.abort());
  await page.route("https://ll.thespacedevs.com/**", route => route.fulfill({ json: { results: [] } }));
  await page.route("https://services*.arcgis.com/**", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://mapservices.weather.noaa.gov/**", route => route.fulfill({ json: { features: [] } }));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.quakes ?? 0), { timeout: 30_000 }).toBe(1);
}

test("the initial Pune selection has a reachable Close button", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGlobe(page);
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Close", exact: true }).click();
  await expect(inspector).toHaveCount(0);
});

for (const close of ["Escape", "Close"] as const) {
  test(`Inspector returns focus to the clicked live-feed control on ${close}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    const inspector = page.locator("[data-globe-inspector]");
    // Replace Pune while its Inspector is still open: closing it first
    // would miss the selection-ID focus regression.
    await expect(inspector).toBeVisible();
    await page.getByRole("tab", { name: "Live", exact: true }).click();
    const opener = page.locator("[data-globe-feed-rail]").getByRole("button", { name: /Z3 Test Trench/ });
    await expect(opener).toBeVisible({ timeout: 15_000 });
    await opener.click();
    await expect(inspector.getByRole("heading", { name: /Z3 Test Trench/ })).toBeVisible();
    await inspector.getByRole("button", { name: "Close", exact: true }).focus();
    if (close === "Escape") await page.keyboard.press("Escape");
    else await inspector.getByRole("button", { name: "Close", exact: true }).click();
    await expect(inspector).toHaveCount(0);
    await expect(opener).toBeFocused();
    if (close === "Close") await page.screenshot({ path: testInfo.outputPath("desktop-1440x900.png") });
  });
}

test("changing reduced motion stops the actual quake ripple buffers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openGlobe(page);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.evaluate(() => window.__HAZARD_DEBUG__?.quakes ?? 0);
  }, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.evaluate(() => window.__Z3_QUAKE_MOTION__?.().ripples ?? 0);
  }, { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__Z3_QUAKE_MOTION__!().scale);
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.evaluate(() => window.__Z3_QUAKE_MOTION__!().scale);
  }).not.toBe(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.__Z3_QUAKE_MOTION__!().ripples)).toBe(0);
  const resting = await page.evaluate(() => window.__Z3_QUAKE_MOTION__!().resting);
  expect(resting).toBeGreaterThan(0);
  await page.clock.runFor(600);
  expect(await page.evaluate(() => window.__Z3_QUAKE_MOTION__!())).toEqual({ resting, ripples: 0, scale: 0 });
});

test.describe("phone touch composition", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("captures the reduced-motion globe at 390x844", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    await expect.poll(() => page.locator("[data-subsolar-probe]").getAttribute("data-globe-x")).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath("phone-390x844.png") });
  });

  test("Layers, Time and Tour replace each other on touch", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    const sheets = ["layer", "time", "tour"];
    for (const [index, name] of ["Open the layers sheet", "Open the time sheet", "Open the guided tour", "Open the layers sheet"].entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      for (const [sheetIndex, sheet] of sheets.entries()) {
        const panel = page.locator(`[data-globe-${sheet}-sheet]`);
        if (sheetIndex === index % 3) await expect(panel).toBeVisible();
        else await expect(panel).toBeHidden();
      }
      await expect(page.locator("[data-globe-inspector-sheet]")).toHaveCount(0);
    }
  });
});
