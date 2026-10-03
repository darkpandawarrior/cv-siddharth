import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE Q1 (wave 9, P1): earth rendering core — tier-2 antialiasing, the
 * sea-ice colour-space fix, tile mipmaps/anisotropy, star DPR scaling,
 * atmosphere/haze dithering, and the TileLayer/EarthImagery fetch-race fix.
 * Fixed clock, every /api/* route mocked (G10, same discipline as
 * e2e/globe.spec.ts). GIBS itself is mocked here too (e2e/globe-W1.spec.ts's
 * own fixture set, reused) — this lane needs `style: "imagery"` actually
 * live, not just the dot fallback, to exercise GlobePost/TileLayer at all.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));
const GIBS_BASE_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-base.jpg"));
const GIBS_NIGHT_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-night.jpg"));
const GIBS_SEAICE_PNG = readFileSync(join(FIXTURES, "gibs", "gibs-seaice.png"));
const GIBS_RELIEF_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-relief.jpg"));
const TILE_BASE_JPG = readFileSync(join(FIXTURES, "wmts", "tile-base.jpg"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** Same WMS fixture routing as e2e/globe-W1.spec.ts's own
 *  `withWholeGlobeFixtures` — the whole-globe day/base/night/ice/relief
 *  images EarthImagery.tsx fetches to leave the dot fallback. */
async function withWholeGlobeFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: GIBS_SEAICE_PNG });
    if (url.includes("ASTER_GDEM")) return route.fulfill({ contentType: "image/jpeg", body: GIBS_RELIEF_JPG });
    const body = url.includes("Black_Marble") ? GIBS_NIGHT_JPG : url.includes("BlueMarble") ? GIBS_BASE_JPG : GIBS_DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

/** Seeds the "already seen" intro flag before the app's own scripts run, so
 *  a rendering-focused test isn't also fighting the cinematic first-visit
 *  camera intro (cameraIntro.ts's own SEEN_KEY, same seam
 *  e2e/globe-X5.spec.ts uses). */
async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has — a blocked localStorage just
      // means the intro plays again, not a reason to fail an unrelated test.
    }
  });
}

async function gotoLiveGlobe(page: Page, width: number, height: number) {
  await forceDeviceTier(page, width <= 820 ? 2 : 1);
  await seedIntroSeen(page);
  await page.setViewportSize({ width, height });
  await withApiFixtures(page);
  await withWholeGlobeFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  // The whole-globe imagery must actually be live — GlobePost/TileLayer only
  // mount once style is "imagery" AND tier !== 3 (GlobeScene.tsx's own gate).
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
}

test("tier 2 (phone viewport): the bloom composer mounts SMAA, not just tier 1", async ({ page }) => {
  // Tier 2 used to omit SMAA. Keep this branch explicit under software WebGL.
  await gotoLiveGlobe(page, 390, 844);
  const composer = page.locator("[data-globe-composer]");
  await expect(composer).toHaveAttribute("data-globe-composer", "bloom", { timeout: 30_000 });
  await expect(composer).toHaveAttribute("data-globe-composer-smaa", "1");
});

test("tier 1 (desktop): the bloom composer still mounts SMAA", async ({ page }) => {
  await gotoLiveGlobe(page, 1440, 900);
  const composer = page.locator("[data-globe-composer]");
  await expect(composer).toHaveAttribute("data-globe-composer", "bloom", { timeout: 30_000 });
  await expect(composer).toHaveAttribute("data-globe-composer-smaa", "1");
});

test("TileLayer's first tile request never fires before the whole-globe day image is live", async ({ page }) => {
  await forceDeviceTier(page, 1);
  // perf.md: TileLayer and EarthImagery used to race the same region at two
  // resolutions. With the fetch-race fix, TileLayer's own recompute (and so
  // its first fetch) is gated on `status.earth` being "live" or "failed" —
  // this asserts the DOM's own `data-earth-style` already reads "imagery"
  // (never "dots"/loading) at the moment the very first WMTS tile request is
  // observed, which is only true if the gate actually held.
  await seedIntroSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await withWholeGlobeFixtures(page);

  let firstWmtsEarthStyle: string | null | undefined;
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", async (route) => {
    if (firstWmtsEarthStyle === undefined) {
      firstWmtsEarthStyle = await page
        .locator("[data-earth-style]")
        .first()
        .getAttribute("data-earth-style")
        .catch(() => null);
    }
    return route.fulfill({ contentType: "image/jpeg", body: TILE_BASE_JPG });
  });

  await page.clock.setFixedTime(new Date("2026-09-27T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
  // Give TileLayer's rate-limited recompute (RECOMPUTE_MIN_INTERVAL_MS) a
  // few frames to actually fire its first request.
  await expect.poll(() => firstWmtsEarthStyle, { timeout: 15_000 }).not.toBe(undefined);

  expect(firstWmtsEarthStyle, "TileLayer's first tile request fired before the whole-globe day image was live").toBe("imagery");
});
