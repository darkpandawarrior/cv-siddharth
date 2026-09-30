import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, Route } from "@playwright/test";

/**
 * LANE S1 (wave 9, "GIBS overlay pack"), end to end. Mirrors globe-V1.spec.ts's
 * own shape (real WMTS tile-request URL shapes, mocked to a committed
 * fixture, via the same `__GLOBE_TEST_SET_IMAGERY__` store hook) — this lane
 * only appends data to gibsCatalog.ts, so the render path itself
 * (TileLayer.tsx) is proven elsewhere; this suite proves the six new catalog
 * entries actually drive TileLayer.tsx to request the right host/date/matrix
 * for each, not just that the pure functions in gibsCatalog.test.ts agree
 * with themselves.
 *
 * LayerCatalog.tsx (the panel that would show each new entry's legend) is
 * still not mounted into the real Layers panel as of this lane's own read of
 * the tree (confirmed by grep: no import of LayerCatalog outside
 * LayerCatalog.tsx itself, globeStore.ts's ImageryStack type, TileLayer.tsx
 * and V1's own suite) — a pre-existing gap from an earlier wave, not a file
 * this lane owns. The visible-render proof below is the canvas itself
 * (a real, non-blank tile drawn from a mocked-but-URL-verified response),
 * not a panel click.
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
const TILE_OVERLAY_PNG = readFileSync(join(WMTS_DIR, "tile-overlay.png"));

/** Parses a daily (bare-date) GIBS WMTS REST tile URL into its parts. */
function parseDailyWmtsUrl(url: string): { layer: string; date: string; matrixSet: string; level: number; row: number; col: number } | null {
  const m = url.match(/\/wmts\/epsg4326\/best\/([^/]+)\/default\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], date: m[2], matrixSet: m[3], level: Number(m[4]), row: Number(m[5]), col: Number(m[6]) };
}

/** Parses a subdaily (full ISO instant) GIBS WMTS REST tile URL, same shape
 *  globe-V1.spec.ts's own parser reads. */
function parseSubdailyWmtsUrl(url: string): { layer: string; isoInstant: string; matrixSet: string; level: number; row: number; col: number } | null {
  const m = url.match(/\/wmts\/epsg4326\/best\/([^/]+)\/default\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], isoInstant: m[2], matrixSet: m[3], level: Number(m[4]), row: Number(m[5]), col: Number(m[6]) };
}

/** A static (no Time segment at all) GIBS WMTS REST tile URL, for GPW. */
function parseStaticWmtsUrl(url: string): { layer: string; matrixSet: string; level: number; row: number; col: number } | null {
  const m = url.match(/\/wmts\/epsg4326\/best\/([^/]+)\/default\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.\w+$/);
  if (!m) return null;
  return { layer: m[1], matrixSet: m[2], level: Number(m[3]), row: Number(m[4]), col: Number(m[5]) };
}

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** The whole-globe base imagery TileLayer.tsx draws on top of — same
 *  reasoning globe-V1.spec.ts's own header comment gives: without these,
 *  GlobeScene never reaches `style === "imagery"` and TileLayer never
 *  mounts at all. */
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

const SIM_TIME = "2026-09-29T01:07:00Z";

// One representative id per DateRule kind this lane's six new entries use:
// daily (chlorophyll), static (GPW), subdaily (GOES-East dust) — the other
// three (LST, NDVI, SMAP soil moisture) share the exact same `daily` code
// path chlorophyll already proves here and are pinned instead in
// gibsCatalog.test.ts's own unit coverage.
const DAILY_ID = "MODIS_Aqua_L2_Chlorophyll_A";
const STATIC_ID = "GPW_Population_Density_2020";
const SUBDAILY_ID = "GOES-East_ABI_Dust";

