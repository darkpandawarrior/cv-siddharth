import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { PUNE_SELECTION_ID } from "../src/world/globe/puneSelection.ts";
import type { Page } from "@playwright/test";

/**
 * /globe, end to end (living-ledger-spec.md#6.3, this lane's own acceptance
 * list). Fixed clock, every /api/* the route touches routed to a committed
 * fixture (G10). The Black Marble mask is NOT mocked: it ships same-origin
 * from public/sky/, and mocking it is how a production 404 once passed this
 * whole spec while the live globe drew no earth at all.
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

/** Mean 0..255 luma of a screenshot buffer — same technique as
 *  studio-sky.spec.ts's own `meanLuma`. */
async function meanLuma(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data as Buffer;
  let sum = 0;
  for (const p of pixels) sum += p;
  return sum / pixels.length;
}

type Box = { x: number; y: number; width: number; height: number };

/** Splits the globe's own screen square into the day/night halves that
 *  `data-day-side` (GlobeScene's SubsolarProbe) names — the "clip regions
 *  computed from the subsolar point projection" this lane's acceptance line
 *  asks for, computed once in-page and read here as a plain string. */
function dayNightClips(box: Box, daySide: string): { day: Box; night: Box } {
  const half = (b: Box, side: "left" | "right" | "top" | "bottom"): Box => {
    if (side === "left") return { x: b.x, y: b.y, width: b.width / 2, height: b.height };
    if (side === "right") return { x: b.x + b.width / 2, y: b.y, width: b.width / 2, height: b.height };
    if (side === "top") return { x: b.x, y: b.y, width: b.width, height: b.height / 2 };
    return { x: b.x, y: b.y + b.height / 2, width: b.width, height: b.height / 2 };
  };
  const opposite: Record<string, "left" | "right" | "top" | "bottom"> = { left: "right", right: "left", top: "bottom", bottom: "top" };
  const side = daySide as "left" | "right" | "top" | "bottom";
  return { day: half(box, side), night: half(box, opposite[side]) };
}

// Pune dusk, not noon: the camera opens over Pune, so at noon the whole
// visible disk is daylit and a half-vs-half luma comparison only measured
// how much land each half happened to hold. At dusk the terminator runs
// through the view, which is the one condition this test is about. Reduced
// motion freezes auto-rotate so the crop matches the probe's frame, and the
// Pune card is hidden so only WebGL pixels are measured.
test("the day hemisphere reads brighter than the night hemisphere at Pune dusk", async ({ page }, testInfo) => {
  test.slow(); // a real WebGL settle plus two screenshot crops
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T18:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  // Desktop preselects Pune in the Inspector on first load (LANE U1, task
  // 4); hide it so a luma crop of the globe's own disk never measures the
  // Inspector card's flat background instead of WebGL pixels.
  await page.addStyleTag({ content: "[data-globe-inspector]{display:none!important}" });

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(700); // the mocked mask fetch plus the first coloured frame

  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-day-side")).not.toBeNull();
  const daySide = (await probe.getAttribute("data-day-side"))!;

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const [gx, gy, gr] = await Promise.all(["x", "y", "r"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));
  const box = { x: canvasBox.x + gx - gr, y: canvasBox.y + gy - gr, width: 2 * gr, height: 2 * gr };
  const { day, night } = dayNightClips(box, daySide);

  const dayLuma = await meanLuma(await page.screenshot({ clip: day, path: testInfo.outputPath("globe-day-1440.png") }));
  const nightLuma = await meanLuma(await page.screenshot({ clip: night, path: testInfo.outputPath("globe-night-1440.png") }));
  await testInfo.attach("luma", { body: JSON.stringify({ daySide, dayLuma, nightLuma }), contentType: "application/json" });

  expect(dayLuma, `day luma ${dayLuma} vs night luma ${nightLuma} (day side: ${daySide})`).toBeGreaterThan(nightLuma);
});

// The floating Pune <Html> card is retired (LANE U1, task 4) - its three
// claim sentences now live in the Inspector, opened by clicking the ring or,
// on desktop, preselected on first load. These two tests replace the old
// "hides the Pune card" coverage: one proves the preselect, one proves the
// HUD's own markers toggle closes that selection (and only that toggle -
// see globe-L5.spec.ts for the layer panel's own row, which deliberately
// does NOT carry this side effect).
test("desktop first load preselects Pune in the Inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.goto("/globe");
  await waitForHydration(page);

  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  await expect(inspector).toContainText("PUNE");
  // Never abbreviated (G8) - the exact claim sentence, not a summary.
  await expect(inspector).toContainText("install floor across 88 live listings");
});

test("the HUD's markers toggle closes the Pune selection when it is showing", async ({ page }) => {
  await page.addInitScript((id) => {
    (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = {
      id,
      kind: "origin",
      title: "PUNE · 18.52°N 73.86°E",
      rows: [{ label: "Reach", value: "test claim", swatch: "#3ddc84" }],
      source: "test fixture",
      live: false,
    };
  }, PUNE_SELECTION_ID);
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.goto("/globe");
  await waitForHydration(page);

  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Hide the Pune ring and reach columns" }).click();
  await expect(inspector).toHaveCount(0);

  await page.getByRole("button", { name: "Show the Pune ring and reach columns" }).click();
  // Showing the ring again does not resurrect a closed selection - only a
  // fresh ring click (or the desktop first-load preselect) does that.
  await expect(inspector).toHaveCount(0);
});

test("two mocked presences from two countries show two live dots and the right count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  // presenceGeo.ts's own e2e seam (G10: never a live playhtml room's real
  // occupancy) — set before the app boots, so the very first render already
  // reads it.
  await page.addInitScript(() => {
    (window as unknown as { __GLOBE_PRESENCE_TEST__: Record<string, number> }).__GLOBE_PRESENCE_TEST__ = { IN: 1, US: 1 };
  });
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-live]")).toHaveText("2 here now, from 2 countries");
  await expect(page.locator("[data-live-dot]")).toHaveCount(2);
});

test("reduced motion freezes auto-rotate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-autorotate]")).toHaveAttribute("data-autorotate", "off");
});

// Playwright refuses `test.use({ launchOptions })` inside a describe group
// (it forces a new worker, and this version only allows that at the top
// level or in the config file), so a literal `--disable-webgl` launch arg
// would have to own the whole file or a separate one - neither fits a single
// lane spec next to the WebGL-dependent tests above. `stubNoWebGL` is this
// codebase's own proven substitute for exactly this case (playground-world
// .spec.ts, visitors.spec.ts): it makes `getContext("webgl"/"webgl2")`
// return null, which is what `hasWebGL()` (blueprintShared.tsx) actually
// probes, so the browser is functionally WebGL-less for this page without
// needing a dedicated worker.
async function stubNoWebGL(page: Page) {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(orig, {
      apply(target, thisArg, args: [string, ...unknown[]]) {
        if (args[0] === "webgl" || args[0] === "webgl2" || args[0] === "experimental-webgl") return null;
        return Reflect.apply(target, thisArg, args);
      },
    });
  });
}

test("no WebGL: the fact list is visible with the reach sentences", async ({ page }) => {
  await stubNoWebGL(page);
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toHaveCount(0);
  const panel = page.locator("[data-globe-panel]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("install floor across 88 live listings");
  await expect(panel).toContainText("24 merged PRs in a repository starred 71k+ times");
  await expect(panel).toContainText("City markers:");
});
