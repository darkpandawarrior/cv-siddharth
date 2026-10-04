import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { lookAnglesFor, classify } from "../src/lib/satellites.ts";
import { fleetStats } from "../src/data/store.ts";
import type { TleObject } from "../api/_lib/tle-handler.ts";

/**
 * P3-02b — world-v2-night (live-data-spec.md §2.2 rows 12-15; §4 WL's own
 * iss/calendar/full-moon accept lines; master-plan.md #M10/#M12/#M16/#M56).
 * Deterministic time and fixture routing throughout (G10): no test here
 * ever touches a live network.
 */

const FIXTURES_URL = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_URL)), "utf8"));

const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const SIGNALS = fixture("live/signals.json");
const WEATHER_OVERCAST = fixture("weather-2026-09-24.json");
const WEATHER_CLEAR_FULLMOON = fixture("live/weather-clear-fullmoon.json");
const TLE = fixture("tle.json") as { objects: TleObject[] };

const ISS = TLE.objects.find((o) => o.norad === "25544")!;

/** The three ISS states this lane's own acceptance names, found by scanning
 *  the SAME TLE fixture with `satellites.ts` — never a hand-picked
 *  timestamp drifting from what the fixture actually propagates to
 *  (row 14's own "computed in the test with satellites.ts"). `elDeg > 10`
 *  keeps every found instant comfortably clear of the horizon, so a tiny
 *  SGP4 rounding difference can never flip which bucket it lands in. */
function findIssInstant(wantState: "eye" | "daylight" | "shadow", withinDays = 7): Date {
  const start = new Date("2026-09-23T15:23:17.883Z").getTime(); // tle.json's own epochNewest
  const stepMin = 1;
  const totalMin = withinDays * 24 * 60;
  for (let m = 0; m < totalMin; m += stepMin) {
    const t = new Date(start + m * 60_000);
    const look = lookAnglesFor(ISS, t);
    if (!look || look.elDeg <= 10) continue;
    if (classify(ISS, t) === wantState) return t;
  }
  throw new Error(`no ${wantState} instant found for the ISS in the tle.json fixture within ${withinDays} days`);
}
// One below-the-horizon instant straight from the fixture's own epoch — no
// scan needed, the fixture's own note says this is what the ISS TLE
// propagates to right at epoch (see world-v2-live.spec.ts's own NIGHT/NOON
// fixed clocks for the sibling convention).
const ISS_BELOW_AT = new Date("2026-09-23T15:23:17.883Z");
const ISS_VISIBLE_AT = findIssInstant("eye");
const ISS_ABOVE_DAYLIGHT_AT = findIssInstant("daylight");

async function mockLiveRoutes(page: Page, weather: unknown = WEATHER_OVERCAST): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weather }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page, at: Date | string, weather: unknown = WEATHER_OVERCAST): Promise<void> {
  await forceDeviceTier(page, "viewport");
  await mockLiveRoutes(page, weather);
  await page.clock.setFixedTime(new Date(at));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  const canvasLocator = page.locator("[data-world='v2'] canvas");
  await expect(canvasLocator).toHaveCount(1, { timeout: 15_000 });
}

function canvas(page: Page) {
  return page.locator("[data-world='v2'] canvas");
}

test.describe("row 13 — stars (weather-clear-fullmoon)", () => {
  test("2026-09-26T22:30 IST -> star alpha > 0 and data-live-star-limit < 5.0", async ({ page }) => {
    await gotoWorldV2(page, "2026-09-26T22:30:00+05:30", WEATHER_CLEAR_FULLMOON);
    const el = canvas(page);
    await expect(el).toHaveAttribute("data-live-star-limit", /.+/, { timeout: 25_000 });
    const limit = Number(await el.getAttribute("data-live-star-limit"));
    expect(limit).toBeLessThan(5.0);
    // The star-bin fetch is async, so `data-live-star-alpha` starts at
    // "0.000" (no stars loaded yet) — wait for it to move off that exact
    // string (an auto-retrying locator assertion, never a one-shot
    // `getAttribute` read) before reading the resolved numeric value.
    await expect(el).toHaveAttribute("data-live-star-alpha", /^(?!0\.000$).+/, { timeout: 25_000 });
    const alpha = Number(await el.getAttribute("data-live-star-alpha"));
    expect(alpha).toBeGreaterThan(0);
  });
});

test.describe("row 14 — ISS marker (TLE fixture, states computed with satellites.ts)", () => {
  test("el > 0, sunlit, Pune's sky dark ('eye') -> data-live-iss='visible'", async ({ page }) => {
    const look = lookAnglesFor(ISS, ISS_VISIBLE_AT)!;
    expect(look.elDeg).toBeGreaterThan(0);
    expect(classify(ISS, ISS_VISIBLE_AT)).toBe("eye");
    await gotoWorldV2(page, ISS_VISIBLE_AT);
    await expect(canvas(page)).toHaveAttribute("data-live-iss", "visible", { timeout: 25_000 });
  });

  test("el > 0 in daylight -> data-live-iss='above-not-visible'", async ({ page }) => {
    const look = lookAnglesFor(ISS, ISS_ABOVE_DAYLIGHT_AT)!;
    expect(look.elDeg).toBeGreaterThan(0);
    expect(classify(ISS, ISS_ABOVE_DAYLIGHT_AT)).toBe("daylight");
    await gotoWorldV2(page, ISS_ABOVE_DAYLIGHT_AT);
    await expect(canvas(page)).toHaveAttribute("data-live-iss", "above-not-visible", { timeout: 25_000 });
  });

  test("el < 0 -> data-live-iss='below'", async ({ page }) => {
    const look = lookAnglesFor(ISS, ISS_BELOW_AT);
    expect(look === null || look.elDeg < 0).toBe(true);
    await gotoWorldV2(page, ISS_BELOW_AT);
    await expect(canvas(page)).toHaveAttribute("data-live-iss", "below", { timeout: 25_000 });
  });
});

test.describe("row 15 — festival calendar (calendar-diwali)", () => {
  test("inside Diwali's span -> data-live-festival='diwali', data-deepmal-lit unchanged (fleetStats.live)", async ({ page }) => {
    // e2e/fixtures/live/calendar-diwali.json's own clock: 2026-11-08T12:00:00Z,
    // inside skyCalendar.ts's Diwali 2026 span (2026-11-06..11).
    await gotoWorldV2(page, "2026-11-08T12:00:00Z");
    const el = canvas(page);
    await expect(el).toHaveAttribute("data-live-festival", "diwali", { timeout: 25_000 });
    // Festival meshes never touch data meshes (M16): the deepmal lit count
    // stays exactly fleetStats.live, not some Diwali-nudged number.
    // `LandmarksRecords.tsx`'s own hidden a11y summary, not a canvas
    // attribute — a real DOM node this lane never writes to.
    await expect(page.locator("[data-deepmal-lit]")).toHaveAttribute("data-deepmal-lit", String(fleetStats.live), { timeout: 25_000 });
  });

  test("outside any festival span -> data-live-festival='none'", async ({ page }) => {
    await gotoWorldV2(page, "2026-08-01T12:00:00Z");
    await expect(canvas(page)).toHaveAttribute("data-live-festival", "none", { timeout: 25_000 });
  });
});
