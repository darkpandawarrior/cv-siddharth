import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * /globe, end to end (living-ledger-spec.md#6.3, this lane's own acceptance
 * list). Fixed clock, every /api/* the route touches routed to a committed
 * fixture (G10) — including the Black Marble mask, a static heavy asset
 * `heavy()` resolves to an absolute darkpandawarrior.github.io URL in a real
 * deploy, so a required gate mocks it here rather than depending on that
 * publish step having run.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const EARTH_MASK_PATH = join(ROOT, "heavy", "globe", "earth-720x360.bin");

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/earth-720x360.bin", (route) =>
    route.fulfill({ path: EARTH_MASK_PATH, contentType: "application/octet-stream" }),
  );
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

/** Splits the canvas's own bounding box into the day/night halves that
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

test("the day hemisphere reads brighter than the night hemisphere at real Pune noon", async ({ page }, testInfo) => {
  test.slow(); // a real WebGL settle plus two screenshot crops
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(700); // the mocked mask fetch plus the first coloured frame

  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-day-side")).not.toBeNull();
  const daySide = (await probe.getAttribute("data-day-side"))!;

  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  const { day, night } = dayNightClips(box, daySide);

  const dayLuma = await meanLuma(await page.screenshot({ clip: day, path: testInfo.outputPath("globe-day-1440.png") }));
  const nightLuma = await meanLuma(await page.screenshot({ clip: night, path: testInfo.outputPath("globe-night-1440.png") }));
  await testInfo.attach("luma", { body: JSON.stringify({ daySide, dayLuma, nightLuma }), contentType: "application/json" });

  expect(dayLuma, `day luma ${dayLuma} vs night luma ${nightLuma} (day side: ${daySide})`).toBeGreaterThan(nightLuma);
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
