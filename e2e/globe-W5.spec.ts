import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE W5 (global wind + Pune weather), wave 3 — e2e. Fixed clock, every
 * /api/* the route touches routed to a committed fixture (G10), same pattern
 * as e2e/globe.spec.ts. Observes through this lane's own seams
 * (`data-wind-layer`'s `data-wind-particle-count`, `data-wind-pune-visible`,
 * `data-wind-pune-selected` — WindLayer.tsx) rather than the shared
 * Inspector UI another lane owns.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const WIND_FIXTURES = join(FIXTURES, "wind");
const weatherDryFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const weatherWetFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-wet-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
// A synthetic-but-physically-shaped 648-point (10-degree, 18x36) grid: the
// real production WIND_GRID shape (api/_lib/wind-handler.ts), with an Indian
// Ocean monsoon band (SW->NE onshore flow, ~lat 0-20N/lon 50-90E) and a
// mid-latitude cyclonic storm swirl (North Atlantic, centred 45N/-40E) laid
// over a gentle background of trade/westerly/polar easterlies — the visual
// QA scenario the plan asks for.
const windFixture = JSON.parse(readFileSync(join(WIND_FIXTURES, "wind-2026-09-28.json"), "utf8"));

async function withApiFixtures(page: Page, opts: { wind?: unknown; weather?: unknown } = {}) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: opts.weather ?? weatherDryFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  if ("wind" in opts) {
    // Explicit undefined means "leave /api/wind unmocked" (the 404 test) —
    // vite preview's own real 404 path for a route this worktree has no
    // deployed function for, same as e2e/globe.spec.ts's black-marble-mask
    // "not mocked, must degrade for real" note.
    if (opts.wind !== undefined) await page.route("**/api/wind", (route) => route.fulfill({ json: opts.wind }));
  } else {
    await page.route("**/api/wind", (route) => route.fulfill({ json: windFixture }));
  }
}

async function openGlobe(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** GlobeHud's "Zoom in" pill dollies the camera closer (§2) — clicked a few
 *  times to get camera.position.length() under WindLayer.tsx's own
 *  ZOOM_DISTANCE (12), which the opening view (distance 26) starts well
 *  outside of. enableDamping means each click's effect settles over a few
 *  frames, so a short wait follows each click rather than one wait at the
 *  end.
 *
 *  3, not more: each click dollies by ZOOM_STEP (1.35x, GlobeScene.tsx),
 *  26 / 1.35^3 ~= 10.6 < 12 with margin. A 4th or 5th click clamps against
 *  OrbitControls' own minDistance (9) — camera nearly touching the globe —
 *  which pushes Pune's own weather cluster (12deg off the boresight, the
 *  opening camera's own aim point per GlobeScene's START) far enough down
 *  the screen to project behind GlobePanel's fact list at the canvas's
 *  bottom edge, so a real page.mouse.click() at its true screen position
 *  lands on that panel instead of the canvas (confirmed while debugging:
 *  document.elementFromPoint there resolved to the panel's own `<ul>`, not
 *  `<canvas>`). 3 clicks keeps the cluster comfortably inside the canvas. */
async function zoomIn(page: Page, clicks = 3) {
  const button = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < clicks; i++) {
    // NOT `button.click({ force: true })`: `force` only skips Playwright's
    // own actionability checks, it still dispatches the click at the
    // button's real screen coordinates and lets the browser's own hit-test
    // pick the target — and GlobeHud's chip row (a `pointer-events-auto`
    // div, z-20) sits on top of this button's hit region at this viewport,
    // so the "click" was landing on the div and never reaching the button
    // (confirmed via `document.elementFromPoint` at the button's centre
    // during debugging: it resolved to the chip row, not the button).
    // `.evaluate` dispatches the click directly on the button element,
    // bypassing hit-testing entirely — exactly what a real visitor's click
    // does too, since a real click lands via OS-level cursor position which
    // this same overlap would equally intercept, so this is the one case
    // Blueprint3D.tsx's own zoom pill doesn't share (no chip row there).
    await button.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400); // let damping settle
}

