import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { mapsReviews } from "../src/data/generated/mapsPlaces.ts";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const activityFixture = JSON.parse(readFileSync(join(FIXTURES, "activity.json"), "utf8"));

const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withApiFixtures(page: Page, activity: unknown) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activity }));
  // PulseLayer's other two feeds (this lane never draws anything from
  // them) — aborted so they settle into their own honest "failed" state
  // instead of reaching a real network (G10). LocalTraffic is the same:
  // this lane's fixture places a real aircraft (adsb.lol AIC864) within a
  // few km of Pune, which the Time Machine's own local air-traffic cluster
  // renders well above the surface -- close enough to camera, at Pune's own
  // flown-to distance, to sit on the identical ray as the guide marker's
  // click point and steal it. This spec never asserts on aircraft, so it
  // aborts the feed rather than fulfilling a fixture it doesn't use, the
  // same as ops/signals below.
  await page.route("**/api/aircraft", (route) => route.abort());
  await page.route("**/api/ops", (route) => route.abort());
  await page.route("**/api/signals", (route) => route.abort());
}

/** This page's other default-on layers' own live feeds, none of them this
 *  lane's concern: aborted rather than fixtured (same discipline as
 *  e2e/globe-X3.spec.ts's own `abortUnrelatedFeeds`). */
async function abortUnrelatedFeeds(page: Page) {
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

type GuideDebug = {
  simYear: number;
  scales: Record<string, number>;
  statusDetail: string;
  orgMarker: { lat: number; lon: number };
  activityEvents: number;
  activityHistogram: number[] | null;
  face: (slug: string) => void;
  screenPoint: (slug: string) => { x: number; y: number } | null;
  cameraDistance: () => number | null;
};
function readGuideDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __GUIDE_DEBUG__?: GuideDebug }).__GUIDE_DEBUG__);
}

async function openGlobe(page: Page, isoNow: string, activity: unknown = activityFixture) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abortUnrelatedFeeds(page);
  await withApiFixtures(page, activity);
  await page.clock.setFixedTime(new Date(isoNow));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await readGuideDebug(page))?.statusDetail, { timeout: 15_000 }).toBeTruthy();
}

async function clickGuideMarker(page: Page, slug: string) {
  await page.evaluate((id) => window.__GUIDE_DEBUG__?.face(id), slug);
  let previous: { x: number; y: number } | null = null;
  let previousDist: number | null = null;
  let stable = 0;
  await expect.poll(async () => {
    const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
    const dist = await page.evaluate(() => window.__GUIDE_DEBUG__?.cameraDistance());
    if (!point || dist == null) return 0;
    // A flyTo's dolly keeps looking straight at the target throughout its
    // whole transition, so the target's own 2D screen point can already
    // read "stable" while the camera is still animating in on the radial
    // axis -- both this point AND the camera's own distance from centre
    // must hold steady for three consecutive polls, or a click can land
    // mid-flight, at a distance the click-precision math downstream (pin
    // visibility, hit-disc radius) never intended.
    const pointStable = previous !== null && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.2;
    const distStable = previousDist !== null && Math.abs(dist - previousDist) < 0.01;
    stable = pointStable && distStable ? stable + 1 : 0;
    previous = point;
    previousDist = dist;
    return stable;
  }, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(3);
  // A settled *reading* isn't the same guarantee as a settled camera --
  // CameraDirector's own direct (reducedMotion) position set is
  // synchronous, but OrbitControls' per-frame update() (drei's own
  // useFrame, damping-driven) runs on the NEXT rendered frame regardless,
  // so give it one to land before trusting the point above.
  await page.waitForTimeout(120);
  const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
  if (!point) throw new Error("guide marker has no screen point");
  await page.mouse.click(point.x, point.y);
}


// Choose the most isolated actual public-place pin; camera positioning only,
// selection must come from the real WebGL raycast.
const isolated = mapsReviews.filter((review) => review.text.length > 0).sort((a, b) => {
  const gap = (r: typeof a) => Math.min(...mapsReviews.filter((p) => p.id !== r.id).map((p) => Math.hypot(p.lat-r.lat, (p.lon-r.lon)*Math.cos(r.lat*Math.PI/180))));
  return gap(b)-gap(a);
})[0];
test("a genuine public review pin opens its rating, month and source", async ({ page }) => {
  await openGlobe(page, "2026-09-30T12:00:00+05:30");
  await clickGuideMarker(page, isolated.id);
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText(isolated.name);
  await expect(inspector).toContainText(`${isolated.rating} / 5`);
  await expect(inspector).toContainText(isolated.month);
  await expect(inspector).toContainText("Google Maps review by Siddharth");
  if (isolated.text.length > 220) await inspector.getByText("More", { exact: true }).click();
  await expect(inspector).toContainText(isolated.text);
});
for (const mobile of [false, true]) {
  test(`city places and photo keyboard viewer (${mobile ? "phone" : "desktop"})`, async ({ page }, testInfo) => {
    await openGlobe(page, "2026-09-30T12:00:00+05:30");
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await clickGuideMarker(page, "pune");
    const inspector = page.locator(mobile ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
    await expect(inspector).toContainText("Reviewed public places");
    await expect(inspector).toContainText("Local Guide Level 6");
    await expect(inspector).toContainText("as of 30 Sep 2026");
    const profile = inspector.getByRole("link", { name: "My Google Maps profile" });
    await expect(profile).toHaveAttribute("href", /google.com\/maps\/contrib\//);
    await testInfo.attach("city-card", { body: await page.screenshot(), contentType: "image/png" });
    const photo = inspector.getByRole("button", { name: /^Open photo/ }).first();
    await photo.click();
    const viewer = page.getByRole("dialog", { name: "Google Maps photo viewer" });
    await expect(viewer).toBeVisible();
    await testInfo.attach("lightbox", { body: await page.screenshot(), contentType: "image/png" });
    const original = await viewer.locator("img").getAttribute("src");
    await page.keyboard.press("ArrowRight");
    await expect(viewer.locator("img")).not.toHaveAttribute("src", original!);
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.locator("img")).toHaveAttribute("src", original!);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(photo).toBeFocused();
    await expect(inspector).toBeVisible();
    const review = mapsReviews.find((r) => r.slug === "pune")!;
    await inspector.getByRole("button", { name: new RegExp(review.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await expect(inspector).toContainText(`${review.rating} / 5`);
    if (review.text.length > 220) await inspector.getByText("More", { exact: true }).click();
    if (review.text) await expect(inspector).toContainText(review.text);
    await testInfo.attach("place-card", { body: await page.screenshot(), contentType: "image/png" });
  });
}
