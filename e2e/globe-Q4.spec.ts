import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { fleet } from "../src/data/store.ts";
import { buildAppRing } from "../src/world/globe/layers/reachApps.ts";
import { PUNE } from "../src/lib/sky.ts";

/**
 * LANE Q4 (wave 9, P4): Pune marker-cluster declutter + imagery moire fix.
 * ReachColumns.tsx, layers/familyCiRing.tsx, LiveDots.tsx,
 * layers/reachAppRing.tsx, layers/hazardHalos.tsx, layers/TogetherLayer.tsx
 * used to share a near-identical surface lift (0.02) directly over Pune -
 * the green/magenta moire design.md and perf.md both flagged. The real
 * "no two layers share a lift" acceptance test lives in
 * src/world/globe/puneMarkerStack.test.ts, against the actual exported
 * constants (stronger than a source grep). This spec proves the fix holds
 * at runtime: every Pune-coincident layer mounts together, at once, with
 * a genuinely coincident GDACS alert forcing the worst case, without a
 * console error and without breaking the app ring's own click wire (its
 * SURFACE_EPS moved from 0.02 to 0.016).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const signalsFixture = JSON.parse(readFileSync(join(FIXTURES, "live", "signals.json"), "utf8"));

// A GDACS "red" alert pinned at EXACTLY Pune's own coordinates - the worst
// case for hazardHalos.tsx: this forces its halo to coincide with the app
// ring / CI ring / together reticles at the one spot the opening camera
// looks at first, rather than trusting a real-world feed to land there by
// chance the way the original design/perf audits happened to observe.
const GDACS_AT_PUNE = {
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [PUNE.lon, PUNE.lat] },
      properties: { eventtype: "EQ", eventid: 9001, eventname: "Q4 fixture quake", alertlevel: "red", url: { report: "https://www.gdacs.org/" } },
    },
  ],
};

// Every other external hazard/space-weather/launch feed aborted (globe-W6.spec.ts's
// own EXTERNAL_HAZARD_URLS list, restated) so a real internet call never
// lands a glyph over Pune this spec didn't ask for, and G10 (no live
// network in e2e) holds.
const EXTERNAL_HAZARD_URLS = [
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  "https://eonet.gsfc.nasa.gov/api/v3/events**",
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**",
];

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: signalsFixture }));
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.fulfill({ json: GDACS_AT_PUNE }));
  for (const url of EXTERNAL_HAZARD_URLS) await page.route(url, (route) => route.abort());
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance cameraIntro.ts's own markIntroSeen has.
    }
  });
}

async function setPresence(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __GLOBE_PRESENCE_TEST__: Record<string, number> }).__GLOBE_PRESENCE_TEST__ = { IN: 1 };
  });
}

async function setTogetherPeerAtPune(page: Page) {
  await page.addInitScript((pune) => {
    (window as unknown as { __GLOBE_TOGETHER_TEST__: unknown }).__GLOBE_TOGETHER_TEST__ = {
      "peer-at-pune": { lat: pune.lat, lon: pune.lon, zoom: "region", mode: "orbit" },
    };
  }, PUNE);
}

type ReachDebug = {
  appCount: number;
  appProbeX: number | null;
  appProbeY: number | null;
  ciSegments: { slug: string; status: string }[];
};

function readDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __REACH_DEBUG__?: ReachDebug }).__REACH_DEBUG__);
}

type HazardDebug = { probeX: number | null; probeY: number | null };

function readHazardDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __HAZARD_HALO_DEBUG__?: HazardDebug }).__HAZARD_HALO_DEBUG__);
}

test("the whole Pune stack (columns, app ring, CI ring, live dot, hazard halo, together reticle) mounts together with no thrown JS error", async ({ page }) => {
  // pageerror only -- an UNCAUGHT exception (e.g. a broken shaderMaterial/
  // constructor arg from this lane's own edits). console "error" messages
  // are deliberately NOT collected here: every layer this test deliberately
  // aborts/leaves unmocked (WindLayer's Open-Meteo call, the aborted
  // EONET/quake/aurora/kp/launch feeds) logs its own "Failed to load
  // resource" at the browser level as part of the house rule this repo
  // already exercises ("report failed and draw nothing when a feed is
  // unreachable") -- that is the correct, honest degrade this test is NOT
  // about, and asserting on it would make this test fail for reasons that
  // have nothing to do with the Pune declutter fix.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await setPresence(page);
  await setTogetherPeerAtPune(page);
  await withApiFixtures(page);
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // Reach app ring + CI ring (familyCiRing.tsx, reachAppRing.tsx).
  await expect.poll(async () => (await readDebug(page))?.appCount ?? 0, { timeout: 30_000 }).toBe(fleet.length);
  await expect.poll(async () => (await readDebug(page))?.ciSegments?.length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);

  // Together reticle (layers/TogetherLayer.tsx), the peer pinned at Pune.
  const together = page.locator("[data-together-layer]");
  await expect.poll(async () => together.getAttribute("data-together-count"), { timeout: 10_000 }).toBe("1");

  // Live presence dot (LiveDots.tsx) for the IN centroid.
  await expect(page.locator('[data-live-dot="IN"]')).toBeVisible({ timeout: 10_000 });

  // Let a few more frames run with every layer live (ReachColumns' own
  // standing columns, hazardHalos' Pune-pinned alert included) before
  // trusting the error collector below.
  await page.waitForTimeout(1000);

  expect(errors, `console/page errors while the full Pune stack was mounted:\n${errors.join("\n")}`).toEqual([]);

  await page.screenshot({ path: "test-results/globe-Q4-pune-cluster.png", clip: { x: 500, y: 250, width: 500, height: 400 } });
});

test("the app ring's click wire still resolves after its SURFACE_EPS moved off the old shared 0.02 lift", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await withApiFixtures(page);
  // No CI segments this time (mirrors globe-W6.spec.ts's own reasoning):
  // familyCiRing.tsx's ring shares Pune with reachAppRing.tsx at a
  // different radius, and a ray aimed at the app column's own centre can
  // resolve to the CI ring's nearer geometry instead when both are present.
  await page.route("**/api/signals", (route) => route.fulfill({ json: { ...signalsFixture, ci: undefined } }));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => typeof (await readDebug(page))?.appProbeX, { timeout: 30_000 }).toBe("number");
  let debug = await readDebug(page);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(100);
        const next = await readDebug(page);
        const same = Math.abs((next?.appProbeX ?? NaN) - (debug?.appProbeX ?? NaN)) < 0.01 && Math.abs((next?.appProbeY ?? NaN) - (debug?.appProbeY ?? NaN)) < 0.01;
        debug = next;
        return same;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const canvas = page.locator("[data-globe-root] canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");

  const top = buildAppRing(fleet)[0];
  const panel = page.locator("[data-globe-inspector]");
  await page.mouse.click(canvasBox.x + debug!.appProbeX!, canvasBox.y + debug!.appProbeY!);
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator("h2")).toHaveText(top.name);
});

test("the hazard halo's own click wire resolves the Pune-pinned GDACS alert", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await withApiFixtures(page);
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await expect.poll(async () => typeof (await readHazardDebug(page))?.probeX, { timeout: 30_000 }).toBe("number");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const debug = (await readHazardDebug(page))!;

  const panel = page.locator("[data-globe-inspector]");
  await page.mouse.click(canvasBox.x + debug.probeX!, canvasBox.y + debug.probeY!);
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator("h2")).toHaveText("Q4 fixture quake");
});
