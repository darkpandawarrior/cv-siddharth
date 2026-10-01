import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE C2 ("X-ray mode"), end to end. Reuses e2e/globe-W1.spec.ts's own
 * fixture shapes (whole-globe WMS imagery + real WMTS tile requests) rather
 * than duplicating them, since X-ray only has anything to draw once
 * TileLayer.tsx itself has real tiles on screen.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const WMTS_DIR = join(FIXTURES, "wmts");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));
const GIBS_BASE_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-base.jpg"));
const GIBS_NIGHT_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-night.jpg"));
const GIBS_SEAICE_PNG = readFileSync(join(FIXTURES, "gibs", "gibs-seaice.png"));
const TILE_BASE_JPG = readFileSync(join(WMTS_DIR, "tile-base.jpg"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

async function withWholeGlobeFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: GIBS_SEAICE_PNG });
    const body = url.includes("Black_Marble") ? GIBS_NIGHT_JPG : url.includes("BlueMarble") ? GIBS_BASE_JPG : GIBS_DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

/** Records every real WMTS tile request as it happens (registered before
 *  `page.goto`, unlike `page.waitForResponse`, which only sees responses
 *  that resolve AFTER it is called and misses ones already in flight or
 *  already settled by the time a test gets around to awaiting it -- the
 *  same request-array pattern e2e/globe-W1.spec.ts's own withWmtsFixtures
 *  uses, restated here per this lane's file-ownership rule). */
function withWmtsFixtures(page: Page): { count: number } {
  const counter = { count: 0 };
  void page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => {
    counter.count++;
    return route.fulfill({ contentType: route.request().url().endsWith(".png") ? "image/png" : "image/jpeg", body: TILE_BASE_JPG });
  });
  return counter;
}

/** Seeds "already seen" so the cinematic intro doesn't fight this suite for
 *  OrbitControls / the topbar's own click targets (globe-X5.spec.ts's own
 *  pattern, restated here per this lane's file-ownership rule). */
async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      /* private mode: the intro plays again, not this suite's concern */
    }
  });
}

async function gotoLiveGlobe(page: Page, path = "/globe") {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedIntroSeen(page);
  await withApiFixtures(page);
  await withWholeGlobeFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-27T12:27:00+05:30"));
  await page.goto(path);
  await waitForHydration(page);
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
}

/** Parses "draw calls\n123" out of the stats grid's own plain text. */
function parseStatValue(gridText: string, label: string): number {
  const m = gridText.match(new RegExp(`${label}\\s*\\n?\\s*([\\d,]+)`));
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
}

test("toggling X-ray on shows tile outlines and a plausible, non-zero stats card; toggling off removes both and draw calls drop", async ({ page }) => {
  const wmts = withWmtsFixtures(page);
  // Compare the same stationary scene: late live-feed glyphs and moving
  // tile generations otherwise add calls between the on/off snapshots.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoLiveGlobe(page, "/globe?ly=");
  const layers = page.locator("[data-globe-layer-panel] ul button[aria-pressed]");
  await expect(layers).not.toHaveCount(0);
  for (const layer of await layers.all()) await expect(layer).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-globe-composer]")).toHaveCount(1);
  await expect(page.locator("[data-cloud-shell]")).toHaveAttribute("data-cloud-shell", "ready");

  const toggle = page.locator("[data-xray-toggle]");
  await expect(toggle).toBeVisible();
  const panel = page.locator("[data-xray-panel]");
  await expect(panel).toBeHidden();

  // Real WMTS tiles must actually be on screen first, or X-ray has nothing
  // to draw an outline for.
  await expect.poll(() => wmts.count, { timeout: 15_000, message: "expected at least one WMTS tile request" }).toBeGreaterThan(0);

  await toggle.click();
  // Generous timeout: this is the panel's own lazy chunk's first fetch
  // (globe-L2/L3/L5/T1/U1's own convention for a first lazy-mounted panel).
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // The legend must show real tiles, not the empty state, once TileLayer's
  // own fetch/settle loop has actually loaded one.
  await expect
    .poll(async () => (await page.locator("[data-xray-legend]").innerText()).includes("no tiles drawn"), { timeout: 15_000 })
    .toBe(false);
  // Every requested base tile must have reached the drawn set, including
  // bitmap decoding and the renderer's crossfade, before measuring calls.
  await expect.poll(async () => {
    const text = await page.locator("[data-xray-legend]").innerText();
    const drawn = Number(text.match(/quadtree, (\d+)/)?.[1] ?? 0);
    return drawn > 0 && drawn === wmts.count;
  }).toBe(true);

  // Tiles settle independently of XRayTiles' first renderer.info sample.
  // Wait for that published sample, then read the grid as one snapshot.
  await expect.poll(async () => {
    const text = await page.locator("[data-xray-stats]").innerText();
    return ["draw calls", "triangles", "geometries"].every((label) => parseStatValue(text, label) > 0);
  }).toBe(true);
  await expect.poll(async () => {
    const text = await page.locator("[data-xray-stats]").innerText();
    return await page.evaluate(() => window.__GLOBE_TEST_GET_DRAW_CALLS__?.()) === parseStatValue(text, "draw calls");
  }).toBe(true);
  const statsText = await page.locator("[data-xray-stats]").innerText();
  const drawCallsOn = parseStatValue(statsText, "draw calls");
  const triangles = parseStatValue(statsText, "triangles");
  const geometries = parseStatValue(statsText, "geometries");
  expect(drawCallsOn).toBeGreaterThan(0);
  expect(triangles).toBeGreaterThan(0);
  expect(geometries).toBeGreaterThan(0);
  // fps is sampled from real frame timing (renderer.info doesn't cover it);
  // just assert it is a real, plausible number, not NaN or negative.
  const fps = parseStatValue(statsText, "fps");
  expect(fps).toBeGreaterThanOrEqual(0);
  expect(fps).toBeLessThan(1000);

  const drawCallsWhileOn = await page.evaluate(() => window.__GLOBE_TEST_GET_DRAW_CALLS__?.());
  // Include the scene and composer passes, not just the final full-screen quad.
  expect(drawCallsWhileOn).toBeGreaterThan(1);

  await toggle.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  // The outline mesh (and its own draw call) is gone once X-ray unmounts --
  // TileLayer's own tiles are still drawn, so this must be strictly less
  // than the reading captured while X-ray's overlay was also in the scene.
  await expect
    .poll(() => page.evaluate(() => window.__GLOBE_TEST_GET_DRAW_CALLS__?.()), { timeout: 5_000 })
    .toBeLessThan(drawCallsWhileOn!);
});

