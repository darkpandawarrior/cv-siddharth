import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 7 LANE V5 (hurricane forecast cones, step A) -- e2e. Fixed clock,
 * every external feed this lane touches routed to a committed fixture
 * (G10: under `vite preview` there is no real /api proxy for these, and even
 * if there were, a required gate never hits a live network). The globe's
 * cinematic first-visit intro is seeded past (globe-lanes.md's own rule) so
 * it never fights this spec's own assertions.
 *
 * `hazards` is on by default (globeStore.ts), so /globe mounts HazardLayer
 * -- and starts the NHC cone poll -- on its own; no extra toggle click
 * needed to satisfy "when the hazards layer is on".
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/hazards");
const quakesFixture = JSON.parse(readFileSync(join(FIXTURES, "quakes.json"), "utf8"));
const eonetFixture = JSON.parse(readFileSync(join(FIXTURES, "eonet.json"), "utf8"));
const gdacsFixture = JSON.parse(readFileSync(join(FIXTURES, "gdacs.json"), "utf8"));
const ovationFixture = JSON.parse(readFileSync(join(FIXTURES, "ovation.json"), "utf8"));
const kpFixture = JSON.parse(readFileSync(join(FIXTURES, "kp.json"), "utf8"));
const launchesFixture = JSON.parse(readFileSync(join(FIXTURES, "launches.json"), "utf8"));
const nhcConeFixture = JSON.parse(readFileSync(join(FIXTURES, "nhc-cone.json"), "utf8"));
const nhcEmptyFixture = JSON.parse(readFileSync(join(FIXTURES, "nhc-empty.json"), "utf8"));

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events**";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**";
const NHC_MAPSERVER_GLOB = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer/**";
// The one cone layer this spec routes an active storm into -- must match
// one of feedUrls.ts's own NHC_CONE_LAYER_IDS (8 = "AT1 Forecast Cone").
const ACTIVE_LAYER_ID = "/MapServer/8/";

async function withBaseHazardFixtures(page: Page) {
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: quakesFixture }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.fulfill({ json: ovationFixture }));
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: launchesFixture }));
}

/** Routes every one of the 15 NHC cone sub-layer queries with one handler:
 *  `ACTIVE_LAYER_ID` gets the one-storm fixture, every other slot answers
 *  the real service's own shape for an inactive slot (an empty
 *  FeatureCollection, not an error). */
async function routeNhc(page: Page, activeFixture: unknown) {
  await page.route(NHC_MAPSERVER_GLOB, (route) => {
    const json = route.request().url().includes(ACTIVE_LAYER_ID) ? activeFixture : nhcEmptyFixture;
    return route.fulfill({ json });
  });
}

type HazardDebug = {
  quakes: number;
  status: { state: string; detail?: string };
  nhcCones: number;
  nhcStatus: "loading" | "live" | "failed";
};

function readDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __HAZARD_DEBUG__?: HazardDebug }).__HAZARD_DEBUG__);
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
  });
}

test("a routed cone fixture draws N cone meshes and names the scope", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await withBaseHazardFixtures(page);
  await routeNhc(page, nhcConeFixture);
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.nhcStatus, { timeout: 15_000 }).toBe("live");
  const debug = await readDebug(page);
  expect(debug?.nhcCones).toBe(1); // nhc-cone.json has exactly one feature
  expect(debug?.status.detail).toContain("1 NHC cones");
  expect(debug?.status.detail).toContain("NHC basins only (Atlantic, East and Central Pacific)");
});

test("an empty FeatureCollection across every slot shows 'No active NHC storms'", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await withBaseHazardFixtures(page);
  await routeNhc(page, nhcEmptyFixture);
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.nhcStatus, { timeout: 15_000 }).toBe("live");
  const debug = await readDebug(page);
  expect(debug?.nhcCones).toBe(0);
  expect(debug?.status.detail).toContain("No active NHC storms");
});

test("every cone query failing reports failed health and draws nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await withBaseHazardFixtures(page);
  await page.route(NHC_MAPSERVER_GLOB, (route) => route.abort());
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.nhcStatus, { timeout: 15_000 }).toBe("failed");
  const debug = await readDebug(page);
  expect(debug?.nhcCones).toBe(0); // nothing drawn
  expect(debug?.status.detail).toContain("NHC unreachable");
  // A failed NHC poll alone never drags the other five, still-live feeds
  // down with it (see HazardLayer.tsx's own comment on this).
  expect(debug?.status.state).toBe("live");
});
