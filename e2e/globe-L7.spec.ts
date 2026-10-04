import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise exact quake count before the tier magnitude floor on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 1);
});

/**
 * LANE L7 (live earth events), e2e. Fixed clock, every external feed this
 * lane touches routed to a committed fixture (globe-lanes.md's own G10:
 * under `vite preview` there is no real /api proxy for these, and even if
 * there were, a required gate never hits a live network). The Black Marble
 * mask stays real per e2e/globe.spec.ts's own precedent — irrelevant here,
 * this lane draws nothing earth-shaped.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/hazards");
const quakesFixture = JSON.parse(readFileSync(join(FIXTURES, "quakes.json"), "utf8"));
const eonetFixture = JSON.parse(readFileSync(join(FIXTURES, "eonet.json"), "utf8"));
const gdacsFixture = JSON.parse(readFileSync(join(FIXTURES, "gdacs.json"), "utf8"));
const ovationFixture = JSON.parse(readFileSync(join(FIXTURES, "ovation.json"), "utf8"));
const kpFixture = JSON.parse(readFileSync(join(FIXTURES, "kp.json"), "utf8"));
const launchesFixture = JSON.parse(readFileSync(join(FIXTURES, "launches.json"), "utf8"));

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events**";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**";

async function withHazardFixtures(page: Page) {
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: quakesFixture }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.fulfill({ json: ovationFixture }));
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: launchesFixture }));
}

async function abortAllHazardFeeds(page: Page) {
  for (const url of [QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL]) {
    await page.route(url, (route) => route.abort());
  }
}

/** `HazardLayer.tsx`'s own `window.__HAZARD_DEBUG__` e2e seam — see that
 *  file's own comment on why this is a plain global rather than a DOM node
 *  (a `<Html>`-based seam measurably regressed the "Globe" named chunk's
 *  budget by pulling an unrelated shared chunk into the eager bundle). */
type HazardDebug = {
  quakes: number;
  fires: number;
  storms: number;
  volcanoes: number;
  alerts: number;
  launches: number;
  aurora: boolean;
  selectedKind: string;
  selectedRows: { label: string; value: string }[] | null;
  status: { state: string; detail?: string };
};

function readDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __HAZARD_DEBUG__?: HazardDebug }).__HAZARD_DEBUG__);
}

test("quakes and EONET fires render from the live feeds, health reports live counts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withHazardFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.quakes ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const debug = await readDebug(page);
  expect(debug?.quakes).toBe(5); // this lane's own committed fixture (quake.test.ts asserts the same count)
  expect(debug?.fires).toBeGreaterThan(0);
  expect(debug?.status.state).toBe("live");
  expect(debug?.status.detail).toContain("quakes");
  expect(debug?.status.detail).toContain("fires");
});

test("clicking a quake ring selects it and the inspector row carries its magnitude", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // freezes auto-rotate so the camera framing this test depends on holds still
  // One quake, placed exactly at the point the opening camera frame faces
  // most directly (GlobeScene's own START = latLonToXyz(PUNE.lat + 12,
  // PUNE.lon)) — a real fixture would land anywhere on Earth, so this test
  // uses a synthetic single-feature feed instead of the committed one
  // (quake.test.ts and eonet.test.ts already cover parsing the real,
  // committed fixtures; this test is only about the click->store wire).
  const clickableQuake = {
    type: "FeatureCollection",
    metadata: { generated: 0, url: QUAKES_URL, title: "test", status: 200, api: "2.7.0", count: 1 },
    features: [
      {
        type: "Feature",
        properties: { mag: 6.5, place: "Test Trench", time: Date.parse("2026-09-27T11:00:00Z"), url: "https://earthquake.usgs.gov/x" },
        geometry: { type: "Point", coordinates: [73.8567, 30.5204, 12.4] },
        id: "test-clickable",
      },
    ],
  };
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: clickableQuake }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: { title: "t", events: [] } }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
  await page.route(OVATION_URL, (route) => route.abort());
  await page.route(KP_URL, (route) => route.abort());
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: { count: 0, results: [] } }));
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect.poll(async () => (await readDebug(page))?.quakes ?? 0, { timeout: 15_000 }).toBe(1);

  // GlobeScene.tsx's own subsolar probe already exposes exactly where the
  // globe's centre (and so its camera-facing near point) lands on screen —
  // reused here rather than re-deriving a second projection.
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-globe-x")).not.toBeNull();
  const canvas = page.locator("[data-globe-root] canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const [gx, gy] = await Promise.all(["x", "y"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));

  await page.mouse.click(canvasBox.x + gx, canvasBox.y + gy);

  await expect.poll(async () => (await readDebug(page))?.selectedKind).toBe("quake");
  const debug = await readDebug(page);
  const magnitudeRow = debug?.selectedRows?.find((r) => r.label === "Magnitude");
  expect(magnitudeRow?.value).toBe("6.5");
});

test("every feed unreachable draws nothing and reports a failed health, each feed named", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abortAllHazardFeeds(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.status.state, { timeout: 15_000 }).toBe("failed");
  const debug = await readDebug(page);
  expect(debug?.quakes).toBe(0);
  expect(debug?.fires).toBe(0);
  expect(debug?.storms).toBe(0);
  expect(debug?.alerts).toBe(0);
  expect(debug?.launches).toBe(0);
  expect(debug?.aurora).toBe(false);
  // Each sub-feed named (task 6), not a single opaque "failed".
  for (const name of ["USGS", "EONET", "GDACS", "aurora", "Kp", "Launch Library"]) {
    expect(debug?.status.detail, debug?.status.detail).toContain(`${name} unreachable`);
  }
});