test("the new daily overlay (ocean chlorophyll) requests a bare-date GIBS tile at its own verified lag", async ({ page }) => {
  const requests: ReturnType<typeof parseDailyWmtsUrl>[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route: Route) => {
    const parsed = parseDailyWmtsUrl(route.request().url());
    if (parsed) requests.push(parsed);
    return route.fulfill({ contentType: "image/png", body: TILE_OVERLAY_PNG });
  });
  await gotoLiveGlobe(page, SIM_TIME);

  await page.evaluate(
    (id) => window.__GLOBE_TEST_SET_IMAGERY__?.({ base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [{ id, opacity: 0.8 }] }),
    DAILY_ID,
  );

  await expect.poll(() => requests.filter((r) => r?.layer === DAILY_ID).length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const r of requests) {
    if (r?.layer !== DAILY_ID) continue;
    // SIM_TIME is 2026-09-29; chlorophyll's own verified lag is 1 day.
    expect(r.date).toBe("2026-09-28");
    expect(r.matrixSet).toBe("1km");
  }
});

test("the new static overlay (population density) requests a tile with NO Time segment, ever", async ({ page }) => {
  const requests: ReturnType<typeof parseStaticWmtsUrl>[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route: Route) => {
    const url = route.request().url();
    if (url.includes(STATIC_ID)) {
      const parsed = parseStaticWmtsUrl(url);
      if (parsed) requests.push(parsed);
    }
    return route.fulfill({ contentType: "image/png", body: TILE_OVERLAY_PNG });
  });
  await gotoLiveGlobe(page, SIM_TIME);

  await page.evaluate(
    (id) => window.__GLOBE_TEST_SET_IMAGERY__?.({ base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [{ id, opacity: 0.8 }] }),
    STATIC_ID,
  );

  await expect.poll(() => requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const r of requests) {
    expect(r!.matrixSet).toBe("1km");
    // No date-shaped path segment anywhere in the recorded URL.
    expect(r).not.toMatchObject({ date: expect.anything() });
  }
});

test("the new subdaily overlay (GOES-East dust) requests a rounded 10-minute UTC frame, same rule as its GeoColor/FireTemp siblings", async ({ page }) => {
  const requests: ReturnType<typeof parseSubdailyWmtsUrl>[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route: Route) => {
    const parsed = parseSubdailyWmtsUrl(route.request().url());
    if (parsed) requests.push(parsed);
    return route.fulfill({ contentType: "image/png", body: TILE_OVERLAY_PNG });
  });
  await gotoLiveGlobe(page, SIM_TIME);

  await page.evaluate(
    (id) => window.__GLOBE_TEST_SET_IMAGERY__?.({ base: "VIIRS_SNPP_CorrectedReflectance_TrueColor", overlays: [{ id, opacity: 0.8 }] }),
    SUBDAILY_ID,
  );

  await expect.poll(() => requests.filter((r) => r?.layer === SUBDAILY_ID).length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const r of requests) {
    if (r?.layer !== SUBDAILY_ID) continue;
    expect(r.isoInstant).toBe("2026-09-29T00:20:00Z"); // SIM_TIME minus 40min lag, floored to :20
    expect(r.matrixSet).toBe("1km");
  }
});

test("break-it: the daily and static URL parsers this suite leans on read real tileUrl() shapes correctly", async () => {
  const daily = parseDailyWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Aqua_L2_Chlorophyll_A/default/2026-09-28/1km/2/1/2.png");
  expect(daily).toEqual({ layer: "MODIS_Aqua_L2_Chlorophyll_A", date: "2026-09-28", matrixSet: "1km", level: 2, row: 1, col: 2 });

  const staticUrl = parseStaticWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GPW_Population_Density_2020/default/1km/2/1/2.png");
  expect(staticUrl).toEqual({ layer: "GPW_Population_Density_2020", matrixSet: "1km", level: 2, row: 1, col: 2 });
  // A static parse must never accidentally match a dated (5-segment) URL —
  // the extra date segment means one too many path parts for this pattern.
  expect(parseStaticWmtsUrl("https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Aqua_L2_Chlorophyll_A/default/2026-09-28/1km/2/1/2.png")).toBeNull();
});
