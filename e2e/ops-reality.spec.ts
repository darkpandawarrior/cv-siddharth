import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "./lib/test.ts";
import { STREAMS } from "../src/world/v2/streams.ts";
import { validUntil as calendarValidUntil } from "../src/data/skyCalendar.ts";

/**
 * P2-14 (reality-spec.md#6 /ops row, live-data-spec.md#3 /ops extension,
 * #4 R7 ops-accept, master-plan.md#M23/M24): the reality lens (weather, sun,
 * presence, github-activity) and the live-source rows (air, river, signals,
 * aircraft, tle, stars, calendar, normals), plus the #sources section
 * rendered from STREAMS's own attribution field.
 *
 * Every /api/* route is mocked, same as terminal-reality.spec.ts and
 * reality-footer.spec.ts: this spec never depends on live network state.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const WEATHER_OK = fixture("weather-2026-09-24.json");
const SIGNALS_OK = fixture("live/signals.json");
const TLE_OK = fixture("tle.json");
const AIRCRAFT_OK = fixture("aircraft.json");
const OPS_OK = fixture("ops.json");
const ACTIVITY_OK = {
  connected: true,
  items: [
    { repo: "darkpandawarrior/doori", type: "push", message: "fix: settle sync race", url: "https://github.com/x", at: "2026-09-24T02:40:00Z", upstream: false },
  ],
};
const SPOTIFY_DISCONNECTED = { connected: false };

// The fixed instant the sibling reality specs pin their "night" case to
// (terminal-reality.spec.ts, spine.spec.ts): fresh against tle.json's and
// aircraft.json's 2026-09-23 epochs (< 7 days), before skyCalendar's
// validUntil, and matches weather-2026-09-24.json.
const NIGHT = "2026-09-24T03:15:00+05:30";
// After skyCalendar's own validUntil (2027-12-31): the table needs its
// annual refresh, and the calendar row must say so with DEGRADED.
const AFTER_VALID_UNTIL = "2028-01-15T12:00:00+05:30";

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER_OK }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS_OK }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE_OK }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT_OK }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY_OK }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS_OK }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: SPOTIFY_DISCONNECTED }));
}

test.describe("the reality lens", () => {
  test("weather, sun, presence and github-activity rows all render", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const main = page.locator("#main-content");
    await expect(main).toContainText("Weather");
    await expect(main).toContainText("Sun");
    await expect(main).toContainText("computed, cannot go stale");
    await expect(main).toContainText("Presence");
    await expect(main).toContainText("GitHub activity");
  });
});

test.describe("the live sources", () => {
  test("air, river, signals, aircraft, tle, stars, calendar and normals rows all exist", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const main = page.locator("#main-content");
    await expect(main).toContainText("Air");
    await expect(main).toContainText("River");
    await expect(main).toContainText("Signals");
    await expect(main).toContainText("Aircraft");
    await expect(main).toContainText("Orbital elements (TLE)");
    await expect(main).toContainText("Star catalogue");
    await expect(main).toContainText("Festival + meteor calendar");
    await expect(main).toContainText("Pune normals");
  });

  test("with the clock past skyCalendar's own validUntil, the calendar row is DEGRADED", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(AFTER_VALID_UNTIL));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const calendarRow = page.locator(".ops-row", { hasText: "Festival + meteor calendar" });
    await expect(calendarRow).toHaveAttribute("data-state", "DEGRADED");
    await expect(calendarRow).toContainText(calendarValidUntil);
  });

  test("before validUntil the calendar row is OK", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const calendarRow = page.locator(".ops-row", { hasText: "Festival + meteor calendar" });
    await expect(calendarRow).toHaveAttribute("data-state", "OK");
  });
});

test.describe("#sources", () => {
  // The expected list is DERIVED from streams.ts, never hand-typed here — a
  // stream added or removed there must change this test's own expectation
  // with it (P2-14 acceptance).
  const expectedAttributions = [...new Set(STREAMS.map((s) => s.attribution))];

  test("lists every STREAMS attribution", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops#sources", { waitUntil: "networkidle" });
    const sources = page.locator("#sources");
    await expect(sources).toBeVisible();
    for (const attribution of expectedAttributions) {
      await expect(sources).toContainText(attribution);
    }
  });

  test("names at least the sources reality-spec and living-ledger promise", async () => {
    // A sanity floor on the fixture itself, not the page: if streams.ts ever
    // drops every real upstream this would still pass on an empty page, so
    // this asserts the REGISTRY still carries the named upstreams, and the
    // test above asserts the PAGE matches the registry.
    const named = ["Open-Meteo", "CAMS", "GloFAS", "adsb.lol", "CelesTrak", "Yale Bright Star Catalogue", "GitHub", "lichess", "dev.to"];
    for (const n of named) {
      expect(expectedAttributions.some((a) => a.includes(n)), `no STREAMS attribution names ${n}`).toBe(true);
    }
  });
});
