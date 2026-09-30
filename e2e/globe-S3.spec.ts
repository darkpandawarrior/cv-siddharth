import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 9 LANE S3 (Open-Meteo marine/air-quality/flood hover readout). Every
 * feed routed to a fixture (G10 discipline, same as e2e/globe-V4.spec.ts --
 * this file's sibling for the SAME component). Assertions go through the
 * `__V4_HOVER__` seam HoverReadout.tsx already installs under `__W11_TEST__`
 * (unchanged by this lane), so they exercise the real fetch/parse/render
 * path without depending on the camera's exact screen projection.
 *
 * Deliberately NO `page.clock.setFixedTime` here (unlike globe-V4.spec.ts):
 * this lane's own throttle (HoverReadout.tsx's `pollCell`/`hoverFetchGate`)
 * is timed off the browser's real `Date.now()`, and none of this file's
 * assertions need a frozen wall clock -- freezing it would freeze the gate
 * forever after the first fetch, which is not what a real hover does.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const windFixture = JSON.parse(readFileSync(join(FIXTURES, "wind", "wind-2026-09-28.json"), "utf8"));
const GIBS_TILE_JPG = readFileSync(join(FIXTURES, "wmts", "tile-base.jpg"));
const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));

// Mumbai coast -- real marine/AQ data; Pune -- inland, marine returns nulls,
// AQ still answers, GloFAS still answers a river reading for the Mula-Mutha.
const MUMBAI = { lat: 19.076, lon: 72.8777 };
const PUNE = { lat: 18.5204, lon: 73.8567 };

const MARINE_READING = { current: { wave_height: 0.94, swell_wave_height: 0.66, swell_wave_period: 6.95 } };
const MARINE_NULL = { current: { wave_height: null, swell_wave_height: null, swell_wave_period: null } };
const AQ_READING = { current: { pm2_5: 34.7, us_aqi: 89, european_aqi: 51 } };
const FLOOD_READING = { daily: { river_discharge: [2.08] } };
const FLOOD_NULL = { daily: { river_discharge: [null] } };

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.__W11_TEST__ = true;
    try { window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1"); } catch { /* see globe-X5.spec.ts's own note */ }
  });
  // Playwright matches the MOST RECENTLY registered route first -- specific
  // overrides go last, same ordering discipline as globe-V4.spec.ts.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/wind", (route) => route.fulfill({ json: windFixture }));
  await page.route("https://earthquake.usgs.gov/**", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => route.fulfill({ contentType: "image/jpeg", body: GIBS_DAY_JPG }));
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => route.fulfill({ contentType: "image/jpeg", body: GIBS_TILE_JPG }));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__V4_HOVER__);
}

test("hovering a coastal point shows wave height, swell, air quality and river discharge, each naming Open-Meteo", async ({ page }) => {
  await page.route("https://marine-api.open-meteo.com/**", (route) => route.fulfill({ json: MARINE_READING }));
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: AQ_READING }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: FLOOD_READING }));
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);

  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();
  // The shared 1.5s gate (HoverReadout.tsx's `hoverFetchGate`) staggers the
  // three domains -- marine fires immediately, air-quality ~1.5s later,
  // flood ~1.5s after that. Timeouts are generous (well past the ideal
  // ~3s cascade) because this gate is real-wall-clock timed and this repo's
  // gate runs on a machine shared with up to five other lanes' own
  // build/test processes, which slows real time down, not just CPU-bound work.
  await expect(chip.locator("[data-hover-marine]")).toHaveText("0.9 m waves, 0.7 m swell @ 7 s · Open-Meteo", { timeout: 8000 });
  await expect(chip.locator("[data-hover-air-quality]")).toHaveText("AQI 89 US / 51 EU · PM2.5 35 µg/m³ · Open-Meteo", { timeout: 15000 });
  await expect(chip.locator("[data-hover-flood]")).toHaveText("2.1 m³/s river discharge · Open-Meteo", { timeout: 15000 });
});

test("hovering a landlocked point shows a graceful \"no marine data here\" state, not an error", async ({ page }) => {
  await page.route("https://marine-api.open-meteo.com/**", (route) => route.fulfill({ json: MARINE_NULL }));
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: AQ_READING }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: FLOOD_NULL }));
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), PUNE);

  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();
  await expect(chip.locator("[data-hover-marine]")).toHaveText("No marine data here · Open-Meteo", { timeout: 8000 });
  await expect(chip.locator("[data-hover-air-quality]")).toHaveText("AQI 89 US / 51 EU · PM2.5 35 µg/m³ · Open-Meteo", { timeout: 15000 });
  await expect(chip.locator("[data-hover-flood]")).toHaveText("No river data here · Open-Meteo", { timeout: 15000 });
});

test("moving across many cells rate limits each Open-Meteo host to one request per 1.5s", async ({ page }) => {
  // Capture at browser fetch time: IPC delivery can compress Node timestamps.
  // https://open-meteo.com/en/terms allows 600 calls/min. Four hover hosts
  // at 1 request/1.5s each cap one visitor at 160/min before cell caching.
  await page.addInitScript(() => {
    const times: { host: string; at: number }[] = [];
    (window as unknown as { __s3RequestTimes: typeof times }).__s3RequestTimes = times;
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const url = String(args[0]);
      if (/^https:\/\/(marine|air-quality|flood)-api\.open-meteo\.com\//.test(url)) times.push({ host: new URL(url).host, at: performance.now() });
      return originalFetch(...args);
    };
  });
  await page.route("https://marine-api.open-meteo.com/**", (route) => route.fulfill({ json: MARINE_READING }));
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: AQ_READING }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: FLOOD_READING }));
  await openGlobe(page);

  // Eight cells, each beyond the 0.5deg rounding boundary. Independent
  // hosts can start together; each host still has its own 1.5s budget.
  const deadline = Date.now() + 5000;
  let i = 0;
  while (Date.now() < deadline) {
    await page.evaluate((p) => window.__V4_HOVER__!.move(p), { lat: MUMBAI.lat + (i % 8) * 2, lon: MUMBAI.lon });
    i++;
    await page.waitForTimeout(100);
  }

  const requestTimes = await page.evaluate(() => (window as unknown as { __s3RequestTimes: { host: string; at: number }[] }).__s3RequestTimes);
  expect(requestTimes.length).toBeGreaterThanOrEqual(2);
  for (const host of new Set(requestTimes.map(request => request.host))) {
    const times = requestTimes.filter(request => request.host === host).map(request => request.at).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(1450);
    }
  }
});

test("the same rounded cell is fetched once -- repeat hovers reuse the cached reading, no new request", async ({ page }) => {
  let marineRequests = 0;
  await page.route("https://marine-api.open-meteo.com/**", (route) => { marineRequests++; route.fulfill({ json: MARINE_READING }); });
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: AQ_READING }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: FLOOD_READING }));
  await openGlobe(page);

  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  await expect(page.locator("[data-hover-marine]")).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => window.__V4_HOVER__!.leave());
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), { lat: MUMBAI.lat + 0.01, lon: MUMBAI.lon + 0.01 }); // same ~55km cell
  await expect(page.locator("[data-hover-marine]")).toBeVisible();

  expect(marineRequests).toBe(1);
});
