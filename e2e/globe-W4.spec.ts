import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise constellation figures, labels and planets on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 1);
});

/**
 * LANE W4 (wave 3: constellations, planets, ISS visible passes), end to end.
 * Same fixture/clock conventions as e2e/globe.spec.ts (fixed clock, every
 * /api/* mocked) — public/sky/constellations.json is NOT mocked in the
 * happy-path tests, same "ships same-origin, not mocked" rule the star bin
 * and Moon texture already follow in e2e/globe-L2.spec.ts.
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

/** Reads an Inspector row's value by its label (ui/Inspector.tsx, LANE L5 —
 *  a real production panel, not a test-only probe) — the `<dt>`/`<dd>` pair
 *  `selected.rows` renders as. */
function inspectorRow(page: Page, label: string) {
  return page.locator("[data-globe-inspector] dl > div", { has: page.locator("dt", { hasText: label }) }).locator("dd");
}

// Found by a scratch scan (same discipline e2e/globe-L2.spec.ts's own
// MOON_ONSCREEN_TIME comment describes for the Moon): the default opening
// camera (GlobeScene.tsx's unchanged START/START_DISTANCE, looking from
// 12deg north of Pune at distance 26) with a real ray-sphere occlusion test
// against the globe (not just the direction-only isBehindEarth heuristic) —
// Jupiter sits well inside the frustum and clear of the earth's own disc at
// this instant (Standish's elements stay valid to 2050, this date is inside
// that; see skyPlanetsMath.ts's own header for the table's own accuracy
// window, well past 2031 as far as its arcminute-level error budget goes).
const JUPITER_ONSCREEN_TIME = "2031-10-15T00:00:00.000Z";
// Same overhead instant e2e/globe-L3.spec.ts already validated (ISS well
// above Pune's horizon, so its own label renders and is clickable).
const ISS_OVERHEAD_CLOCK = new Date("2026-09-26T06:36:11Z");
// The fixture ISS TLE's own next real (sunlit + Pune-dark) pass starts
// 2026-09-29T14:02:56Z (recorded once via a scratch scan — the same instant
// satPasses.test.ts's own oracle uses); this clock sits inside the 24h
// window the "visible tonight" line requires.
const ISS_TONIGHT_CLOCK = new Date("2026-09-29T10:00:00Z");

test("constellation figures draw on the celestial sphere", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T21:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  const probe = page.locator("[data-constellation-vertices]");
  await expect.poll(async () => Number(await probe.getAttribute("data-constellation-vertices")), { timeout: 15_000 }).toBeGreaterThan(0);
  // All 88 IAU constellations (89 records — Serpens splits into Caput/Cauda
  // in the source data), never a silently-truncated subset.
  await expect(probe).toHaveAttribute("data-constellation-count", "89");
});

test("break-it: a 404'd constellations.json draws no figures, and the rest of the sky still renders", async ({ page }) => {
  await withApiFixtures(page);
  await page.route("**/sky/constellations.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.clock.setFixedTime(new Date("2026-09-24T21:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // The Moon's own probe still populates (computed, never fetched — the
  // constellation figures' fetch failure never takes the rest of the sky
  // down), and no vertex probe ever appears since nothing was ever drawn.
  const moonProbe = page.locator("[data-moon-probe]");
  await expect.poll(async () => moonProbe.getAttribute("data-moon-x"), { timeout: 30_000 }).not.toBeNull();
  await page.waitForTimeout(1000);
  await expect(page.locator("[data-constellation-vertices]")).toHaveCount(0);
});

test("ground view shows constellation names; at least one is legible", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // instant camera jump to ground view, no fly animation to wait out
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T21:00:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => Number(await page.locator("[data-constellation-vertices]").getAttribute("data-constellation-vertices")), { timeout: 15_000 }).toBeGreaterThan(0);

  // LayerPanel.tsx's own "g" shortcut (LANE L5): fly to Pune and switch to
  // ground view — the real production path a visitor uses, not a test-only
  // store poke.
  // Right of ExploreBar and left of LayerPanel, above GlobePanel.
  const focusPoint = { x: 1000, y: 400 };
  expect(await canvas.evaluate((el, point) => {
    const box = el.getBoundingClientRect();
    return document.elementFromPoint(box.x + point.x, box.y + point.y) === el;
  }, focusPoint), "Canvas focus point must hit bare canvas, clear of HUD chrome").toBe(true);
  await canvas.click({ position: focusPoint });
  await page.keyboard.press("g");
  await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 10_000 }).toBe("ground");

  const labels = page.locator("[data-constellation-label]");
  await expect(labels.first()).toBeAttached();
  // Computed style, not a raw `style` attribute string match — the display
  // toggle is a live DOM mutation (skyConstellations.tsx's own per-frame
  // loop), not React's own serialized inline-style text, so this is the
  // robust way to ask "is at least one name actually legible right now."
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const spans = document.querySelectorAll("[data-constellation-label]");
          for (const el of spans) {
            if (getComputedStyle(el).display !== "none") return true;
          }
          return false;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
});

