import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, Route } from "@playwright/test";

// Exercise subdaily and EOX tile requests on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

/**
 * LANE V1 (wave 7, "Lane 1: near-live geostationary imagery, then a sharp
 * deep-zoom base"), end to end. Mirrors globe-W1.spec.ts's own shape (the
 * lane that first built TileLayer.tsx/the GIBS catalog) — real WMTS tile
 * requests, mocked to committed fixtures, so this suite proves the actual
 * URL shape/timestamp/host TileLayer.tsx builds, not just the pure functions
 * gibsCatalog.test.ts already covers in isolation.
 *
 * LayerCatalog.tsx (the panel a visitor would read "feed unavailable" or the
 * EOX attribution text from) is still not wired into LayerPanel's own render
 * — a different, parallel lane's job, same as globe-W1.spec.ts's own header
 * comment notes for the overlay-toggle UI. This suite reaches the same
 * store path that UI will eventually read through
 * (`__GLOBE_TEST_GET_IMAGERY_STATUS__`, mirroring `__GLOBE_TEST_SET_IMAGERY__`),
 * rather than waiting on that wiring; the exact visible strings (frame UTC
 * time, the EOX attribution text) are pinned in gibsCatalog.test.ts instead,
 * since there is no rendered panel here to read them from yet.
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

/** Parses a subdaily GIBS WMTS REST tile URL (gibsCatalog.ts's own `tileUrl`
 *  shape for a `subdaily` DateRule) into its (layer, isoInstant, matrixSet,
 *  level, row, col). */
function parseSubdailyWmtsUrl(url: string): { layer: string; isoInstant: string; matrixSet: string; level: number; row: number; col: number } | null {
  const m = url.match(/\/wmts\/epsg4326\/best\/([^/]+)\/default\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], isoInstant: m[2], matrixSet: m[3], level: Number(m[4]), row: Number(m[5]), col: Number(m[6]) };
}

/** Parses an EOX WMTS REST tile URL (gibsCatalog.ts's own `tileUrl` shape
 *  for a `provider: "eox"` entry) into its (layer, matrixSet, level, row, col)
 *  — deliberately a DIFFERENT shape than the GIBS parser above: no Time
 *  segment, a "wmts/1.0.0" path prefix, a different host. */
function parseEoxWmtsUrl(url: string): { layer: string; matrixSet: string; level: number; row: number; col: number } | null {
  const m = url.match(/^https:\/\/tiles\.maps\.eox\.at\/wmts\/1\.0\.0\/([^/]+)\/default\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], matrixSet: m[2], level: Number(m[3]), row: Number(m[4]), col: Number(m[5]) };
}

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** The whole-globe imagery TileLayer.tsx draws on top of (EarthImagery.tsx,
 *  a different lane's own file) needs its own GIBS WMS fixtures or it falls
 *  back to the dot earth and TileLayer never mounts (GlobeScene.tsx only
 *  renders it when `style === "imagery"`) — same reasoning globe-W1.spec.ts's
 *  own header comment gives. */
async function withWholeGlobeFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: GIBS_SEAICE_PNG });
    const body = url.includes("Black_Marble") ? GIBS_NIGHT_JPG : url.includes("BlueMarble") ? GIBS_BASE_JPG : GIBS_DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

async function gotoLiveGlobe(page: Page, fixedTime: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await withWholeGlobeFixtures(page);
  await page.clock.setFixedTime(new Date(fixedTime));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
}

test("a subdaily GOES overlay requests tiles with a rounded 10-minute UTC frame time, within 60 minutes of the simulated clock", async ({ page }) => {
  const requests: ReturnType<typeof parseSubdailyWmtsUrl>[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route: Route) => {
    const url = route.request().url();
    const parsed = parseSubdailyWmtsUrl(url);
    if (parsed) requests.push(parsed);
    return route.fulfill({ contentType: "image/png", body: TILE_OVERLAY_PNG });
  });
  const SIM_TIME = "2026-09-29T01:07:00Z"; // acceptance example: -> 2026-09-29T00:20:00Z
  await gotoLiveGlobe(page, SIM_TIME);

  await page.evaluate(() => {
    window.__GLOBE_TEST_SET_IMAGERY__?.({
      base: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      overlays: [{ id: "GOES-East_ABI_Band13_Clean_Infrared", opacity: 0.8 }],
    });
  });

  await expect
    .poll(() => requests.filter((r) => r?.layer === "GOES-East_ABI_Band13_Clean_Infrared").length, { timeout: 15_000 })
    .toBeGreaterThan(0);

  const simMs = new Date(SIM_TIME).getTime();
  for (const r of requests) {
    if (r?.layer !== "GOES-East_ABI_Band13_Clean_Infrared") continue;
    expect(r.isoInstant, "GIBS's own REST shape: rounded to a 10-minute mark").toMatch(/T\d{2}:[0-5]0:00Z$/);
    const ageMin = (simMs - new Date(r.isoInstant).getTime()) / 60_000;
    expect(ageMin, `frame ${r.isoInstant} is more than 60 minutes from the simulated clock ${SIM_TIME}`).toBeLessThanOrEqual(60);
    expect(ageMin).toBeGreaterThanOrEqual(0);
  }
});

