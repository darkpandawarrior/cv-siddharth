import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise exact quake counts and magnitude filtering on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 1);
});

/**
 * LANE W12 ("Ask the globe"), e2e.
 *
 * AskBox.tsx isn't mounted anywhere in this wave (a later UI lane gives it
 * its real home — see this lane's report, "Needs from integration"), so
 * every case here drives the copilot through the `window.__GLOBE_ASK__` seam
 * copilot/execute.ts registers, bootstrapped from HazardLayer.tsx (the one
 * W12-owned file that IS mounted) behind `?globeTest=1` — see both files'
 * own comments. Every /api/* this run touches is fixture-routed (G10): the
 * hazards feeds are this lane's own committed fixtures, shared with
 * globe-L7.spec.ts, and /api/chat is mocked per case below.
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

// This lane's own committed fixture (quakesFixture): magnitudes
// [0.7, 2.6, 4.6, 5.2, 5.6] — same file globe-L7.spec.ts's own "debug?.quakes
// === 5" case asserts against, so "above 5" -> 2 and "above 4.5" -> 3 are
// exact, not approximate.
async function withHazardFixtures(page: Page) {
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: quakesFixture }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.fulfill({ json: ovationFixture }));
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: launchesFixture }));
}

type HazardDebug = {
  quakes: number;
  filters: { quakeMinMag?: number; quakeSinceHours?: number };
};

function readDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __HAZARD_DEBUG__?: HazardDebug }).__HAZARD_DEBUG__);
}

function askGlobe(page: Page, text: string): Promise<string> {
  return page.evaluate((t) => (window as unknown as { __GLOBE_ASK__: (t: string) => Promise<string> }).__GLOBE_ASK__(t), text);
}

async function gotoGlobeTest(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withHazardFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:00:00Z"));
  await page.goto("/globe?globeTest=1");
  await waitForHydration(page);
  await expect.poll(async () => (await readDebug(page))?.quakes ?? 0, { timeout: 15_000 }).toBe(5); // unfiltered baseline
  await page.waitForFunction(() => "__GLOBE_ASK__" in window, undefined, { timeout: 15_000 });
}

test("deterministic path: 'show quakes above 5' filters the layer with no network call", async ({ page }) => {
  await gotoGlobeTest(page);
  let chatCalled = false;
  await page.route("**/api/chat", (route) => {
    chatCalled = true;
    route.abort();
  });

  const summary = await askGlobe(page, "show quakes above 5");
  expect(summary).toContain("filter");
  await expect.poll(async () => (await readDebug(page))?.quakes).toBe(2); // [5.2, 5.6]
  expect((await readDebug(page))?.filters.quakeMinMag).toBe(5);
  expect(chatCalled).toBe(false); // free and instant — never reached the LLM
});

test("LLM path: an unrecognised phrase applies the mocked /api/chat actions", async ({ page }) => {
  await gotoGlobeTest(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({ json: { actions: [{ type: "filter", quakeMinMag: 4.5 }], narrate: "Showing quakes above magnitude 4.5." } }),
  );

  const summary = await askGlobe(page, "what's happening with the earthquakes lately");
  expect(summary).toContain("Showing quakes above magnitude 4.5.");
  await expect.poll(async () => (await readDebug(page))?.quakes).toBe(3); // [4.6, 5.2, 5.6]
  expect((await readDebug(page))?.filters.quakeMinMag).toBe(4.5);
});

test("invalid LLM JSON produces a narrate and no store change", async ({ page }) => {
  await gotoGlobeTest(page);
  await page.route("**/api/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "not valid json" }));

  const before = await readDebug(page);
  const summary = await askGlobe(page, "what's happening with the earthquakes lately");
  expect(summary.length).toBeGreaterThan(0); // a friendly narrate, not a thrown error
  const after = await readDebug(page);
  expect(after?.quakes).toBe(before?.quakes);
  expect(after?.filters).toEqual(before?.filters);
});
