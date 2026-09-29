import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { localTime } from "../src/world/globe/exploreMath.ts";
import { buildWindField, sampleWind } from "../src/world/globe/layers/windField.ts";
import { windLabel } from "../src/world/globe/ui/hoverReadout.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 7 LANE V4 (hover readout) -- e2e. Fixed clock, every feed routed to a
 * committed fixture (G10). Content assertions go through the `__V4_HOVER__`
 * seam (the W11 pattern -- CountryLayer.tsx's own `__W11_COUNTRY__`): it
 * feeds a lat/lon straight to the same code path a real hover runs, so the
 * assertions don't depend on reverse-engineering the camera's exact screen
 * projection. The "0 network requests" case instead drives real
 * `page.mouse.move` calls over the canvas, since that assertion cares about
 * request counts, not which lat/lon a given pixel happens to land on.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const windFixture = JSON.parse(readFileSync(join(FIXTURES, "wind", "wind-2026-09-28.json"), "utf8"));

// Mumbai -- safely inside India's coarse Natural Earth polygon, and far from
// any border a 110m simplification could round differently.
const MUMBAI = { lat: 19.076, lon: 72.8777 };
const NOW = new Date("2026-09-28T12:00:00+05:30");

const NEAR_QUAKE = { id: "near", properties: { mag: 5.5, place: "near Mumbai fixture", time: NOW.getTime(), url: "" }, geometry: { type: "Point", coordinates: [MUMBAI.lon + 0.1, MUMBAI.lat + 0.1, 10] } };
// New York -- thousands of km from Mumbai, well past the 300km cutoff.
const FAR_QUAKE = { id: "far", properties: { mag: 6.1, place: "far NYC fixture", time: NOW.getTime(), url: "" }, geometry: { type: "Point", coordinates: [-74.006, 40.7128, 10] } };

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => { window.__W11_TEST__ = true; });
  // Playwright dispatches to the MOST RECENTLY registered matching route
  // first, so the specific overrides go last -- a catch-all registered
  // after `**/api/wind` would otherwise win and 503 it too.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/wind", (route) => route.fulfill({ json: windFixture }));
  await page.route("https://earthquake.usgs.gov/**", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [NEAR_QUAKE, FAR_QUAKE] } }));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__V4_HOVER__);
}

test("hovering a point in India shows country, solar time, wind and the nearest quake", async ({ page }) => {
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);

  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();
  await expect(chip.locator("[data-hover-country]")).toHaveText("India");
  await expect(chip.locator("[data-hover-time]")).toHaveText(localTime(NOW, MUMBAI.lon));

  const field = buildWindField(windFixture.grid, windFixture.u, windFixture.v);
  const w = sampleWind(field, MUMBAI.lat, MUMBAI.lon);
  const { speed, compass } = windLabel(w.u, w.v);
  const expectedWind = compass === "calm" ? "Calm" : `${speed.toFixed(1)} m/s toward ${compass}`;
  await expect(chip.locator("[data-hover-wind]")).toHaveText(expectedWind);

  // NEAR_QUAKE sits ~15.7km from Mumbai (0.1deg lat+lon at this latitude);
  // FAR_QUAKE (New York) is outside the 300km cutoff and must not win.
  await expect(chip.locator("[data-hover-quake]")).toHaveText(/^M5\.5 · \d+ km away$/);

  await page.evaluate(() => window.__V4_HOVER__!.leave());
  await expect(chip).toHaveCount(0);
});

test("50 pointer moves over the globe trigger zero network requests", async ({ page }) => {
  await openGlobe(page);
  // Warm up the one-time country index fetch (same-origin, not `/api/**` or
  // `https://`, so untouched by this file's own routes) before the count
  // starts, matching the plan's "zero requests per hover" -- the initial
  // load is a mount-time cost, not a per-move one.
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  await expect(page.locator("[data-hover-readout]")).toBeVisible();

  let requests = 0;
  page.on("request", () => { requests++; });
  const canvas = page.locator("[data-globe-root] canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  for (let i = 0; i < 50; i++) {
    await page.mouse.move(box.x + box.width / 2 + (i % 20) - 10, box.y + box.height / 2 + (i % 14) - 7);
  }
  expect(requests).toBe(0);
});

test("the chip hides while dragging (the button-held guard), then reappears on release", async ({ page }) => {
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();

  const canvas = page.locator("[data-globe-root] canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy); // a real drag: surfaceHover's own guard, broken by an actual orbit drag
  await expect(chip).toHaveCount(0);
  await page.mouse.up();

  // Guard restored: a fresh hover (not a drag) shows the chip again.
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  await expect(chip).toBeVisible();
});
