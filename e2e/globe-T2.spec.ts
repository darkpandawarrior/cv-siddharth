import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { mapsReviews } from "../src/data/generated/mapsPlaces.ts";

// Exercise aircraft meshes and picking on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const activityFixture = JSON.parse(readFileSync(join(FIXTURES, "activity.json"), "utf8"));

const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withApiFixtures(page: Page, activity: unknown, aircraft: unknown) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activity }));
  // Keep the nearby aircraft present: curated markers must win on their ray.
  await page.route("**/api/aircraft", async route => route.fulfill({ json: await aircraft }));
  await page.route("**/api/ops", (route) => route.abort());
  await page.route("**/api/signals", (route) => route.abort());
}

/** This page's other default-on layers' own live feeds, none of them this
 *  lane's concern: aborted rather than fixtured (same discipline as
 *  e2e/globe-X3.spec.ts's own `abortUnrelatedFeeds`). */
async function abortUnrelatedFeeds(page: Page) {
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
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

async function openGlobe(page: Page, isoNow: string, width: number, activity: unknown = activityFixture, aircraft: unknown = aircraftFixture) {
  await page.setViewportSize({ width, height: width === 360 ? 740 : width === 390 ? 844 : 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
  await abortUnrelatedFeeds(page);
  await withApiFixtures(page, activity, aircraft);
  await page.clock.setFixedTime(new Date(isoNow));
  await page.addInitScript(() => { window.__W11_TEST__ = true; localStorage.setItem("cv-siddharth:globe-intro-seen", "1"); });
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await readGuideDebug(page))?.statusDetail, { timeout: 15_000 }).toBeTruthy();
}

async function clickGuideMarker(page: Page, slug: string, mobile: boolean) {
  const selection = page.getByRole("region", { name: "Selection details" });
  // Only desktop preselects Pune. Start at the tested viewport so a resize
  // cannot strand that desktop selection behind a closed phone sheet.
  if (mobile) await expect(selection).toHaveCount(0);
  else await selection.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate((id) => window.__GUIDE_DEBUG__?.face(id), slug);
  const canvas = page.locator("[data-globe-root] canvas");
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
  await expect(canvas).toHaveAttribute("data-camera-flying", "false");
  await expect(canvas).toHaveAttribute("data-camera-distance", slug.startsWith("review-") ? "9.500" : "14.000");
  let previous: { x: number; y: number } | null = null;
  let previousDist: number | null = null;
  let stable = 0;
  await expect.poll(async () => {
    const { point, dist } = await page.evaluate((id) => ({
      point: window.__GUIDE_DEBUG__?.screenPoint(id),
      dist: window.__GUIDE_DEBUG__?.cameraDistance(),
    }), slug);
    if (!point || dist == null) return 0;
    // Hover can invalidate a reduced-motion demand frame. Exercise it
    // while settling, so its frame cannot move the target after this gate.
    if (!mobile) await page.mouse.move(point.x, point.y);
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
  const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
  if (!point) throw new Error("guide marker has no screen point");
  if (!mobile) await page.mouse.move(point.x, point.y);
  await expect.poll(() => page.evaluate(p => {
    const hit = document.elementFromPoint(p.x, p.y);
    return hit?.tagName === "CANVAS" ? "CANVAS" : hit?.outerHTML;
  }, point)).toBe("CANVAS");
  if (mobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}


// Choose the most isolated actual public-place pin; camera positioning only,
// selection must come from the real WebGL raycast.
const isolated = mapsReviews.filter((review) => review.text.length > 0).sort((a, b) => {
  const gap = (r: typeof a) => Math.min(...mapsReviews.filter((p) => p.id !== r.id).map((p) => Math.hypot(p.lat-r.lat, (p.lon-r.lon)*Math.cos(r.lat*Math.PI/180))));
  return gap(b)-gap(a);
})[0];
for (const width of [1440, 390, 360]) {
  const mobile = width < 640;
  test.describe(`${width}px`, () => {
    test.use({ hasTouch: mobile });
  test(`a genuine public review pin opens its rating, month and source (${mobile ? "phone" : "desktop"})`, async ({ page }) => {
    await openGlobe(page, "2026-09-30T12:00:00+05:30", width);
    await clickGuideMarker(page, isolated.id, mobile);
    const inspector = page.locator(mobile ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
    await expect(inspector).toBeVisible();
    await expect(page.locator("[data-pinned-readouts]")).toHaveCount(0);
    await expect(inspector).toContainText(isolated.name);
    await expect(inspector).toContainText(`${isolated.rating} / 5`);
    await expect(inspector).toContainText(isolated.month);
    await expect(inspector).toContainText("Google Maps review by Siddharth");
    if (isolated.text.length > 220) await inspector.getByText("More", { exact: true }).click();
    await expect(inspector).toContainText(isolated.text);
  });

  test("review-1 beats the Pune stack with nearby aircraft present", async ({ page }) => {
    await openGlobe(page, "2026-09-30T12:00:00+05:30", width);
    await expect(page.locator("[data-aircraft-layer]")).toHaveAttribute("data-aircraft-count", String(aircraftFixture.aircraft.length));
    await clickGuideMarker(page, "review-1", mobile);
    const review = mapsReviews.find(review => review.id === "review-1")!;
    const inspector = page.locator(mobile ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
    await expect(inspector).toContainText(review.name);
    await expect(inspector).toContainText(`${review.rating} / 5`);
    await expect(inspector).toContainText(`Google Maps review by Siddharth, ${review.month}`);
  });

  test("an aircraft away from curated markers still opens its card", async ({ page }, testInfo) => {
    // A test-only airspace position, deliberately outside the guide radius.
    // The original fixture remains present in the guide precedence cases.
    const away = { ...aircraftFixture, aircraft: [{ ...aircraftFixture.aircraft[0], lat: 19.5, lon: 74.5, gsKt: 0 }] };
    let releaseAircraft = () => {};
    const pendingAircraft = new Promise(resolve => { releaseAircraft = () => resolve(away); });
    try {
      await openGlobe(page, "2026-09-30T12:00:00+05:30", width, activityFixture, pendingAircraft);
      await page.waitForFunction(() => !!window.__G3_AIRCRAFT__);
      await expect(page.locator("[data-aircraft-layer]")).toHaveAttribute("data-aircraft-count", "0");
      // Render the empty mesh before filling it: its raycast bounds must recover.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    } finally { releaseAircraft(); }
    await expect(page.locator("[data-aircraft-layer]")).toHaveAttribute("data-aircraft-count", "1");
    const selection = page.getByRole("region", { name: "Selection details" });
    if (!mobile) await selection.getByRole("button", { name: "Close", exact: true }).click();
    await page.evaluate(cs => window.__G3_AIRCRAFT__!.face(cs), away.aircraft[0].cs);
    const canvas = page.locator("[data-globe-root] canvas");
    await expect.poll(() => canvas.getAttribute("data-camera-distance")).toBe("9.500");
    await expect(canvas).toHaveAttribute("data-camera-flying", "false");
    let point = await page.evaluate(cs => window.__G3_AIRCRAFT__!.screenPoint(cs), away.aircraft[0].cs);
    const beforeHover = point;
    let stable = 0;
    // Hover can wake a demand frame and change the camera projection.
    // Settle that interaction before projecting the small chevron for its click.
    await expect.poll(async () => {
      if (point && !mobile) await page.mouse.move(point.x, point.y);
      const next = await page.evaluate(cs => window.__G3_AIRCRAFT__!.screenPoint(cs), away.aircraft[0].cs);
      stable = point && next && Math.hypot(next.x - point.x, next.y - point.y) < 0.2 ? stable + 1 : 0;
      point = next;
      return stable;
    }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
    point = await page.evaluate(cs => window.__G3_AIRCRAFT__!.screenPoint(cs), away.aircraft[0].cs);
    if (!point) throw new Error("aircraft has no screen point");
    await testInfo.attach("aircraft-projection", { body: JSON.stringify({ beforeHover, beforeClick: point }), contentType: "application/json" });
    await expect.poll(() => page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point)).toBe("CANVAS");
    if (mobile) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    const inspector = page.locator(mobile ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
    await expect(inspector).toContainText(away.aircraft[0].cs);
    await expect(inspector).toContainText("adsb.lol");
  });

  test(`city places and photo keyboard viewer (${mobile ? "phone" : "desktop"})`, async ({ page }, testInfo) => {
    await openGlobe(page, "2026-09-30T12:00:00+05:30", width);
    await expect(page.locator("[data-aircraft-layer]")).toHaveAttribute("data-aircraft-count", String(aircraftFixture.aircraft.length));
    await clickGuideMarker(page, "pune", mobile);
    const inspector = page.locator(mobile ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
    await expect(inspector).toContainText("Reviewed public places");
    await expect(page.locator("[data-pinned-readouts]")).toHaveCount(0);
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
    const review = mapsReviews.find((r) => r.slug === "pune" && r.text.length > 0)!;
    await inspector.getByRole("button", { name: `${review.name} · ${review.rating} / 5 · ${review.month}`, exact: true }).click();
    await expect(inspector).toContainText(review.name);
    await expect(inspector).toContainText(`Google Maps review by Siddharth, ${review.month}`);
    await expect(inspector).toContainText(`${review.rating} / 5`);
    if (review.text.length > 220) await inspector.getByText("More", { exact: true }).click();
    if (review.text) await expect(inspector).toContainText(review.text);
    await testInfo.attach("place-card", { body: await page.screenshot(), contentType: "image/png" });
  });
  });
}
