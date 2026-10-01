import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, Route } from "@playwright/test";

/**
 * WAVE 2 LANE W1 (deep zoom + stitched NASA layers), end to end.
 * `e2e/globe.spec.ts` and `e2e/globe-L1.spec.ts` stay untouched (this lane's
 * own ownership rule) — this file is the tile engine's own acceptance: real
 * GIBS WMTS tile requests (mocked to tiny committed fixtures), a deeper
 * level requested once the camera zooms in, and an overlay's own tiles
 * requested once it's turned on via the catalog's own store effect
 * (`window.__GLOBE_TEST_SET_IMAGERY__` — LayerCatalog.tsx isn't wired into
 * LayerPanel's render yet, that's a different, parallel lane's job, so this
 * exercises the same store path it will eventually reach through).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const WMTS_DIR = join(FIXTURES, "wmts");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));
const GIBS_BASE_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-base.jpg"));
const GIBS_NIGHT_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-night.jpg"));
const GIBS_SEAICE_PNG = readFileSync(join(FIXTURES, "gibs", "gibs-seaice.png"));

const TILE_BASE_JPG = readFileSync(join(WMTS_DIR, "tile-base.jpg"));
const TILE_OVERLAY_PNG = readFileSync(join(WMTS_DIR, "tile-overlay.png"));

/** Parses a WMTS REST tile URL (gibsCatalog.ts's own `tileUrl` shape) into
 *  its (layer, level, row, col) so a test can reason about what got asked
 *  for, not just how many requests fired. */
function parseWmtsUrl(url: string): { layer: string; level: number; row: number; col: number } | null {
  const m = url.match(/\/wmts\/epsg4326\/best\/([^/]+)\/default\/(?:[^/]+\/)?[^/]+\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], level: Number(m[2]), row: Number(m[3]), col: Number(m[4]) };
}

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** The whole-globe imagery this lane draws on top of (EarthImagery.tsx, a
 *  different lane's own file) needs its own GIBS WMS fixtures or it falls
 *  back to the dot earth and this lane's tiles never mount (GlobeScene.tsx
 *  only renders TileLayer when `style === "imagery"`). */
async function withWholeGlobeFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: GIBS_SEAICE_PNG });
    const body = url.includes("Black_Marble") ? GIBS_NIGHT_JPG : url.includes("BlueMarble") ? GIBS_BASE_JPG : GIBS_DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

/** Routes every real WMTS tile request to a tiny committed fixture, and
 *  records the parsed (layer, level, row, col) of each one it served — this
 *  lane's own fixtures, distinct from the whole-globe WMS ones above. */
function withWmtsFixtures(page: Page): { requests: ReturnType<typeof parseWmtsUrl>[] } {
  const requests: ReturnType<typeof parseWmtsUrl>[] = [];
  const handler = (route: Route) => {
    const url = route.request().url();
    const parsed = parseWmtsUrl(url);
    if (parsed) requests.push(parsed);
    const body = url.endsWith(".png") ? TILE_OVERLAY_PNG : TILE_BASE_JPG;
    return route.fulfill({ contentType: url.endsWith(".png") ? "image/png" : "image/jpeg", body });
  };
  void page.route("https://gibs.earthdata.nasa.gov/wmts/**", handler);
  return { requests };
}

async function gotoLiveGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await withWholeGlobeFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  // The whole-globe imagery must actually be up first — TileLayer only
  // mounts once style is "imagery" (GlobeScene.tsx's own gate), and imagery
  // reaching "live" is the same signal globe-L1.spec.ts already waits on.
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
}

test("the base layer requests real GIBS WMTS tiles once the imagery earth is live", async ({ page }) => {
  const { requests } = withWmtsFixtures(page);
  await gotoLiveGlobe(page);
  await expect
    .poll(() => requests.length, { timeout: 15_000, message: "expected at least one WMTS tile request for the base layer" })
    .toBeGreaterThan(0);
  expect(requests.every((r) => r?.layer === "VIIRS_SNPP_CorrectedReflectance_TrueColor")).toBe(true);
});

test("zooming in requests a deeper (finer) tile level than the opening view", async ({ page }) => {
  const { requests } = withWmtsFixtures(page);
  await gotoLiveGlobe(page);
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const openingLevels = requests.map((r) => r!.level);
  const openingMaxLevel = Math.max(...openingLevels);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await expect(zoomIn).toBeVisible();
  const canvas = page.locator("[data-globe-root] canvas").first();
  // Poll the real camera seam; stop sending zoom intent at the floor so
  // the designed hold-to-open Street View gesture cannot steal this test.

  await expect
    .poll(
      async () => {
        const deeper = requests.filter((r) => r && r.level > openingMaxLevel);
        if (deeper.length === 0) {
          const distance = Number(await canvas.getAttribute("data-camera-distance") ?? NaN);
          const floor = Number(await canvas.getAttribute("data-camera-min-distance") ?? NaN);
          if (distance > floor + 0.01) await zoomIn.click();
        }
        return deeper.length;
      },
      { timeout: 15_000, message: `expected a tile request deeper than opening level ${openingMaxLevel}` },
    )
    .toBeGreaterThan(0);
});

test("adding an overlay via the catalog's own store effect requests that overlay's tiles", async ({ page }) => {
  const { requests } = withWmtsFixtures(page);
  await gotoLiveGlobe(page);
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  requests.length = 0; // only care about what the overlay itself causes from here

  await page.evaluate(() => {
    window.__GLOBE_TEST_SET_IMAGERY__?.({
      base: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      overlays: [{ id: "IMERG_Precipitation_Rate", opacity: 0.8 }],
    });
  });

  await expect
    .poll(
      () => requests.some((r) => r?.layer === "IMERG_Precipitation_Rate"),
      { timeout: 15_000, message: "expected an IMERG_Precipitation_Rate tile request after adding it as an overlay" },
    )
    .toBe(true);
});

// Break-it: prove the WMTS URL parser this suite's own assertions lean on
// actually reads the real shape gibsCatalog.ts's tileUrl() produces, so a
// silent regex typo can't make every assertion above vacuously pass on zero
// real matches.
test("break-it: the WMTS URL parser reads a real tileUrl() shape correctly", async () => {
  const parsed = parseWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-09-27/250m/6/30/10.jpg");
  expect(parsed).toEqual({ layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor", level: 6, row: 30, col: 10 });
  const staticParsed = parseWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/Coastlines_15m/default/15.625m/4/2/5.png");
  expect(staticParsed).toEqual({ layer: "Coastlines_15m", level: 4, row: 2, col: 5 });
  expect(parseWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS")).toBeNull();
});
