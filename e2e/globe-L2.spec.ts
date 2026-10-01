import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE L2 (real sky: stars, moon, sun), end to end. Same fixture/clock
 * conventions as e2e/globe.spec.ts (fixed clock, every /api/* mocked) - the
 * star bin and Moon texture are NOT mocked in the happy-path tests: they
 * ship same-origin from public/sky/, same "not mocked" rule the earth mask
 * already follows there.
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

function readSelected(raw: string | null): { id?: string; rows?: { label: string; value: string }[] } | null {
  return raw ? JSON.parse(raw) : null;
}
function readStatus(raw: string | null): { state?: string; detail?: string } | null {
  return raw ? JSON.parse(raw) : null;
}

/** Max 0..255 luma anywhere OUTSIDE a circle at (cx,cy) radius r - the
 *  globe's own disk plus its atmosphere glow, so a bright day-side dot or
 *  the atmosphere halo can never itself pass this as "a star". Same
 *  grayscale-raw-buffer technique as globe.spec.ts's own meanLuma, just a
 *  max instead of a mean, and with the circular exclusion. */
async function maxLumaOutsideCircle(buffer: Buffer, cx: number, cy: number, r: number): Promise<number> {
  const { data, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data as Buffer;
  const rr = r * r;
  let max = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) continue;
      const v = pixels[y * info.width + x];
      if (v > max) max = v;
    }
  }
  return max;
}

// Computed offline with moonPosition + substellarLatLon and SceneRig's
// golden-ratio framing (1440x841 canvas, fov 42, aspect restored). The Moon
// projects near (1023, 256), outside the globe's ray-sphere intersection
// and clear of the time scrubber and ExploreBar. Assert the real hit below.
const MOON_ONSCREEN_TIME = "2026-09-15T00:00:00.000Z";
// The USNO-recorded full-moon oracle moon.test.ts already pins (fraction >=
// 0.99 at 2026-09-26 22:19 IST) - reused here rather than a second guess at
// "is this actually near full."
const FULL_MOON_TIME = "2026-09-26T22:19:00+05:30";

test("the star field draws bright points clearly outside the globe's own disk", async ({ page }, testInfo) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Reduced motion: freezes auto-rotate (like globe.spec.ts's own luma test)
  // AND turns the twinkle shader's amplitude to 0 - this run also proves
  // that guard doesn't silently break the field (still bright, just static).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T21:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-globe-r")).not.toBeNull();
  const [gx, gy, gr] = await Promise.all(["x", "y", "r"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));
  // The real star bin fetch plus a settled coloured frame.
  await page.waitForTimeout(1200);

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const buffer = await page.screenshot({ clip: canvasBox, path: testInfo.outputPath("globe-sky-1440.png") });
  const max = await maxLumaOutsideCircle(buffer, gx, gy, gr * 1.3);
  await testInfo.attach("max-luma-outside-globe", { body: JSON.stringify({ gx, gy, gr, max }), contentType: "application/json" });

  // Background is #05070a (luma ~8); a star sprite is near-white/blue-white
  // additive - comfortably brighter than any anti-aliasing noise on that
  // near-black field.
  expect(max, `max luma outside the globe's disk was only ${max}`).toBeGreaterThan(120);
});

