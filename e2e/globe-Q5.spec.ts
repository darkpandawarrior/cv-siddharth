import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { weeksAgoLabel } from "../src/world/globe/globeRows.ts";
import { fleetStats, storeGeneratedAt } from "../src/data/store.ts";
import type { Page } from "@playwright/test";

/**
 * LANE Q5 (wave 9, P5 "data honesty"): en-IN grouping in globeRows.ts and
 * LocalTraffic.tsx, a quake's Time row pairing its relative age with an
 * absolute UTC clock reading, and the reach snapshot saying how old it is.
 * Fixed clock, every /api/* and hazard feed routed to a committed fixture
 * (G10, same discipline as e2e/globe.spec.ts / globe-L7.spec.ts).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const HAZARD_FIXTURES = join(FIXTURES, "hazards");
const eonetFixture = JSON.parse(readFileSync(join(HAZARD_FIXTURES, "eonet.json"), "utf8"));
const gdacsFixture = JSON.parse(readFileSync(join(HAZARD_FIXTURES, "gdacs.json"), "utf8"));
const ovationFixture = JSON.parse(readFileSync(join(HAZARD_FIXTURES, "ovation.json"), "utf8"));
const kpFixture = JSON.parse(readFileSync(join(HAZARD_FIXTURES, "kp.json"), "utf8"));
const launchesFixture = JSON.parse(readFileSync(join(HAZARD_FIXTURES, "launches.json"), "utf8"));

const QUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events**";
const GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**";

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** cameraIntro.ts's own SEEN_KEY (globe-lanes.md's addendum, see
 *  globe-X5.spec.ts's own `seedIntroSeen`) — this spec isn't testing the
 *  intro, so it never fights it for the camera. */
async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has — a blocked localStorage just
      // means the intro plays again, not a reason to fail this test.
    }
  });
}

test("reach snapshot: install floor is en-IN grouped and says how old it is", async ({ page }) => {
  await seedIntroSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const panel = page.locator("[data-globe-panel]");
  await expect(panel).toBeVisible();
  // data.md #1: en-IN lakh grouping, not en-US thousands grouping. Derived from store.ts, not
  // literal: the floor moves with every store refresh, the grouping rule does not.
  const floor = fleetStats.installFloor;
  await expect(panel).toContainText(`${floor.toLocaleString("en-IN")} install floor across ${fleetStats.live} live listings`);
  await expect(panel).not.toContainText(floor.toLocaleString("en-US"));
  // data.md #6: the snapshot names its own age, not just a bare date a visitor has to do math
  // against. weeksAgoLabel is the panel's own formatter, run against this test's fixed clock.
  await expect(panel).toContainText(`(${weeksAgoLabel(storeGeneratedAt, new Date("2026-09-24T12:27:00+05:30"))})`);
});

test("quake Time row pairs the relative age with an absolute UTC clock reading", async ({ page }) => {
  await seedIntroSeen(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // freezes auto-rotate so the camera framing below holds still
  // One quake at GlobeScene's own opening-camera-facing point (globe-L7.spec.ts's
  // own precedent), 19 minutes before the fixed clock below.
  const clickableQuake = {
    type: "FeatureCollection",
    metadata: { generated: 0, url: QUAKES_URL, title: "test", status: 200, api: "2.7.0", count: 1 },
    features: [
      {
        type: "Feature",
        properties: { mag: 6.5, place: "Test Trench", time: Date.parse("2026-09-30T19:00:00Z"), url: "https://earthquake.usgs.gov/x" },
        geometry: { type: "Point", coordinates: [73.8567, 30.5204, 12.4] },
        id: "test-clickable",
      },
    ],
  };
  await page.route(QUAKES_URL, (route) => route.fulfill({ json: clickableQuake }));
  await page.route(EONET_URL, (route) => route.fulfill({ json: eonetFixture }));
  await page.route(GDACS_URL, (route) => route.fulfill({ json: gdacsFixture }));
  await page.route(OVATION_URL, (route) => route.fulfill({ json: ovationFixture }));
  await page.route(KP_URL, (route) => route.fulfill({ json: kpFixture }));
  await page.route(LAUNCHES_URL, (route) => route.fulfill({ json: launchesFixture }));
  await page.clock.setFixedTime(new Date("2026-09-30T19:19:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);

  const probe = page.locator("[data-subsolar-probe]");
  // Hydration/projection can precede the quake fetch and the reduced-motion
  // camera's recentering. Wait for the glyph and a settled projection together.
  let previous: { x: number; y: number } | null = null;
  let stable = 0;
  await expect.poll(async () => {
    const state = await probe.evaluate((el) => ({
      x: Number(el.getAttribute("data-globe-x") ?? NaN),
      y: Number(el.getAttribute("data-globe-y") ?? NaN),
      quakes: window.__HAZARD_DEBUG__?.quakes ?? 0,
    }));
    stable = previous && Math.hypot(state.x - previous.x, state.y - previous.y) < 0.2 ? stable + 1 : 0;
    previous = state;
    return state.quakes === 1 && stable >= 3;
  }, { intervals: [50], message: "quake must be loaded and its camera-facing probe settled before clicking" }).toBe(true);
  const canvas = page.locator("[data-globe-root] canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const [gx, gy] = await Promise.all(["x", "y"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));

  const hit = await canvas.evaluate((el, point) => {
    const box = el.getBoundingClientRect();
    const target = document.elementFromPoint(box.x + point.x, box.y + point.y);
    return { isCanvas: target === el, target: target?.outerHTML.slice(0, 500) };
  }, { x: gx, y: gy });
  expect(hit, "quake probe must hit bare canvas, clear of HUD chrome").toMatchObject({ isCanvas: true });
  await page.mouse.click(canvasBox.x + gx, canvasBox.y + gy);
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.selectedKind)).toBe("quake");

  // data.md #3: "3 min ago" paired with the absolute UTC instant it refers
  // to — the same shape the top HUD clock and TimeScrubber already use.
  // Inspector.tsx renders rows as a <dt>label</dt><dd>value</dd> pair, no
  // dedicated test hook, so the value is read off the "Time" label's own
  // sibling <dd> rather than a fresh seam added just for this test.
  const timeValue = page.locator("dt", { hasText: "Time" }).locator("xpath=following-sibling::dd[1]");
  await expect(timeValue).toContainText("19 min ago");
  await expect(timeValue).toContainText("19:00 UTC");
});