test("clicking a planet selects it with RA/Dec, altitude/azimuth, above-horizon and magnitude rows", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date(JUPITER_ONSCREEN_TIME));
  await page.goto("/globe");
  await waitForHydration(page);

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const probe = page.locator('[data-planet-probe="jupiter"]');
  await expect.poll(async () => probe.getAttribute("data-planet-x"), { timeout: 30_000 }).not.toBeNull();
  const px = Number(await probe.getAttribute("data-planet-x"));
  const py = Number(await probe.getAttribute("data-planet-y"));

  await canvas.click({ position: { x: px, y: py } });

  const selectedEl = page.locator("[data-sky-selected]");
  await expect
    .poll(async () => readSelected(await selectedEl.getAttribute("data-sky-selected"))?.id, { timeout: 10_000 })
    .toBe("planet:jupiter");
  const selected = readSelected(await selectedEl.getAttribute("data-sky-selected"));
  const labels = (selected?.rows ?? []).map((r) => r.label);
  expect(labels).toEqual(["RA / Dec", "Altitude / Azimuth (Pune)", "Above horizon (Pune)", "Magnitude"]);

  await expect(page.locator("[data-globe-inspector]")).toContainText("Jupiter");
  await expect(inspectorRow(page, "RA / Dec")).toHaveText(/^\d{2}h \d{2}m \/ [+-]\d+\.\d°$/);
  const altAzText = await inspectorRow(page, "Altitude / Azimuth (Pune)").innerText();
  expect(altAzText).toMatch(/^-?\d+\.\d° \/ \d+\.\d°$/);
  // "on screen from the orbit camera looking at the globe from space" and
  // "above Pune's own local horizon" are unrelated geometric conditions —
  // this instant happens to put Jupiter below Pune's horizon (checked via
  // the same formula, offline), so the two rows are cross-checked against
  // each other rather than one hardcoded to "yes".
  const altitudeDeg = Number(altAzText.split("°")[0]);
  await expect(inspectorRow(page, "Above horizon (Pune)")).toHaveText(altitudeDeg > 0 ? "yes" : "no");
  await expect(inspectorRow(page, "Magnitude")).toHaveText(/^-?\d+\.\d$/);
});

test("selecting the ISS shows its next-visible-pass rows (TLE fixture, fixed clock)", async ({ page }) => {
  test.slow(); // the pass scan shares the machine with other globe specs' own heavy WebGL scenes
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(ISS_OVERHEAD_CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  const label = page.locator('[data-sat-label="25544"]');
  await expect(label).toBeVisible({ timeout: 30_000 });
  await label.click();

  await expect(page.locator("[data-globe-inspector]")).toContainText("ISS (ZARYA)", { timeout: 20_000 });
  // "computing..." first, then patched in place once the scan resolves —
  // poll rather than assert immediately (SatelliteLayer.tsx's own
  // selectSatellite comment: the scan can take a moment).
  await expect(inspectorRow(page, "Next visible pass (Pune)")).toHaveText(/^(\d{2}:\d{2}|none in the next 7 days)$/, { timeout: 30_000 });
  const passValue = await inspectorRow(page, "Next visible pass (Pune)").innerText();
  if (/^\d{2}:\d{2}$/.test(passValue)) {
    await expect(inspectorRow(page, "Max elevation")).toHaveText(/^\d+°$/);
    await expect(inspectorRow(page, "Direction")).toHaveText(/^[A-Z]{1,3} → [A-Z]{1,3}$/);
    await expect(inspectorRow(page, "Duration")).toHaveText(/^\d+:\d{2}$/);
  }
});

test('the sky status carries an "ISS visible tonight" line within 24h of a real pass', async ({ page }) => {
  test.slow();
  await withApiFixtures(page);
  await page.clock.setFixedTime(ISS_TONIGHT_CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);

  const statusEl = page.locator("[data-sky-status]");
  await expect
    .poll(async () => readStatus(await statusEl.getAttribute("data-sky-status"))?.detail, { timeout: 30_000 })
    .toMatch(/ISS visible tonight at \d{2}:\d{2} from Pune/);
});

test("break-it: an unreachable TLE feed shows neither an ISS label nor an \"ISS visible tonight\" line — never a stale or guessed claim", async ({ page }) => {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.clock.setFixedTime(ISS_TONIGHT_CLOCK);
  await page.goto("/globe");
  await waitForHydration(page);

  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // let the failed fetch (and useLiveSignal's own retry snapshot) settle
  await expect(page.locator('[data-sat-label="25544"]')).toHaveCount(0);
  const statusEl = page.locator("[data-sky-status]");
  await expect.poll(async () => readStatus(await statusEl.getAttribute("data-sky-status"))?.state, { timeout: 30_000 }).not.toBe("failed");
  const detail = readStatus(await statusEl.getAttribute("data-sky-status"))?.detail ?? "";
  expect(detail).not.toMatch(/ISS visible tonight/);
});
