import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 5 LANE W15 (together: anonymous live viewports of other explorers).
 * Fixed clock, every /api/* route mocked (G10, same discipline as
 * e2e/globe.spec.ts) -- this spec never depends on a live network, and
 * never depends on playhtml's real `globe-view-v1` room either:
 * `__GLOBE_TOGETHER_TEST__` (togetherPresence.ts's own seam) injects exactly
 * the "other explorers" each test wants, the same way `__GLOBE_PRESENCE_TEST__`
 * already does for the country-presence lanes.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

type FakeExplorer = { lat: number; lon: number; zoom: "orbit" | "region" | "close"; mode: "orbit" | "ground" | "follow" | "street" };

async function setExplorers(page: Page, explorers: Record<string, FakeExplorer>) {
  await page.addInitScript((e) => {
    (window as unknown as { __GLOBE_TOGETHER_TEST__: unknown }).__GLOBE_TOGETHER_TEST__ = e;
  }, explorers);
}

const TWO_EXPLORERS: Record<string, FakeExplorer> = {
  "peer-mumbai": { lat: 21, lon: 72, zoom: "region", mode: "orbit" },
  "peer-buenos-aires": { lat: -33, lon: -60, zoom: "close", mode: "orbit" },
};

async function openGlobe(page: Page, { reducedMotion = true }: { reducedMotion?: boolean } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

test("two injected explorers render exactly two reticles", async ({ page }) => {
  await setExplorers(page, TWO_EXPLORERS);
  await openGlobe(page);

  const seam = page.locator("[data-together-layer]");
  await expect(seam).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => seam.getAttribute("data-together-count"), { timeout: 10_000 }).toBe("2");
});

test("the live count reads 2, the same total the store and the future \"exploring with you\" line read from", async ({ page }) => {
  await setExplorers(page, TWO_EXPLORERS);
  await openGlobe(page);

  const seam = page.locator("[data-together-layer]");
  await expect.poll(async () => seam.getAttribute("data-together-total"), { timeout: 10_000 }).toBe("2");
});

test("clicking a reticle flies the camera to look where that explorer looks", async ({ page }) => {
  test.slow(); // a real WebGL settle plus a camera flight to land
  await setExplorers(page, TWO_EXPLORERS);
  // reducedMotion: false -- CameraDirector.tsx's own click-to-fly effect
  // (correctly, per the house reduced-motion rule) jumps the camera
  // INSTANTLY under reduced motion rather than animating, so
  // data-camera-flying below would never see "true" under the default
  // reducedMotion: true this file's other tests use.
  const canvas = await openGlobe(page, { reducedMotion: false });

  const seam = page.locator("[data-together-layer]");
  await expect.poll(async () => seam.getAttribute("data-together-count"), { timeout: 10_000 }).toBe("2");
  await expect.poll(async () => seam.getAttribute("data-together-first-x"), { timeout: 10_000 }).not.toBeNull();

  await expect.poll(async () => canvas.getAttribute("data-camera-view")).toBe("orbit");
  const x = Number(await seam.getAttribute("data-together-first-x"));
  const y = Number(await seam.getAttribute("data-together-first-y"));
  await canvas.click({ position: { x, y } });

  // A click-to-fly in orbit view re-arms CameraDirector's flight without
  // switching `view` away from "orbit" (CameraDirector.tsx's own focus-only
  // effect) -- flying, then landing, still in orbit, is exactly what a
  // successful flyTo(store.focus) looks like from the outside.
  await expect.poll(async () => canvas.getAttribute("data-camera-flying"), { timeout: 5_000 }).toBe("true");
  await expect.poll(async () => canvas.getAttribute("data-camera-flying"), { timeout: 5_000 }).toBe("false");
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
});

// A manual orbit-drag, not auto-rotate: this lane's own machine runs ten
// lanes at once, and auto-rotate's ~0.35deg/s (GlobeScene.tsx's own
// autoRotateSpeed) needs several real seconds AND a load-dependent frame
// rate to cross even one 3-degree quantum -- flaky by construction on a
// shared box. A drag crosses tens of degrees in one gesture, so the
// PUBLISH_MS=2000ms throttle (not frame-rate luck) is what the wait below
// is actually timing.
async function dragOrbit(page: Page, canvas: ReturnType<Page["locator"]>) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 220, cy, { steps: 12 });
  await page.mouse.up();
}

test("turning sharing off stops publishing (break-once: this fails if the sharing gate is removed)", async ({ page }) => {
  test.slow(); // waits out PUBLISH_MS's own throttle window twice, for real
  await setExplorers(page, {}); // no peers needed -- this test only watches THIS tab's own publish count
  const canvas = await openGlobe(page); // reducedMotion default (true): no ambient auto-rotate noise, dragOrbit drives every view change deliberately

  await expect.poll(async () => canvas.getAttribute("data-camera-view")).toBe("orbit");
  await expect
    .poll(async () => page.evaluate(() => typeof window.__GLOBE_TOGETHER_SET_SHARING__ === "function"), { timeout: 10_000 })
    .toBe(true);

  const seam = page.locator("[data-together-layer]");
  // The very first reading publishes unconditionally (together.ts's own
  // shouldPublish: `if (!last) return true`).
  await expect.poll(async () => Number(await seam.getAttribute("data-together-publish-count")), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

  // A real, large view change -- crosses the 3-degree quantum by a wide
  // margin -- proves the throttle+threshold gate is actually live while
  // sharing is still on, not merely that a page just loaded.
  await dragOrbit(page, canvas);
  const afterFirstDrag = Number(await seam.getAttribute("data-together-publish-count"));
  await expect
    .poll(async () => Number(await seam.getAttribute("data-together-publish-count")), { timeout: 10_000 })
    .toBeGreaterThan(afterFirstDrag);

  await page.evaluate(() => window.__GLOBE_TOGETHER_SET_SHARING__?.(false));
  const afterOff = Number(await seam.getAttribute("data-together-publish-count"));

  // The same large drag again -- would unquestionably cross the quantum and
  // publish again if the sharing gate were removed -- but sharing is off.
  await dragOrbit(page, canvas);
  await page.waitForTimeout(2_500); // more than one PUBLISH_MS window
  const stillOff = Number(await seam.getAttribute("data-together-publish-count"));
  expect(stillOff, "publish count kept climbing after sharing was turned off").toBe(afterOff);
});