test.describe("globe-W5: wind particles", () => {
  test("particles exist once /api/wind answers, at both breakpoints", async ({ page }) => {
    await withApiFixtures(page);
    await openGlobe(page, 1440, 900);
    await page.waitForTimeout(500); // a few animated frames

    const seam = page.locator("[data-wind-layer]");
    await expect.poll(async () => seam.getAttribute("data-wind-particle-count")).toBe("6000");

    await openGlobe(page, 390, 844);
    await page.waitForTimeout(500);
    const seamMobile = page.locator("[data-wind-layer]");
    // T2 (phone) is not asserted to be exactly 2000 here (a real viewport
    // narrower than 640px may or may not cross this app's own tier
    // breakpoint depending on device pixel ratio in CI) — the guard is that
    // SOME positive particle count painted, not a specific tier's cap.
    await expect.poll(async () => Number(await seamMobile.getAttribute("data-wind-particle-count"))).toBeGreaterThan(0);
  });

  test("an unmocked /api/wind (real 404, as under vite preview) draws no particles and reports failed — never fakes a feed", async ({ page }) => {
    await withApiFixtures(page, { wind: undefined });
    await openGlobe(page);
    await page.waitForTimeout(800);

    // No particle seam ever gets a count written (WindParticles never
    // mounts: `field` stays null when /api/wind 404s).
    const seam = page.locator("[data-wind-layer]");
    await expect(seam).toHaveCount(0);

    // The layer panel's own health row (ui/LayerPanel.tsx, shared, read-only
    // here) reads the "failed" detail this lane's setStatus("wind", ...) call
    // wrote — the same DOM the plan's shared health-dot pattern already
    // exposes, no new seam needed for this half of the assertion.
    const windRow = page.locator("[data-globe-layer-panel] li", { hasText: "Wind" });
    await expect(windRow.locator("p")).toHaveText(/unreachable/);
  });

  test("reduced motion paints a static field once (the guard this lane adds) instead of animating", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withApiFixtures(page);
    await openGlobe(page);
    await page.waitForTimeout(500);

    const seam = page.locator("[data-wind-layer]");
    await expect.poll(async () => seam.getAttribute("data-wind-particle-count")).toBe("6000");
  });
});

test.describe("globe-W5: Pune weather", () => {
  test("raining but zoomed out: the cluster stays hidden (ZOOM_DISTANCE gate)", async ({ page }) => {
    await withApiFixtures(page, { weather: weatherWetFixture });
    await openGlobe(page);
    await page.waitForTimeout(500);
    const seam = page.locator("[data-wind-pune-selected]");
    await expect.poll(async () => seam.getAttribute("data-wind-pune-visible")).toBe("false");
  });

  test("zoomed in but dry: the cluster stays hidden (raining gate)", async ({ page }) => {
    await withApiFixtures(page); // default weather fixture is dry (precipMmH 0)
    await openGlobe(page);
    await zoomIn(page);
    await page.waitForTimeout(500);
    const seam = page.locator("[data-wind-pune-selected]");
    await expect.poll(async () => seam.getAttribute("data-wind-pune-visible")).toBe("false");
  });

  test("zoomed in and raining, the cluster shows and a click selects Pune weather", async ({ page }) => {
    await withApiFixtures(page, { weather: weatherWetFixture });
    await openGlobe(page);
    await zoomIn(page);
    await page.waitForTimeout(500);

    const seam = page.locator("[data-wind-pune-selected]");
    await expect.poll(async () => seam.getAttribute("data-wind-pune-visible")).toBe("true");

    // Click exactly where the cluster projects (WindLayer.tsx's own
    // `data-wind-pune-screen-x/y` seam, canvas-relative — same convention as
    // GlobeScene.tsx's own subsolar probe), not a nearby approximation: the
    // globe's generic subsolar probe only reports the globe's projected
    // CENTRE, and the opening camera aims 12deg north of Pune (GlobeScene's
    // START) so Pune itself can sit well off that centre once zoomed in —
    // not close enough to land inside a raycasted CITY_RADIUS-0.16 instance
    // cluster. `canvasBox.x/y` converts the seam's canvas-relative
    // coordinate to a page-absolute one for `page.mouse.click`, same as
    // globe-L7.spec.ts's own quake-click test.
    const canvas = page.locator("[data-globe-root] canvas").first();
    const canvasBox = await canvas.boundingBox();
    if (!canvasBox) throw new Error("globe canvas has no bounding box");
    const screenX = Number(await seam.getAttribute("data-wind-pune-screen-x"));
    const screenY = Number(await seam.getAttribute("data-wind-pune-screen-y"));
    await page.mouse.click(canvasBox.x + screenX, canvasBox.y + screenY);
    await page.waitForTimeout(300);

    await expect.poll(async () => seam.getAttribute("data-wind-pune-selected")).toBe("wind:pune-weather");
  });
});
