import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE S2 (wave 9, space weather), end to end. Fixed clock, every external
 * feed this lane touches routed to a committed fixture (G10, same
 * discipline as e2e/globe-L7.spec.ts). Intro seeded seen so the cinematic
 * first-visit camera doesn't fight these assertions (e2e/globe-X5.spec.ts's
 * own pattern).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const weatherFixture = fixture("weather-2026-09-24.json");
const tleFixture = fixture("tle.json");
const aircraftFixture = fixture("aircraft.json");
const whereamiFixture = fixture("whereami-IN.json");
const xraysFixture = fixture("hazards/xrays.json");
const protonsFixture = fixture("hazards/protons.json");
const windSpeedFixture = fixture("hazards/solar-wind-speed.json");
const windMagFixture = fixture("hazards/solar-wind-mag.json");

const XRAY_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json";
const PROTON_URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json";
const SOLAR_WIND_SPEED_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json";
const SOLAR_WIND_MAG_URL = "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json";

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

async function withSpaceWeatherFixtures(page: Page) {
  await page.route(XRAY_URL, (route) => route.fulfill({ json: xraysFixture }));
  await page.route(PROTON_URL, (route) => route.fulfill({ json: protonsFixture }));
  await page.route(SOLAR_WIND_SPEED_URL, (route) => route.fulfill({ json: windSpeedFixture }));
  await page.route(SOLAR_WIND_MAG_URL, (route) => route.fulfill({ json: windMagFixture }));
}

async function abortSpaceWeatherFeeds(page: Page) {
  for (const url of [XRAY_URL, PROTON_URL, SOLAR_WIND_SPEED_URL, SOLAR_WIND_MAG_URL]) {
    await page.route(url, (route) => route.abort());
  }
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has -- a blocked localStorage just
      // means the intro plays again, not a reason to fail this test.
    }
  });
}

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedIntroSeen(page);
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-29T19:40:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
}

async function openLiveTab(page: Page) {
  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  await panel.locator('[data-feed-tab="live"]').click();
}

test("shows a live flare class, proton scale and solar-wind readout from the real NOAA SWPC shapes", async ({ page }) => {
  await withSpaceWeatherFixtures(page);
  await openGlobe(page);

  const status = page.locator('[data-space-weather-status="live"]');
  await expect(status).toBeVisible({ timeout: 15_000 });
  // xrays.json's latest 0.1-0.8nm row (1.2e-5 W/m^2) classifies M1.2;
  // protons.json's latest >=10 MeV row (15.5 pfu) classifies S1; the two
  // summary fixtures are the fixed 420 km/s / -6 nT single readings.
  await expect(status).toHaveText("X-ray M1.2 · protons S1 · wind 420 km/s · Bz -6 nT");
});

test("publishes an M-class flare to the live feed rail, sourced to NOAA SWPC", async ({ page }) => {
  await withSpaceWeatherFixtures(page);
  await openGlobe(page);

  await expect(page.locator('[data-space-weather-status="live"]')).toBeVisible({ timeout: 15_000 });
  await openLiveTab(page);
  const list = page.locator("[data-globe-feed-rail] [data-feed-list]");
  await expect(list.getByText("M1.2 X-ray flare")).toBeVisible();
});

test("reports failed, draws no fabricated reading, when every space-weather feed is unreachable", async ({ page }) => {
  await abortSpaceWeatherFeeds(page);
  await openGlobe(page);

  const status = page.locator('[data-space-weather-status="failed"]');
  await expect(status).toBeVisible({ timeout: 15_000 });
  await expect(status).toHaveText("Space weather feed unreachable");
  // Never a stale/fabricated live reading alongside the failure state.
  await expect(page.locator('[data-space-weather-status="live"]')).toHaveCount(0);
});
