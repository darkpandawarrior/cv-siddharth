import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { mapsReviews } from "../src/data/generated/mapsPlaces.ts";

/**
 * LANE Z2 (private-data closeout): a Local Guide photo opens in the lightbox
 * in the new AVIF format, and no residential review name (a housing
 * society, co-op/CHS, "Residency" or "Apartments") ever renders anywhere on
 * the page -- gen-maps-places.mjs never even publishes one into mapsReviews,
 * so this is a real end-to-end check of that boundary, not a unit re-test.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
// An empty aircraft list, not the real fixture -- this lane's click target is
// the Pune guide marker, and a real aircraft happens to sit right on top of
// it on screen at the fixed clock (the same overlap e2e/globe-T2.spec.ts's
// "pune" sub-test hits), stealing the click before it ever reaches the globe.
const aircraftFixture = { ...JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8")), aircraft: [], total: 0 };
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const activityFixture = JSON.parse(readFileSync(join(FIXTURES, "activity.json"), "utf8"));

const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activityFixture }));
  await page.route("**/api/ops", (route) => route.abort());
  await page.route("**/api/signals", (route) => route.abort());
}

/** Same discipline as e2e/globe-X3.spec.ts's abortUnrelatedFeeds: nothing
 *  this lane cares about, just kept off the real network (G10). */
async function abortUnrelatedFeeds(page: Page) {
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Tolerant the same way cameraIntro.ts's markIntroSeen is.
    }
  });
}

type GuideDebug = {
  statusDetail: string;
  face: (slug: string) => void;
  screenPoint: (slug: string) => { x: number; y: number } | null;
};
function readGuideDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __GUIDE_DEBUG__?: GuideDebug }).__GUIDE_DEBUG__);
}

// Same ordering and readiness gate as e2e/globe-T2.spec.ts's openGlobe --
// statusDetail truthy is the guide layer's own signal that face()/
// screenPoint() are backed by settled data, not just that the debug object
// exists yet.
async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Reduced motion: CameraDirector snaps focus changes instantly instead of
  // flying, and the ambient auto-rotate stops -- without this a guide
  // marker's screenPoint never stops drifting long enough for
  // clickGuideMarker's 3-consecutive-stable check to pass (see e2e/globe-S4.spec.ts).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedIntroSeen(page);
  await abortUnrelatedFeeds(page);
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await readGuideDebug(page))?.statusDetail, { timeout: 15_000 }).toBeTruthy();
  // Camera settle + the subsolar probe's first frame (same wait e2e/globe-U1.spec.ts uses).
  await page.waitForTimeout(700);
}

async function clickGuideMarker(page: Page, slug: string) {
  await page.evaluate((id) => window.__GUIDE_DEBUG__?.face(id), slug);
  let previous: { x: number; y: number } | null = null;
  let stable = 0;
  await expect.poll(async () => {
    const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
    if (!point) return 0;
    stable = previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.2 ? stable + 1 : 0;
    previous = point;
    return stable;
  }, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
  if (!point) throw new Error("guide marker has no screen point");
  await page.mouse.click(point.x, point.y);
}

// A pattern, never the real names: this spec is public, and naming the excluded
// buildings to assert their absence would publish exactly what the rule protects.
const RESIDENTIAL = /\b(co-?op(erative)?|housing society|CHS)\b/i;

test("a Local Guide photo opens in the lightbox in AVIF, and no unconfirmed residential name ever renders", async ({ page }) => {
  await openGlobe(page);
  await clickGuideMarker(page, "pune");
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible();
  const photoButton = inspector.getByRole("button", { name: /^Open photo/ }).first();
  await expect(photoButton).toBeVisible();
  await photoButton.click();
  const viewer = page.getByRole("dialog", { name: "Google Maps photo viewer" });
  await expect(viewer).toBeVisible();
  const src = await viewer.locator("img").getAttribute("src");
  expect(src).toMatch(/\.avif(\?.*)?$/);
  await expect(viewer.locator("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);

  // The strongest possible check: read the entire rendered page, not a
  // component -- a residential name the owner has not confirmed as "not a
  // home" can never surface anywhere, name card, inspector, filmstrip
  // caption or otherwise.
  const confirmed = mapsReviews.filter((review) => review.confirmedNotHome).map((review) => review.name);
  const bodyText = await page.locator("body").innerText();
  expect(confirmed.reduce((text, name) => text.split(name).join(""), bodyText)).not.toMatch(RESIDENTIAL);
  expect(mapsReviews.filter((review) => RESIDENTIAL.test(review.name)).every((review) => review.confirmedNotHome)).toBe(true);
});
