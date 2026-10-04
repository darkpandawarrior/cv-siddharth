import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise hexbin density columns on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

/**
 * LANE X6 (density + craft: hexbin columns, inspector sparklines, opt-in
 * sound). Fixed clock, every /api/* and external feed this lane's own code
 * touches routed to a fixture (G10) — the same hazards fixtures
 * globe-L7.spec.ts already proves match the real feed shapes, plus the two
 * feeds sparkSeries.ts owns (the USGS weekly feed, the Kp feed).
 */
const HAZARDS = join(dirname(fileURLToPath(import.meta.url)), "fixtures/hazards");
const quakesFixture = JSON.parse(readFileSync(join(HAZARDS, "quakes.json"), "utf8"));
const eonetFixture = JSON.parse(readFileSync(join(HAZARDS, "eonet.json"), "utf8"));
const gdacsFixture = JSON.parse(readFileSync(join(HAZARDS, "gdacs.json"), "utf8"));
const kpFixture = JSON.parse(readFileSync(join(HAZARDS, "kp.json"), "utf8"));

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const QUAKE_WEEK_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events**";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**";

async function withHazardFixtures(page: Page) {
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: quakesFixture }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.abort());
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: { count: 0, results: [] } }));
}

test.describe("density layer (hexbin columns)", () => {
  test("turning the density layer on renders hex columns aggregated from the hazard fixtures", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withHazardFixtures(page);
    await page.route(QUAKE_WEEK_URL, (route) => route.abort());
    await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
    await page.goto("/globe");
    await waitForHydration(page);

    // The panel opens by default at this width (globeStore's own matchMedia
    // default, >=1280) — same LABEL text LayerPanel.tsx's own LABEL record
    // gives this lane's layer id ("density").
    await page.getByRole("button", { name: "Quake and fire density" }).click();

    const seam = page.locator("[data-density-layer]");
    await expect(seam).toBeAttached({ timeout: 15_000 });
    await expect
      .poll(async () => Number((await seam.getAttribute("data-density-count")) ?? "0"), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});

test.describe("inspector sparklines", () => {
  const CLICKABLE_QUAKE_LAT = 30.5204; // PUNE.lat + 12, GlobeScene's own opening camera-facing point (same as globe-L7.spec.ts's own clickable-quake test)
  const CLICKABLE_QUAKE_LON = 73.8567;
  const NOW = new Date("2026-09-27T12:00:00Z");

  test("selecting a quake shows a real region sparkline and a Kp sparkline", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" }); // freezes auto-rotate so the click-probe framing holds
    const clickableQuake = {
      type: "FeatureCollection",
      metadata: { generated: 0, url: QUAKES_URL, title: "test", status: 200, api: "2.7.0", count: 1 },
      features: [
        {
          type: "Feature",
          properties: { mag: 6.5, place: "Test Trench", time: NOW.getTime() - 3_600_000, url: "https://earthquake.usgs.gov/x" },
          geometry: { type: "Point", coordinates: [CLICKABLE_QUAKE_LON, CLICKABLE_QUAKE_LAT, 12.4] },
          id: "test-clickable",
        },
      ],
    };
    // A real USGS-weekly-feed shape: two M4.5+ quakes within 5 degrees of the
    // clicked point, on different days of the trailing 7 — enough for
    // regionQuakeCounts (sparkSeries.test.ts's own unit tests cover the
    // parsing) to return a non-null series.
    const weekFeed = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { mag: 5.1, time: NOW.getTime() - 2 * 86_400_000 },
          geometry: { coordinates: [CLICKABLE_QUAKE_LON + 0.2, CLICKABLE_QUAKE_LAT, 10] },
        },
        {
          type: "Feature",
          properties: { mag: 4.6, time: NOW.getTime() - 6 * 3_600_000 },
          geometry: { coordinates: [CLICKABLE_QUAKE_LON, CLICKABLE_QUAKE_LAT + 0.1, 8] },
        },
      ],
    };
    await page.route(QUAKES_URL, (route) => route.fulfill({ json: clickableQuake }));
    await page.route(QUAKE_WEEK_URL, (route) => route.fulfill({ json: weekFeed }));
    await page.route(EONET_URL, (route) => route.fulfill({ json: { title: "t", events: [] } }));
    await page.route(GDACS_URL, (route) => route.fulfill({ json: { type: "FeatureCollection", features: [] } }));
    await page.route(OVATION_URL, (route) => route.abort());
    await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
    await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: { count: 0, results: [] } }));
    await page.clock.setFixedTime(NOW);
    await page.goto("/globe");
    await waitForHydration(page);

    // Same click-the-globe's-facing-point technique as
    // e2e/globe-L7.spec.ts's own quake-selection test: GlobeScene's own
    // subsolar probe already exposes where the globe's centre lands on
    // screen, reused rather than re-deriving a second projection. Also
    // borrowed: waiting for HazardLayer's own debug seam to report the
    // quake before clicking — without it, the click can land before the
    // quake ring has actually mounted and hit the always-present Pune ring
    // underneath instead (caught as a flake: 1 spark, not 2, because the
    // "selection" was silently still Pune, which carries no region spark).
    type HazardDebug = { quakes: number };
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { __HAZARD_DEBUG__?: HazardDebug }).__HAZARD_DEBUG__?.quakes ?? 0), { timeout: 15_000 })
      .toBe(1);
    const probe = page.locator("[data-subsolar-probe]");
    await expect.poll(async () => probe.getAttribute("data-globe-x")).not.toBeNull();
    const canvas = page.locator("[data-globe-root] canvas").first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error("globe canvas has no bounding box");
    const [gx, gy] = await Promise.all(["x", "y"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));
    await page.mouse.click(canvasBox.x + gx, canvasBox.y + gy);
    await expect.poll(async () => page.evaluate(() => document.querySelector("[data-globe-inspector]")?.textContent ?? "")).toContain("Magnitude");

    const inspector = page.locator("[data-globe-inspector]");
    await expect(inspector).toBeVisible({ timeout: 15_000 });
    const sparks = inspector.locator('svg[role="img"]');
    // Region spark (real) + Kp spark (real) = two charts, never a fake one.
    // Both feeds are separate useLiveSignal fetches (sparkSeries.ts's own
    // two hooks) racing each other, so a generous window here rather than a
    // tight one: under a loaded shared machine the slower of the two can
    // take a few seconds longer than the other, not a sign either is wrong.
    await expect.poll(async () => sparks.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    const labels = await sparks.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(labels.some((l) => l?.includes("USGS weekly feed"))).toBe(true);
    expect(labels.some((l) => l?.includes("Kp"))).toBe(true);
  });
});

test.describe("sound toggle", () => {
  test("defaults off and persists across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withHazardFixtures(page);
    await page.route(QUAKE_WEEK_URL, (route) => route.abort());
    await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
    await page.goto("/globe");
    await waitForHydration(page);

    const toggle = page.locator("[data-sound-toggle]");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("data-sound-enabled", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveAttribute("data-sound-enabled", "true");

    await page.reload();
    await waitForHydration(page);
    const toggleAfterReload = page.locator("[data-sound-toggle]");
    await expect(toggleAfterReload).toHaveAttribute("data-sound-enabled", "true", { timeout: 15_000 });
  });
});
