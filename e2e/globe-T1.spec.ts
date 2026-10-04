import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE T1 ("My Maps places" and life chapters). Fixed clock, every /api/*
 * route mocked (G10, same discipline as e2e/globe.spec.ts) -- this spec
 * never depends on a live network. Selection is armed through
 * __GLOBE_TEST_SELECT__, the same seam globe-L5.spec.ts uses, since a real
 * WebGL raycast click on an instanced mesh is that lane's own concern, not
 * this one's.
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

const GUIDE_SELECTION = {
  id: "guide-place:pune",
  kind: "guide-place",
  title: "Pune, India",
  rows: [
    { label: "Reviews", value: "9" },
    { label: "Photos", value: "16" },
    { label: "Photo views", value: "30,044" },
    { label: "Years active", value: "2024, 2025, 2026" },
  ],
  source: "Google Maps Takeout, exported 2026-09 · city level, years only",
  live: false,
  focus: { kind: "latlon", lat: 18.5204, lon: 73.8567, distance: 14 },
  media: [{ src: "/globe/maps/pune-1.webp", alt: "Photo in Pune, 2024", caption: "2024 · 5,765 views" }],
};

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

test("the layer panel lists 'My Maps places' and its toggle round-trips", async ({ page }) => {
  await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  const toggle = panel.getByRole("button", { name: "My Maps places" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("selecting a guide place shows Reviews, Photos, the source line, a photo and never LIVE", async ({ page }) => {
  await page.addInitScript((sel) => {
    (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = sel;
  }, GUIDE_SELECTION);
  await openGlobe(page);

  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  await expect(inspector).toContainText("Reviews");
  await expect(inspector).toContainText("Photos");
  await expect(inspector).toContainText("Google Maps Takeout");
  await expect(inspector.getByText("LIVE")).toHaveCount(0);
  await expect(inspector).toContainText("Snapshot");

  const media = inspector.locator("[data-guide-media] img");
  await expect(media).toHaveCount(1);
  await expect(media.first()).toHaveAttribute("alt", "Photo in Pune, 2024");
});
