import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE X5 (wave 6): seamless zoom -> street level and back, plus the
 * cinematic skippable first-visit intro. Fixed clock, every /api/* route
 * mocked (G10, same discipline as e2e/globe.spec.ts). Street level's own
 * vector tiles/photos fixtures are lane W3's (e2e/fixtures/street/) --
 * reused rather than duplicated, same as this lane's own StreetView.tsx
 * hand-off hooks sit inside a file this lane doesn't otherwise own.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const emptyStreetFixture = JSON.parse(readFileSync(join(FIXTURES, "street", "panoramax-empty.json"), "utf8"));

const MIN_STYLE = { version: 8, name: "e2e-min-style", sources: {}, layers: [] };
const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    if (route.request().url() === LIBERTY_STYLE_URL) return route.fulfill({ json: MIN_STYLE });
    return route.fulfill({ status: 404, body: "not mocked" });
  });
  await page.route("https://api.panoramax.xyz/api/search**", (route) => route.fulfill({ json: emptyStreetFixture }));
}

/** Seeds the "already seen" intro flag before the app's own scripts run, so
 *  a test about the ZOOM gesture isn't also fighting the intro for the
 *  camera/OrbitControls (cameraIntro.ts's own SEEN_KEY). */
async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has (cameraIntro.ts's markIntroSeen) --
      // a blocked localStorage just means the intro plays again, not a
      // reason to fail this unrelated test.
    }
  });
}

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

