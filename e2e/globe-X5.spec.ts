import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Locator, Page } from "@playwright/test";

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
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
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

async function openGlobe(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: width === 360 ? 740 : width === 390 ? 844 : 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

async function zoomToFloor(page: Page, canvas: Locator, width: number) {
  // Under suite load a fixed 150ms delay could read a pre-click frame,
  // issue more zoom intent at the floor, then accidentally test a hold.
  await expect(canvas).toHaveAttribute("data-camera-flying", "false");
  await expect.poll(() => canvas.getAttribute("data-camera-distance")).toBeTruthy();
  await expect.poll(() => canvas.getAttribute("data-camera-min-distance")).toBeTruthy();
  await page.getByRole("button", { name: "Zoom in", exact: true }).waitFor({ state: "attached" });
  if (!(await page.getByRole("button", { name: "Zoom in", exact: true }).isVisible())) await page.locator("[data-hud-overflow] > summary").click();
  const zoomInRole = page.getByRole("button", { name: "Zoom in" });
  let atFloor = false;
  for (let i = 0; i < 12 && !atFloor; i++) {
    const before = Number(await canvas.getAttribute("data-camera-distance"));
    const minimum = Number(await canvas.getAttribute("data-camera-min-distance"));
    const target = Math.max(minimum, before / 1.35);
    const box = await zoomInRole.boundingBox();
    if (!box) throw new Error("zoom control has no bounding box");
    if (width < 640) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    else {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
    }
    await expect.poll(async () => ({
      view: await canvas.getAttribute("data-camera-view"),
      reached: Number(await canvas.getAttribute("data-camera-distance")) <= target + 0.05,
    })).toEqual({ view: "orbit", reached: true });
    atFloor = Number(await canvas.getAttribute("data-camera-distance")) <= minimum + 0.05;
  }
  expect(atFloor).toBe(true);
}

for (const width of [1440, 390, 360]) {
test.describe(`seamless zoom into street level and back at ${width}px`, () => {
  test.use({ hasTouch: width < 640 });
  test("holding at the closest zoom for ~400ms opens street level", async ({ page }) => {
    test.slow();
    await seedIntroSeen(page);
    const canvas = await openGlobe(page, width);
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
    await zoomToFloor(page, canvas, width);
    const pill = page.getByRole("button", { name: "Zoom in", exact: true });
    const box = (await pill.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest("button")?.getAttribute("aria-label"), point)).toBe("Zoom in");
    const touch = width < 640 ? await page.context().newCDPSession(page) : null;
    try {
      if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
      // One native press, with no repeated input events keeping intent fresh.
      await expect(canvas).toHaveAttribute("data-camera-view", "street", { timeout: 8_000 });
      await expect(page.locator("[data-street-view]")).toBeVisible();
    } finally {
      if (touch) { await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await touch.detach(); }
      else await page.mouse.up();
    }
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
    const canvas = await openGlobe(page, width);
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");

    await zoomToFloor(page, canvas, width);

    // Observe every rendered frame for two seconds without sending more input.
    await canvas.evaluate(el => new Promise<void>((resolve, reject) => {
      const start = performance.now();
      const check = () => {
        if (el.dataset.cameraView !== "orbit" || Number(el.dataset.cameraDistance) > Number(el.dataset.cameraMinDistance) + 0.05) {
          reject(new Error("resting camera left the orbit floor"));
        } else if (performance.now() - start >= 2000) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }));
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
      await openGlobe(page, width);
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
    const canvas = await openGlobe(page, width);
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

}

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
