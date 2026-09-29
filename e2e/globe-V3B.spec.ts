import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE V3B (wave 7, Lane 3 step B spike): the physical-atmosphere layer is
 * off by default and only loads behind `?atmo=physical` (globeStore.ts's
 * `physicalAtmosphere`, read once at module load — see
 * docs/globe-physical-atmosphere-spike.md for the go/no-go this spike
 * produced). This file proves two things: the default globe never fetches
 * the layer's chunk, and turning the flag on does load it without an error.
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

async function openGlobe(page: Page, query: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  const requestUrls: string[] = [];
  page.on("request", (r) => requestUrls.push(r.url()));
  await page.goto(`/globe${query}`);
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { canvas, requestUrls };
}

test("flag off: the default globe never fetches the physical-atmosphere chunk", async ({ page }) => {
  const { canvas, requestUrls } = await openGlobe(page, "");
  await page.waitForTimeout(500);
  expect(requestUrls.some((u) => /PhysicalAtmosphere/i.test(u))).toBe(false);
  // Byte-identical default behaviour: this lane touches neither the
  // existing ATMO_FRAG halo (Atmosphere.tsx, owned by an earlier lane) nor
  // any other layer, so the globe just renders as it always did.
  await expect(canvas).toBeVisible();
});

// Preview serves no /api/ops, /api/signals, /api/github-activity, /api/spotify
// or Vercel speed-insights script (unmocked here on purpose -- unrelated to
// this spike) and those 404 on every /globe load regardless of the flag, so
// this filters to atmosphere-shaped noise rather than asserting a silent
// console outright (same convention as home-console.spec.ts's
// HYDRATION_PATTERN filter).
const ATMOSPHERE_ERROR_PATTERN = /atmosphere|takram|precompute|shader|webgl/i;

test("flag on (?atmo=physical): the spike layer loads and the canvas still renders", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const { canvas, requestUrls } = await openGlobe(page, "?atmo=physical");
  await page.waitForTimeout(700); // LUT generation + first painted frame
  expect(requestUrls.some((u) => /PhysicalAtmosphere/i.test(u))).toBe(true);
  await expect(canvas).toBeVisible();
  // takram logs precompute failures via console.error rather than throwing
  // (r3f.js's Atmosphere effect: `.catch(console.error)`), so a clean
  // atmosphere-shaped console here is the honest signal the LUT generator
  // actually ran without erroring.
  const atmosphereErrors = consoleErrors.filter((m) => ATMOSPHERE_ERROR_PATTERN.test(m));
  expect(atmosphereErrors, consoleErrors.join("\n")).toEqual([]);
});