test("break-it: a subdaily layer stuck 404ing steps back up to 3 times, then reports 'feed unavailable' — never a stale frame", async ({ page }) => {
  // 45s poll below + setup/navigation overhead exceeds Playwright's 30s
  // default test timeout; this file sets no per-test override otherwise.
  test.setTimeout(60_000);
  const requestedInstants = new Set<string>();
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route: Route) => {
    const url = route.request().url();
    const parsed = parseSubdailyWmtsUrl(url);
    // Every GOES-East IR request 404s, whatever timestamp it asks for — the
    // "this exact frame was never published" case the brief names.
    if (parsed?.layer === "GOES-East_ABI_Band13_Clean_Infrared") {
      requestedInstants.add(parsed.isoInstant);
      return route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
    }
    return route.fulfill({ contentType: "image/png", body: TILE_OVERLAY_PNG });
  });
  await gotoLiveGlobe(page, "2026-09-29T01:07:00Z");

  await page.evaluate(() => {
    window.__GLOBE_TEST_SET_IMAGERY__?.({
      base: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      overlays: [{ id: "GOES-East_ABI_Band13_Clean_Infrared", opacity: 0.8 }],
    });
  });

  // 45s, not 20s: 4 generations (initial + 3 step-backs) of a whole role's own
  // tile set (about a dozen 404 round trips each at the opening view) really
  // do settle in ~8s standalone (verified with a throwaway trace script this
  // lane's report links), but this suite runs alongside five other lanes'
  // own build/test/playwright processes on one shared machine — a 20s poll
  // genuinely timed out here under that real, measured contention (host load
  // average 27 to 117 during this lane's own gate run) despite the retry
  // logic itself being correct, not because the logic is slow.
  await expect
    .poll(
      () => page.evaluate(() => window.__GLOBE_TEST_GET_IMAGERY_STATUS__?.("GOES-East_ABI_Band13_Clean_Infrared")),
      { timeout: 45_000, message: "expected the layer to eventually report failed after exhausting its step-back retries" },
    )
    .toMatchObject({ state: "failed", detail: "feed unavailable" });

  // Proves the retries actually stepped BACK (not the same timestamp
  // hammered over and over): the initial frame plus up to 3 ten-minute
  // step-backs is at most 4 distinct instants for this one role.
  expect(requestedInstants.size).toBeGreaterThan(1);
  expect(requestedInstants.size).toBeLessThanOrEqual(4);

  // Never a stale frame shown silently: the request count settles (the
  // backoff loop actually stopped) rather than growing forever.
  const countAfterSettling = requestedInstants.size;
  await page.waitForTimeout(1000);
  expect(requestedInstants.size).toBe(countAfterSettling);
});

test("the EOX deep-zoom base requests the real tiles.maps.eox.at WGS84 matrix, and zooming in requests a finer level", async ({ page }) => {
  // Two chained 15s polls plus zoom-click waits and initial navigation
  // exceed the 30s default; measured under real host contention (see the
  // 404-backoff test above for the same story) even 90s wasn't always
  // enough alongside five other lanes' own concurrent build/test load
  // (host load average 27 to 117, this lane's own report), so this one
  // takes a wider margin than its 60s peer.
  test.setTimeout(120_000);
  const requests: ReturnType<typeof parseEoxWmtsUrl>[] = [];
  await page.route("https://tiles.maps.eox.at/**", (route: Route) => {
    const parsed = parseEoxWmtsUrl(route.request().url());
    if (parsed) requests.push(parsed);
    return route.fulfill({ contentType: "image/jpeg", body: TILE_BASE_JPG });
  });
  await gotoLiveGlobe(page, "2026-09-29T01:07:00Z");

  await page.evaluate(() => {
    window.__GLOBE_TEST_SET_IMAGERY__?.({ base: "s2cloudless", overlays: [] });
  });

  await expect.poll(() => requests.length, { timeout: 15_000, message: "expected at least one EOX WGS84 tile request for the s2cloudless base" }).toBeGreaterThan(0);
  expect(requests.every((r) => r?.layer === "s2cloudless" && r.matrixSet === "WGS84")).toBe(true);

  const openingMaxLevel = Math.max(...requests.map((r) => r!.level));
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await expect(zoomIn).toBeVisible();
  const canvas = page.locator("[data-globe-root] canvas").first();
  // Poll the real camera seam; stop sending zoom intent at the floor so
  // the designed hold-to-open Street View gesture cannot steal this test.

  await expect
    .poll(async () => {
      const deeper = requests.filter((r) => r && r.level > openingMaxLevel);
      if (deeper.length === 0) {
        const distance = Number(await canvas.getAttribute("data-camera-distance") ?? NaN);
        const floor = Number(await canvas.getAttribute("data-camera-min-distance") ?? NaN);
        if (distance > floor + 0.01) await zoomIn.click();
      }
      return deeper.length;
    }, { timeout: 15_000, message: `expected a tile deeper than opening level ${openingMaxLevel}` })
    .toBeGreaterThan(0);
});

// Break-it: prove both URL parsers this suite leans on actually read the real
// shapes gibsCatalog.ts's own tileUrl() produces, so a regex typo can't make
// every assertion above vacuously pass on zero real matches.
test("break-it: the subdaily and EOX URL parsers read real tileUrl() shapes correctly", async () => {
  const subdaily = parseSubdailyWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GOES-East_ABI_Band13_Clean_Infrared/default/2026-09-29T00:20:00Z/2km/2/1/2.png");
  expect(subdaily).toEqual({ layer: "GOES-East_ABI_Band13_Clean_Infrared", isoInstant: "2026-09-29T00:20:00Z", matrixSet: "2km", level: 2, row: 1, col: 2 });
  expect(parseSubdailyWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/Coastlines_15m/default/15.625m/4/2/5.png")).toBeNull();

  const eox = parseEoxWmtsUrl("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/13/3253/11554.jpg");
  expect(eox).toEqual({ layer: "s2cloudless", matrixSet: "WGS84", level: 13, row: 3253, col: 11554 });
  expect(parseEoxWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/s2cloudless/default/WGS84/13/3253/11554.jpg")).toBeNull();
});
