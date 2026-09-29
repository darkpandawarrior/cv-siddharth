import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 6 LANE X1 (live world feed), end to end. Reuses the same committed
 * fixtures globe-L7.spec.ts (hazards) and globe-L4.spec.ts (signals) already
 * prove match their real handler shapes — no new fixture of this lane's own
 * (globe-lanes.md's own "one less place a shape can drift" reasoning).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const weatherFixture = fixture("weather-2026-09-24.json");
const tleFixture = fixture("tle.json");
const aircraftFixture = fixture("aircraft.json");
const whereamiFixture = fixture("whereami-IN.json");
const activityFixture = fixture("activity.json");
const opsFixture = fixture("ops.json");
const signalsFixture = fixture("live/signals.json");
const quakesFixture = fixture("hazards/quakes.json");
const eonetFixture = fixture("hazards/eonet.json");
const gdacsFixture = fixture("hazards/gdacs.json");
const ovationFixture = fixture("hazards/ovation.json");
const kpFixture = fixture("hazards/kp.json");
const launchesFixture = fixture("hazards/launches.json");

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events**";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**";

async function withFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activityFixture }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: opsFixture }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: signalsFixture }));
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: quakesFixture }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.fulfill({ json: ovationFixture }));
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: launchesFixture }));
}

async function setPresence(page: Page, counts: Record<string, number>) {
  await page.addInitScript((c) => {
    (window as unknown as { __GLOBE_PRESENCE_TEST__: Record<string, number> }).__GLOBE_PRESENCE_TEST__ = c;
  }, counts);
}

// One hour after the hazard fixtures' own clock (globe-L7.spec.ts uses noon)
// so the Launch Library's one near-term entry (net 2026-09-28T12:15:00Z)
// lands inside the 24h window this lane's launch publisher gates on —
// noon itself sits 15 minutes past that window and would silently produce
// zero launch items.
const CLOCK = new Date("2026-09-27T13:00:00Z");

async function openLiveTab(page: Page) {
  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  await panel.locator('[data-feed-tab="live"]').click();
}

test("feed items appear from the hazard and signals fixtures", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withFixtures(page);
  await setPresence(page, {});
  await page.clock.setFixedTime(CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);
  await openLiveTab(page);

  const rail = page.locator("[data-globe-feed-rail]");
  // Scoped to the visible row list, not the whole rail: the sr-only
  // aria-live region echoes the single newest item's own title+detail text,
  // which is a real substring collision with this fixture's own push row
  // (strict mode caught it) -- the list is what a sighted visitor reads, so
  // that's what these assertions check.
  const list = rail.locator("[data-feed-list]");
  // A hazard item (quake.ts's own M>=4.5 floor: this fixture's largest is
  // M5.6 off Kokopo) and a signals item (activity.json's newest push, which
  // PulseLayer's own opening replay always stages first since it's the most
  // recent of the fixture's 14 candidate events) both come from the two
  // families the brief names.
  await expect(list.getByText(/M5\.6 .*Kokopo/)).toBeVisible({ timeout: 15_000 });
  await expect(list.getByText("tighten the release checklist")).toBeVisible({ timeout: 15_000 });
  // Every row so far is what it claims to be: no invented geography, and a
  // magnitude below this lane's own 4.5 floor never appears (the fixture's
  // M0.7/M2.6 quakes).
  await expect(list.getByText(/M0\.7|M2\.6/)).toHaveCount(0);
});

test("clicking a feed item flies to its focus and selects it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withFixtures(page);
  await setPresence(page, {});
  await page.clock.setFixedTime(CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);
  await openLiveTab(page);

  // Scoped to the visible list, not the whole rail -- same strict-mode
  // collision with the sr-only announcer as the test above.
  const row = page.locator("[data-globe-feed-rail] [data-feed-list]").getByText(/M5\.6 .*Kokopo/);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  const inspectorTitle = page.locator("[data-globe-inspector] h2");
  await expect(inspectorTitle).toHaveText(/M5\.6 .*Kokopo/);
  // The item carried a lat/lon focus (the quake's own epicentre) — the
  // Inspector only ever renders "Fly to" when `selected.focus` is set, so
  // its presence is proof the click handed a focus through, not just a
  // selection with none.
  await expect(page.locator("[data-globe-inspector]").getByRole("button", { name: "Fly to" })).toBeVisible();
});

test("scrubbing time pauses the feed instead of showing a stale live list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withFixtures(page);
  await setPresence(page, {});
  await page.clock.setFixedTime(CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);
  await openLiveTab(page);

  const rail = page.locator("[data-globe-feed-rail]");
  await expect(rail.locator("[data-feed-list]")).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press("]"); // TimeScrubber.tsx's own +60min shortcut
  await expect(rail.locator("[data-feed-paused]")).toBeVisible();
  await expect(rail.locator("[data-feed-list]")).toHaveCount(0);

  await page.keyboard.press("["); // back to live (timeOffsetMin 0)
  await expect(rail.locator("[data-feed-list]")).toBeVisible({ timeout: 15_000 });
});
