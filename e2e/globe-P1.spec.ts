import { forceDeviceTier } from "./lib/deviceTier.ts";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise storm imagery preset on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

/**
 * LANE P1 (wave 7 parked list, now unblocked): layer preset chips
 * (ui/LayerPanel.tsx), "Surprise me" (ui/ExploreBar.tsx + ui/surpriseMe.ts),
 * and the Line2/LineMaterial swap for the measure arc and country borders
 * (ui/exploreMeasure.tsx, layers/CountryLayer.tsx). Same route-mock
 * discipline as e2e/globe-W11.spec.ts/globe-X2.spec.ts: a broad https abort
 * registered first (more specific routes registered after run first,
 * Playwright routes are LIFO) so every candidate this lane's "Surprise me"
 * could pick from an external feed (the ISS, launches, quakes) is
 * deterministically UNAVAILABLE unless a test explicitly seeds it -- leaving
 * only the two always-computable/static candidates (sunset, Maps places),
 * which `seedDeterministicRandom` below pins to a specific slot.
 */
async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    try { window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1"); } catch { /* same tolerance the app itself has */ }
  });
  await page.clock.setFixedTime(new Date("2026-09-29T13:00:00Z"));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.getByRole("combobox", { name: "Search places or ask the globe" })).toBeVisible({ timeout: 30_000 });
  // CameraDirector.tsx's own "hold at minimum zoom for 400ms" auto-handoff
  // to street view (WAVE 6 LANE X5, unrelated to this lane) fires whenever
  // the camera sits within 0.05 units of the orbit's closest distance for
  // any 400ms stretch -- which the globe's own default starting distance is
  // close enough to that a test with more than a couple of real-time awaits
  // can trip it by accident and land street view's full-screen dialog over
  // whatever this lane's own test was checking. One discrete zoom-out step
  // (the same HUD control a visitor would use) moves the camera comfortably
  // clear of that band for the rest of the test, since nothing here ever
  // zooms back in.
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  const openPanel = page.getByRole("button", { name: "Open the layers panel" });
  if (await openPanel.isVisible()) await openPanel.click();
}

/** Surprise me's `chooseCandidate` picks `pool[Math.floor(rand() * pool.length)]`
 *  -- forcing the global Math.random to 0 always selects index 0, whatever
 *  the pool's length, so a test never has to guess which candidates were
 *  filtered out by the route block above. */
async function seedDeterministicRandom(page: Page) {
  await page.addInitScript(() => { Math.random = () => 0; });
}

function layerButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true });
}