test("the keyboard shortcut (x) toggles X-ray the same as the topbar button", async ({ page }) => {
  withWmtsFixtures(page);
  await gotoLiveGlobe(page);
  const panel = page.locator("[data-xray-panel]");
  await expect(panel).toBeHidden();

  // Move focus onto the canvas (not a typing target) first -- ExploreBar's
  // own search combobox is reachable by tab and this lane's own keydown
  // guard correctly refuses to fire while a real typing target has focus,
  // same as it should. Click the canvas centre, not a corner: another
  // lane's always-mounted anomaly-rail nav overlays the canvas's top-left.
  await page.locator("[data-globe-root] canvas").first().click();
  await page.keyboard.press("x");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press("x");
  await expect(panel).toBeHidden();
});

// Regression for a wave-8 verifier defect: with X-ray open on real imagery,
// switching the earth style to "Dots" via the always-visible Layers panel
// left the stats card and tile legend frozen on the last real reading
// instead of reflecting the now-tileless dot-matrix earth -- and a re-toggle
// of X-ray off/on did not clear it either. layers/XRayTiles.tsx's own
// unmount cleanup (it unmounts together with TileLayer.tsx the moment style
// leaves "imagery") now resets both drawnTileSet.tiles and xrayState's
// stats, so this must read the empty/zero state, not a stale one.
test("switching earth style to Dots while X-ray is open clears the stale tile legend and stats, not just on re-toggle", async ({ page }) => {
  const wmts = withWmtsFixtures(page);
  await gotoLiveGlobe(page);

  const toggle = page.locator("[data-xray-toggle]");
  await toggle.click();
  const panel = page.locator("[data-xray-panel]");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  await expect.poll(() => wmts.count, { timeout: 15_000, message: "expected at least one WMTS tile request" }).toBeGreaterThan(0);
  await expect
    .poll(async () => (await page.locator("[data-xray-legend]").innerText()).includes("no tiles drawn"), { timeout: 15_000 })
    .toBe(false);
  await expect.poll(async () => parseStatValue(await page.locator("[data-xray-stats]").innerText(), "draw calls")).toBeGreaterThan(0);

  // "data-earth-style" is EarthImagery.tsx's own load-status probe
  // (imagery vs its internal GIBS-failure dots fallback) and only exists
  // while style === "imagery" -- it is not how the Layers panel's own Dots
  // toggle is read. That toggle's aria-pressed is (ui/LayerPanel.tsx's
  // earthStyleToggle, same pattern e2e/globe-L5.spec.ts already asserts).
  const dotsBtn = page.getByRole("button", { name: "Dots" });
  await dotsBtn.click();
  await expect(dotsBtn).toHaveAttribute("aria-pressed", "true");

  // The overlay component itself unmounts with TileLayer.tsx (both gated on
  // style === "imagery"), so the legend/stats card should now read empty,
  // never the last frame captured while imagery was still on screen.
  await expect(page.locator("[data-xray-legend]")).toContainText("no tiles drawn", { timeout: 5_000 });
  await expect.poll(async () => parseStatValue(await page.locator("[data-xray-stats]").innerText(), "draw calls")).toBe(0);

  // Re-toggling X-ray off and back on while still on Dots must not resurrect
  // the stale reading either.
  await toggle.click();
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-xray-legend]")).toContainText("no tiles drawn");
  await expect.poll(async () => parseStatValue(await page.locator("[data-xray-stats]").innerText(), "draw calls")).toBe(0);
});

// Break-it: prove the stats parser this suite's own assertions lean on
// actually reads the card's real "label\nvalue" shape, so a typo in the
// regex can't make every numeric assertion above vacuously pass.
test("break-it: the stats-card text parser reads a real value correctly", async () => {
  const sample = "draw calls\n42\ntriangles\n12,345\ngeometries\n7\ntextures\n3\nfps\n58";
  expect(parseStatValue(sample, "draw calls")).toBe(42);
  expect(parseStatValue(sample, "triangles")).toBe(12345);
  expect(parseStatValue(sample, "fps")).toBe(58);
  expect(parseStatValue(sample, "not a real label")).toBeNaN();
});