test.describe("seamless zoom into street level and back", () => {
  test("holding at the closest zoom for ~400ms opens street level", async ({ page }) => {
    test.slow(); // real OrbitControls damping settle, not instant
    await seedIntroSeen(page);
    const canvas = await openGlobe(page);
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");

    const zoomInRole = page.getByRole("button", { name: "Zoom in" });
    // Resting distance is 26, OrbitControls clamps at minDistance 9, and the
    // multiplicative ZOOM_STEP (1.35, GlobeScene.tsx) crosses that floor in
    // ~4 clicks -- 12 gives several clicks of slack, so this doesn't depend
    // on getting the click count exactly right. Checked before each click
    // and stopped the moment street level opens.
    //
    // Root-caused (this pass) why `zoomIn.click()` itself is the wrong tool
    // here, not the button or the camera logic: Locator.click() on this
    // production build reliably gets stuck on its own internal "waiting for
    // scheduled navigations to finish" step AFTER the click is actually
    // delivered -- reproduced standalone with a throwaway script
    // (X5F-fix/probe3.mjs, kept in scratch) logging Playwright's own call
    // log, which shows "click action done" immediately followed by a stall
    // that only ever times out, never resolves; over half of a 12-click run
    // failed that way. Nothing here actually navigates (`Zoom in` is a plain
    // `<button>`, no href, no history call) -- this reads as Playwright's own
    // click heuristic misfiring against this SPA shell, not a bug in the
    // click target. Dispatching the SAME gesture via raw
    // move/down/up (no actionability wait, no post-click navigation wait) --
    // exactly what a real pointer does -- reached street level cleanly in
    // every one of several repeated standalone runs against this same built
    // preview server. That is the fix: drive the pointer directly instead of
    // through Locator.click().
    //
    // The 150ms gap between attempts still matters and is kept from
    // e2e/globe-W1.spec.ts's own zoom loop: .ctrl-icon's hover/active
    // transform (index.css, `transform: scale(1.06)` on hover with
    // --dur-fast 0.18s spring easing) keeps the button's own bounding box
    // animating for ~180ms after every click, and a fresh boundingBox() read
    // each iteration (rather than one taken before the loop) is what a real
    // pointer effectively gets too, since it re-locates the target every time.
    for (let i = 0; i < 12; i++) {
      if ((await canvas.getAttribute("data-camera-view").catch(() => null)) === "street") break;
      const box = await zoomInRole.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
    }

    await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 8_000 }).toBe("street");
    await expect(page.locator("[data-street-view]")).toBeVisible();
  });

  // LANE I2 (root cause fix): the product bug this covers -- resting AT the
  // floor with no further input used to keep accumulating toward the 400ms
  // trigger regardless, so a visitor who zoomed in to study the floor and
  // then just looked was thrown into street view a moment later. Stops
  // clicking the instant CameraDirector's own data-camera-distance probe
  // (test/tooling seam, same convention as data-subsolar-*) confirms the
  // floor is actually reached, so "stayed in orbit" means the gate held,
  // not "never got the chance to trigger".
  test("resting at the closest zoom with no further input stays in orbit", async ({ page }) => {
    test.slow();
    await seedIntroSeen(page);
    const canvas = await openGlobe(page);
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");

    const zoomInRole = page.getByRole("button", { name: "Zoom in" });
    let atFloor = false;
    for (let i = 0; i < 12 && !atFloor; i++) {
      const box = await zoomInRole.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
      const [distance, minDistance] = await Promise.all([
        canvas.getAttribute("data-camera-distance"),
        canvas.getAttribute("data-camera-min-distance"),
      ]);
      if (distance && minDistance && Number(distance) <= Number(minDistance) + 0.05) atFloor = true;
    }
    expect(atFloor).toBe(true);

    // No further input at all from here -- the exact scenario the old,
    // unbounded hold got wrong.
    await page.waitForTimeout(2_000);
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
    await expect(page.locator("[data-street-view]")).toHaveCount(0);
  });

  // Two different orbit orientations, through the seam StreetView.tsx arms
  // with (the exact StreetHandoff box the real zoom-hold gesture uses, not a
  // shortcut around it) -- proving the hand-off actually reaches MapLibre's
  // own camera, not just this lane's pure math module (cameraOrientation.test.ts
  // already covers that in isolation). A separate `test()` per orientation
  // (not a loop over one `page`) so each gets Playwright's own fresh
  // page/context -- `addInitScript` accumulates across navigations on a
  // reused page, which a loop would have to work around instead of just
  // avoiding.
  for (const { bearing, pitch } of [
    { bearing: 0, pitch: 0 },
    { bearing: 135, pitch: 55 },
  ]) {
    test(`street level opens with bearing ${bearing}/pitch ${pitch} matched to the globe camera, not the hardcoded defaults`, async ({ page }) => {
      await seedIntroSeen(page);
      await page.addInitScript(
        ([lat, lon, b, p]) => {
          (
            window as unknown as { __GLOBE_TEST_STREET__: { lat: number; lon: number; bearing: number; pitch: number } }
          ).__GLOBE_TEST_STREET__ = { lat, lon, bearing: b, pitch: p };
        },
        [18.5195, 73.8412, bearing, pitch] as const,
      );
      await openGlobe(page);
      await expect(page.locator("[data-street-view]")).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_STREET_MAP__)).toBe("object");

      const [gotBearing, gotPitch] = await page.evaluate(() => [
        window.__GLOBE_TEST_STREET_MAP__!.getBearing(),
        window.__GLOBE_TEST_STREET_MAP__!.getPitch(),
      ]);
      expect(gotBearing).toBeCloseTo(bearing, 0);
      expect(gotPitch).toBeCloseTo(pitch, 0);
    });
  }

  test("zooming out of the street map past its own floor returns to orbit over the same point", async ({ page }) => {
    await seedIntroSeen(page);
    // This worktree has no trigger lane wired up to open street level from a
    // real click path (same gap lane W3's own spec documents) -- the e2e
    // seam already exists for exactly this (__GLOBE_TEST_STREET__), and this
    // test is about the EXIT side of the hand-off, not how street opened.
    await page.addInitScript(() => {
      (window as unknown as { __GLOBE_TEST_STREET__: { lat: number; lon: number } }).__GLOBE_TEST_STREET__ = { lat: 18.5195, lon: 73.8412 };
    });
    const canvas = await openGlobe(page);
    await expect(page.locator("[data-street-view]")).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_STREET_MAP__)).toBe("object");
    // Programmatic, not a simulated wheel gesture: MapLibre fires the same
    // "zoom" event either way, and the hand-off hook reads its own live
    // zoom/center off the map instance regardless of what moved it.
    await page.evaluate(() => window.__GLOBE_TEST_STREET_MAP__!.setZoom(9));

    await expect(page.locator("[data-street-view]")).toHaveCount(0);
    // A generous timeout: this exit path arms a real camera flight (not an
    // instant snap) from a MapLibre event handler outside React's own render
    // cycle, one render tick removed from the store write above.
    await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 15_000 }).toBe("orbit");
  });
});

test.describe("cinematic first-visit intro", () => {
  // Opt back out of the suite-wide "already seen" storageState (playwright.config.ts):
  // this is the one describe block that actually tests the intro playing.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("plays once on a fresh browser, then never replays", async ({ page }) => {
    test.slow();
    const canvas = await openGlobe(page);
    const intro = page.locator("[data-globe-intro]");
    await expect(intro).toBeVisible();
    await expect(canvas).toHaveAttribute("data-camera-flying", "true");

    await page.getByRole("button", { name: "Skip introduction" }).click();
    await expect(intro).toHaveCount(0);

    await page.reload();
    await waitForHydration(page);
    await expect(page.locator("[data-globe-intro]")).toHaveCount(0);
  });

  test("any input skips it early, handing the camera back to orbit", async ({ page }) => {
    const canvas = await openGlobe(page);
    await expect(page.locator("[data-globe-intro]")).toBeVisible();

    await page.keyboard.press("Space");

    await expect(page.locator("[data-globe-intro]")).toHaveCount(0);
    await expect.poll(async () => canvas.getAttribute("data-camera-flying"), { timeout: 3_000 }).toBe("false");
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
  });

  test("never plays under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGlobe(page);
    await expect(page.locator("[data-globe-intro]")).toHaveCount(0);
  });
});