test.describe("layer presets", () => {
  test("Clean turns off every layer, announces what it did, and Restore undoes it", async ({ page }) => {
    await openGlobe(page);
    // Sanity: the default state has several layers on (globeStore.ts's own
    // initial `layers` record) -- if this ever changes, the preset would
    // silently stop proving anything.
    await expect(layerButton(page, "Stars and Moon")).toHaveAttribute("aria-pressed", "true");
    await expect(layerButton(page, "Earth events")).toHaveAttribute("aria-pressed", "true");

    // Keyboard reachable: focus the chip directly and activate with Enter,
    // not a mouse click, proving Tab+Enter actually works.
    await page.getByRole("button", { name: "Clean" }).focus();
    await page.keyboard.press("Enter");

    await expect(layerButton(page, "Stars and Moon")).toHaveAttribute("aria-pressed", "false");
    await expect(layerButton(page, "Satellites")).toHaveAttribute("aria-pressed", "false");
    await expect(layerButton(page, "Earth events")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-preset-announcement]")).toContainText("Turned off every layer");
    await expect(page.locator("[data-globe-presets]")).toHaveAttribute("data-clouds-on", "false");
    await expect(page.locator("[data-globe-presets]")).toHaveAttribute("data-story-arcs-on", "false");

    const restore = page.getByRole("button", { name: "Restore" });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(layerButton(page, "Stars and Moon")).toHaveAttribute("aria-pressed", "true");
    await expect(layerButton(page, "Earth events")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Restore" })).toHaveCount(0);
    await expect(page.locator("[data-globe-presets]")).toHaveAttribute("data-clouds-on", "true");
    await expect(page.locator("[data-globe-presets]")).toHaveAttribute("data-story-arcs-on", "true");
  });

  test("Storms sets real imagery and wires the GOES infrared overlay into the tile stack", async ({ page }) => {
    await openGlobe(page);
    await page.getByRole("button", { name: "Storms" }).click();
    await expect(layerButton(page, "Wind")).toHaveAttribute("aria-pressed", "true");
    await expect(layerButton(page, "Earth events")).toHaveAttribute("aria-pressed", "true");
    // Turned off, since Storms' own layersOn list doesn't include it.
    await expect(layerButton(page, "Stars and Moon")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Real imagery" })).toHaveAttribute("aria-pressed", "true");
    // TileLayer.tsx reports a role's status the moment it starts working the
    // overlay -- present (not undefined) is proof the preset's own overlayIds
    // actually reached the imagery stack, not just the summary text claiming it.
    await page.waitForFunction(() => window.__GLOBE_TEST_GET_IMAGERY_STATUS__?.("GOES-East_ABI_Band13_Clean_Infrared") !== undefined, { timeout: 10_000 });
  });

  test("Space never claims to turn on a layer that stays honestly off", async ({ page }) => {
    await openGlobe(page);
    await page.getByRole("button", { name: "Space", exact: true }).click();
    await expect(layerButton(page, "Stars and Moon")).toHaveAttribute("aria-pressed", "true");
    await expect(layerButton(page, "Satellites")).toHaveAttribute("aria-pressed", "true");
    await expect(layerButton(page, "Pune markers")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("[data-preset-announcement]")).toContainText("stars, Moon, planets and satellites");
  });
});

test.describe("Surprise me", () => {
  test("flies to a real computed place and says why, never an invented one", async ({ page }) => {
    await seedDeterministicRandom(page);
    await openGlobe(page);
    await page.getByRole("button", { name: "Surprise me" }).click();
    const answer = page.locator("[data-onebox-answer]");
    await expect(answer).toContainText("Surprise:");
    await expect(answer).toContainText("computed");
    const inspector = page.getByRole("region", { name: "Selection details" });
    await expect(inspector.getByRole("heading")).toHaveText(/^Sunset near /);
    await expect(inspector).toContainText("computed with the site's solar model");
    // Honest about being computed, not observed (house rule: computed things
    // say they are computed).
    await expect(inspector).toContainText("not observed");
  });

  test("picks a real tracked entity when one is available, and Undo restores the prior camera focus", async ({ page }) => {
    await seedDeterministicRandom(page);
    await page.addInitScript(() => { window.__W11_TEST__ = true; });
    await openGlobe(page);
    // Seed a prior focus + selection via the country-pick test seam
    // (globe-W11.spec.ts's own pattern) rather than a real "fly to <city>"
    // command: that command's flyTo has no explicit `distance`, which lands
    // the camera at OrbitControls' own closest zoom -- CameraDirector.tsx's
    // unrelated "hold at minimum zoom" auto-handoff (WAVE 6 LANE X5) then
    // races this test's own later awaits and can silently flip the view to
    // "street" mid-test, whose full-screen dialog then eats the Undo click.
    // A country pick's own focus carries an explicit `distance: 18`
    // (CountryLayer.tsx), far from minimum zoom, so it never arms that
    // handoff -- this test is about Surprise me's own undo, not that.
    const toggle = layerButton(page, "Countries");
    await toggle.click();
    await page.waitForFunction(() => !!window.__W11_COUNTRY__);
    await page.evaluate(() => window.__W11_COUNTRY__!.pick({ lat: 51.1657, lon: 10.4515 }));
    await expect(page.getByRole("region", { name: "Selection details" }).getByRole("heading")).toHaveText("Germany");

    await page.getByRole("region", { name: "Selection details" }).getByRole("button", { name: "Fly to", exact: true }).click();

    // ISS test seam (LayerPanel.tsx's own __GLOBE_TEST_SET_ENTITY__, the
    // same one "Follow the ISS" e2e coverage already relies on) stands in
    // for SatelliteLayer's real TLE fix, which this spec's own https block
    // makes unreachable.
    await page.evaluate(() => window.__GLOBE_TEST_SET_ENTITY__?.("sat:25544", { x: 6, y: 0, z: 0 }, { state: "snapshot", detail: "fixture orbital position" }));
    await page.getByRole("button", { name: "Surprise me" }).click();

    const answer = page.locator("[data-onebox-answer]");
    await expect(answer).toContainText("where the ISS is now");
    const inspector = page.getByRole("region", { name: "Selection details" });
    await expect(inspector.getByRole("heading")).toHaveText("The ISS, right now");

    const undo = answer.getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.locator("[data-onebox-answer]")).toHaveCount(0);
    await expect(inspector.getByRole("heading")).toHaveText("Germany");
  });

  test("never disabled: with the ISS untracked, launches uncached and quakes unreachable, it still finds a real place", async ({ page }) => {
    await seedDeterministicRandom(page);
    await openGlobe(page);
    await page.getByRole("button", { name: "Surprise me" }).click();
    await expect(page.locator("[data-onebox-answer]")).not.toContainText("No live source");
    await expect(page.getByRole("region", { name: "Selection details" })).toBeVisible();
  });
});

test.describe("Line2 regression: crisp borders and measure arc still behave", () => {
  test("country borders still highlight and pick correctly after the Line2 swap", async ({ page }) => {
    await page.addInitScript(() => { window.__W11_TEST__ = true; });
    await openGlobe(page);
    const toggle = layerButton(page, "Countries");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await page.waitForFunction(() => !!window.__W11_COUNTRY__);
    await page.evaluate(() => window.__W11_COUNTRY__!.pick({ lat: 48.8566, lon: 2.3522 }));
    const inspector = page.getByRole("region", { name: "Selection details" });
    await expect(inspector.getByRole("heading")).toHaveText("France");
    await page.evaluate(() => window.__W11_COUNTRY__!.hover({ lat: 48.8566, lon: 2.3522 }));
    await expect(page.getByRole("tooltip")).toHaveText("France");
    // A real, non-zero vertex count means LineSegmentsGeometry.setPositions
    // actually populated instanceStart/instanceEnd -- an empty/failed
    // conversion would leave 0 borders drawn but no thrown error.
    const vertices = await page.evaluate(() => window.__W11_COUNTRY__!.vertices);
    expect(vertices).toBeGreaterThan(1000);
  });

  test("the measurement arc still computes the same geodesic distance after the Line2 swap", async ({ page }) => {
    await page.addInitScript(() => { window.__W11_TEST__ = true; });
    await openGlobe(page);
    await page.getByRole("button", { name: "Measure", exact: true }).click();
    await page.evaluate(() => { window.__W11_POINT__!({ lat: 51.5074, lon: -0.1278 }); window.__W11_POINT__!({ lat: 40.7128, lon: -74.006 }); });
    await expect(page.locator("[data-measure-result]")).toHaveText("5570.2 km · 3007.7 nm · 288.3° initial");
  });
});


test("Surprise me works as a typed mobile command without requesting new feeds", async ({ page }) => {
  await seedDeterministicRandom(page);
  await openGlobe(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("**/api/ask**", (route) => { requests++; return route.abort(); });
  const box = page.getByRole("combobox", { name: "Search places or ask the globe" });
  await box.fill("surprise me");
  await box.press("Enter");
  await expect(page.locator("[data-onebox-answer]")).toContainText("Surprise:");
  expect(requests).toBe(0);
});
