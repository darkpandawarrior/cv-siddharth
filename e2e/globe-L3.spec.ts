import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * LANE L3 (real orbits) — /globe's satellite layer, end to end. Only
 * `/api/tle` is mocked (this lane's own feed); every other `/api/*` this
 * page touches 404s under `vite preview` the same way it does in
 * production-without-a-function, and every other layer already degrades to
 * "failed, draw nothing" on that — the shared contract every lane in
 * 2026-09-27-globe-lanes.md carries, not something this spec needs to fake.
 *
 * Two clocks, both against the fixture's own committed TLEs (still fresh:
 * isFresh's 7-day window is measured from each element's own epoch, not from
 * satellites.test.ts's CLOCK): the label-visibility test needs the ISS on
 * the globe's near (Pune-facing) side, or the label's own occlusion check
 * correctly hides it — this spec's own scratch scan (satellite.js's
 * ecfToLookAngles from Pune, same math as satellites.ts) found the elevation
 * from Pune peaks at 59.4° at 2026-09-26T06:36:11Z, comfortably clear of the
 * horizon this occlusion test guards. The 404 test doesn't propagate
 * anything, so it keeps satellites.test.ts's own validated instant.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const ISS_OVERHEAD_CLOCK = new Date("2026-09-26T06:36:11Z");

test("the ISS renders a label and clicking it selects it", async ({ page }) => {
  test.slow(); // shares the machine with other globe specs under a real WebGL scene
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.clock.setFixedTime(ISS_OVERHEAD_CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });

  const label = page.locator('[data-sat-label="25544"]');
  await expect(label).toBeVisible({ timeout: 30_000 });

  const selected = page.locator("[data-sat-selected]");
  await expect(selected).toBeAttached();
  // The label is a real DOM node in drei's Html portal, not a WebGL hit
  // target, so a plain click is reliable here; dispatchEvent is the fallback
  // this spec would reach for if the portal's overlay stacking ever made the
  // 3D-scene click flaky. Under parallel-worker CPU contention (this file
  // runs alongside globe.spec.ts's own heavy WebGL specs) a first click can
  // land before React's own event delegation has attached, the same class
  // of flake e2e/lib/test.ts's waitForHydration exists for elsewhere — so
  // this retries the click itself rather than only the assertion.
  await expect
    .poll(
      async () => {
        await label.click();
        return selected.getAttribute("data-sat-selected");
      },
      { timeout: 20_000 },
    )
    .toBe("sat:25544");
});

test("no satellite label renders when the TLE feed is unreachable (the dev/preview 404 path)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/tle", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  // Give the failed fetch (and useLiveSignal's own retry snapshot) time to
  // settle before asserting an absence — an absence checked too early proves
  // nothing.
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-sat-label]")).toHaveCount(0);
});
