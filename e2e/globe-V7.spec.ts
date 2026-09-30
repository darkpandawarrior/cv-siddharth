import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE V7 (wave 7, "How it's built" panel). Selection is armed through
 * __GLOBE_TEST_SELECT__, the same seam globe-T1.spec.ts and globe-L5.spec.ts
 * use, since a real WebGL raycast click is a different lane's own concern.
 * Every /api/* route is mocked (G10) so this spec never depends on a live
 * network.
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

const QUAKE_SELECTION = {
  id: "quake:test",
  kind: "quake",
  title: "M 6.5 - Test Trench",
  rows: [{ label: "Magnitude", value: "6.5" }],
  source: "USGS earthquake feed",
  live: true,
  focus: { kind: "latlon", lat: 18.5204, lon: 73.8567 },
};

async function openGlobeWithSelection(page: Page, width = 1440, height = 900) {
  await page.addInitScript((sel) => {
    (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = sel;
  }, QUAKE_SELECTION);
  await page.setViewportSize({ width, height });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-29T12:00:00Z"));
  await page.goto("/globe");
  await waitForHydration(page);
  const inspector = page.locator(width < 640 ? "[data-globe-inspector-sheet]" : "[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  return inspector;
}

test("the 'How it's built' toggle is closed by default and opens a per-layer panel showing real shader source and provenance", async ({ page }) => {
  const inspector = await openGlobeWithSelection(page);

  await expect(page.locator("[data-how-its-built]")).toHaveCount(0);

  const toggle = inspector.getByRole("button", { name: "How it's built" });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const panel = page.locator("[data-how-its-built]");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // Real GLSL from the actual imported shader constants, not a paraphrase.
  await expect(panel).toContainText("uniform vec3 uSun");
  await expect(panel).toContainText("texture2D(uDay, vUv)");

  // Real provenance: the honest NASA GIBS endpoint and licence text, plus
  // the honestly-scoped Maps Takeout line the brief requires verbatim.
  await expect(panel).toContainText("gibs.earthdata.nasa.gov");
  await expect(panel).toContainText("public domain");
  await expect(panel.getByRole("link", { name: "CC BY 4.0, Open-Meteo.com", exact: true }).first()).toHaveAttribute("href", "https://open-meteo.com/en/licence");
  await expect(panel).toContainText("exact place pins and names, star ratings, review text, month-level dates");
  await expect(panel).not.toContainText("city level, years only");
  for (const text of ["Daylight: golden hour", "Eclipse paths", "Bloom: night lights", "adsb.lol", "marine-api.open-meteo.com", "air-quality-api.open-meteo.com", "flood-api.open-meteo.com", "services.swpc.noaa.gov"]) await expect(panel).toContainText(text);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-how-its-built]")).toHaveCount(0);
});

test("the toggle and a copy button are keyboard reachable", async ({ page }) => {
  const inspector = await openGlobeWithSelection(page);
  const toggle = inspector.getByRole("button", { name: "How it's built" });

  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  const copyButtons = page.locator("[data-how-its-built] button", { hasText: "Copy" });
  await expect(copyButtons.first()).toBeVisible({ timeout: 15_000 });
  await copyButtons.first().focus();
  await expect(copyButtons.first()).toBeFocused();
});

for (const [width, height] of [[390, 844], [360, 740]]) {
  test(`How it's built is legible and scrolls at ${width}`, async ({ page }) => {
    const inspector = await openGlobeWithSelection(page, width, height);
    await inspector.getByRole("button", { name: "How it's built" }).click();
    const panel = inspector.locator("[data-how-its-built]");
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight > el.clientHeight)).toBe(true);
    await panel.getByText("My Maps places (Local Guide contributions)", { exact: true }).scrollIntoViewIfNeeded();
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(panel.getByText("My Maps places (Local Guide contributions)", { exact: true })).toBeVisible();
    await expect(panel).not.toContainText("city level, years only");
    await page.screenshot({ path: `test-results/Y2-how-built-${width}.png` });
  });
}