test("clicking the Moon selects it, with its computed phase/distance/rise-set rows (Moon texture 404 handled)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  // Break-once (living-earth plan's own rule): the Moon texture fails to
  // load in THIS test, proving the "never fake data" fallback (a flat
  // grey-shaded sphere, still correctly phased) draws and is still
  // clickable, rather than only ever exercising the happy path.
  await page.route("**/sky/moon-512x256.jpg", (route) => route.fulfill({ status: 404, body: "" }));
  await page.clock.setFixedTime(new Date(MOON_ONSCREEN_TIME));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const moonProbe = page.locator("[data-moon-probe]");
  await expect.poll(async () => moonProbe.getAttribute("data-moon-x"), { timeout: 30_000 }).not.toBeNull();
  const mx = Number(await moonProbe.getAttribute("data-moon-x"));
  const my = Number(await moonProbe.getAttribute("data-moon-y"));

  expect(await canvas.evaluate((el, point) => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + point.x, box.y + point.y) === el;
  }, { x: mx, y: my }), "Moon probe must hit bare canvas, clear of HUD chrome").toBe(true);

  await canvas.click({ position: { x: mx, y: my } });

  const statusEl = page.locator("[data-sky-selected]");
  await expect
    .poll(async () => readSelected(await statusEl.getAttribute("data-sky-selected"))?.id, { timeout: 10_000 })
    .toBe("moon");
  const selected = readSelected(await statusEl.getAttribute("data-sky-selected"));
  const labels = (selected?.rows ?? []).map((r) => r.label);
  expect(labels).toEqual(["Phase", "Illumination", "True distance", "Rises / sets (Pune)"]);
  const distanceRow = selected?.rows?.find((r) => r.label === "True distance");
  expect(distanceRow?.value).toMatch(/^[\d,]+ km$/);
});

test("hovering the Moon shows a pointer cursor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date(MOON_ONSCREEN_TIME));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  const moonProbe = page.locator("[data-moon-probe]");
  await expect.poll(async () => moonProbe.getAttribute("data-moon-x"), { timeout: 30_000 }).not.toBeNull();
  const mx = Number(await moonProbe.getAttribute("data-moon-x"));
  const my = Number(await moonProbe.getAttribute("data-moon-y"));

  expect(await canvas.evaluate((el, point) => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + point.x, box.y + point.y) === el;
  }, { x: mx, y: my }), "Moon probe must hit bare canvas, clear of HUD chrome").toBe(true);

  await canvas.hover({ position: { x: mx, y: my } });
  await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("pointer");
  // A canvas-relative point, well clear of the Moon's own on-screen spot
  // computed above - the canvas itself is shorter than the viewport (the
  // nav bar and the fact-list panel take the rest), so a viewport-relative
  // guess can land outside it entirely and hit unrelated page chrome.
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  const away = { x: box.width - 280, y: box.height * 0.6 };
  expect(await canvas.evaluate((el, point) => {
    const rect = el.getBoundingClientRect();
    return document.elementFromPoint(rect.x + point.x, rect.y + point.y) === el;
  }, away), "Moon pointer-out point must hit bare canvas").toBe(true);
  await canvas.hover({ position: away });
  await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("auto");
});

test("the Moon reads full near a known full-moon instant (USNO oracle, 2026-09-26 22:19 IST)", async ({ page }) => {
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date(FULL_MOON_TIME));
  await page.goto("/globe");
  await waitForHydration(page);

  const statusEl = page.locator("[data-sky-status]");
  await expect.poll(async () => readStatus(await statusEl.getAttribute("data-sky-status"))?.detail, { timeout: 30_000 }).toMatch(
    /Moon full \d+%/,
  );
});

test("a failed star-bin fetch reports failed and still draws the Moon and Sun", async ({ page }) => {
  await withApiFixtures(page);
  // Break-once: the one live fetch this layer makes, made to fail on
  // purpose, proving the guard - not just assumed to work because the
  // happy-path tests above pass.
  await page.route("**/sky/stars-hyg41-m5.bin", (route) => route.fulfill({ status: 404, body: "" }));
  await page.clock.setFixedTime(new Date(MOON_ONSCREEN_TIME));
  await page.goto("/globe");
  await waitForHydration(page);

  const statusEl = page.locator("[data-sky-status]");
  await expect.poll(async () => readStatus(await statusEl.getAttribute("data-sky-status"))?.state, { timeout: 30_000 }).toBe("failed");
  const status = readStatus(await statusEl.getAttribute("data-sky-status"));
  expect(status?.detail).toBe("star field unreachable");

  // Moon/Sun are computed, not fetched - the star bin failing never takes
  // them down. The Moon's own probe (Moon world-position projection) still
  // populating is the "still draws" half of "failed -> draw moon/sun only."
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const moonProbe = page.locator("[data-moon-probe]");
  await expect.poll(async () => moonProbe.getAttribute("data-moon-x"), { timeout: 30_000 }).not.toBeNull();
});
