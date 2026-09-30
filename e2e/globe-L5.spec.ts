import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { PUNE_SELECTION_ID } from "../src/world/globe/puneSelection.ts";
import type { Page } from "@playwright/test";

/**
 * LANE L5 (navigation, inner views, UI): the layer panel, the inspector, the
 * time scrubber, the guided tour, and the camera director's view switches.
 * Fixed clock, every /api/* route mocked (G10, same discipline as
 * e2e/globe.spec.ts) -- this spec never depends on a live network.
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

// The floating Pune <Html> card is retired (LANE U1, task 4): the ring is now
// a plain 3D marker with nothing to attach/detach in the DOM when toggled, so
// this test now verifies the thing that actually matters - the toggle state
// itself round-trips, and (unlike the HUD's own markers pill, see
// globe.spec.ts) this per-layer row does NOT close an open Pune selection;
// it is a generic layer toggle, not the dedicated affordance task 4 names.
test("the layer panel's own markers toggle flips state without touching an open selection", async ({ page }) => {
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
  await openGlobe(page);
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });

  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  const markersToggle = panel.getByRole("button", { name: "Pune markers" });
  await expect(markersToggle).toHaveAttribute("aria-pressed", "true");
  await markersToggle.click();
  await expect(markersToggle).toHaveAttribute("aria-pressed", "false");
  await expect(inspector).toBeVisible();

  await markersToggle.click();
  await expect(markersToggle).toHaveAttribute("aria-pressed", "true");
  await expect(inspector).toBeVisible();
});

test("the earth-style segmented control switches between real imagery and dots", async ({ page }) => {
  await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  const dotsBtn = panel.getByRole("button", { name: "Dots" });
  const imageryBtn = panel.getByRole("button", { name: "Real imagery" });
  await expect(imageryBtn).toHaveAttribute("aria-pressed", "true");
  await dotsBtn.click();
  await expect(dotsBtn).toHaveAttribute("aria-pressed", "true");
  await expect(imageryBtn).toHaveAttribute("aria-pressed", "false");
});

test("the panel collapses to a single icon button and reopens", async ({ page }) => {
  await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Collapse the layers panel" }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Open the layers panel" }).click();
  await expect(panel).toBeVisible();
});

test("the tour advances through its stops and exits", async ({ page }) => {
  await openGlobe(page);
  await page.getByRole("button", { name: "Take the tour" }).click();
  const tour = page.locator("[data-globe-tour]");
  await expect(tour).toBeVisible();
  await expect(tour.getByRole("heading")).toHaveText("Pune, the origin");

  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Reach");

  await tour.getByRole("button", { name: "Back" }).click();
  await expect(tour.getByRole("heading")).toHaveText("Pune, the origin");

  await tour.getByRole("button", { name: "Exit" }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take the tour" })).toBeVisible();
});

test("the tour's ground-view stop actually switches the camera to ground view", async ({ page }) => {
  const canvas = await openGlobe(page);
  await page.getByRole("button", { name: "Take the tour" }).click();
  const tour = page.locator("[data-globe-tour]");
  for (const title of ["Reach", "Upstream", "The sky over Pune"]) {
    await tour.getByRole("button", { name: "Next" }).click();
    await expect(tour.getByRole("heading")).toHaveText(title);
  }
  await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 5_000 }).toBe("ground");
});

test("the time scrubber moves the subsolar probe and shows the not-live notice", async ({ page }) => {
  await openGlobe(page);
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-subsolar-x")).not.toBeNull();
  const before = await probe.getAttribute("data-subsolar-x");

  await expect(page.locator("[data-globe-not-live]")).toHaveCount(0);
  const slider = page.getByLabel("Simulated time offset, non-linear, 30 days back to 2 days ahead");
  await slider.focus();
  // Shift+ArrowRight steps +1h each (TimeScrubber's own keyboard contract);
  // ten of them is +10h, well clear of "now".
  for (let i = 0; i < 10; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(page.locator("[data-globe-not-live]")).toBeVisible();
  await expect.poll(async () => probe.getAttribute("data-subsolar-x")).not.toBe(before);

  await page.getByRole("button", { name: "Now", exact: true }).click();
  await expect(page.locator("[data-globe-not-live]")).toHaveCount(0);
});

test("the inspector renders a seeded selection and closes on Escape", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = {
      id: "test-entity",
      kind: "test",
      title: "Test Selection",
      rows: [{ label: "foo", value: "bar" }],
      source: "e2e fixture",
      live: true,
      focus: { kind: "latlon", lat: 18.52, lon: 73.86 },
    };
  });
  await openGlobe(page);

  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("Test Selection")).toBeVisible();
  await expect(inspector.getByText("LIVE", { exact: true })).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Fly to" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
});

test("pressing G switches to ground view and Escape returns to orbit", async ({ page }) => {
  const canvas = await openGlobe(page);
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
  await page.keyboard.press("g");
  await expect(canvas).toHaveAttribute("data-camera-view", "ground", { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit", { timeout: 5_000 });
});

test("following the ISS is disabled with a reason when no ISS is registered", async ({ page }) => {
  await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  const followBtn = panel.getByRole("button", { name: /Follow the ISS/ });
  await expect(followBtn).toBeDisabled();
  await expect(followBtn).toHaveAttribute("title", "No ISS position yet");
});

test("following the ISS works once an entity is registered (stand-in for lane L3)", async ({ page }) => {
  const canvas = await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  const followBtn = panel.getByRole("button", { name: /Follow the ISS/ });
  await expect(followBtn).toBeDisabled();
  // The setter exists at module load, before the scene's first frame.
  // Wait out render bootstrap before starting the panel's 2s poll budget.
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
  await expect(canvas).toHaveAttribute("data-camera-flying", "false");

  // LayerPanel.tsx's own e2e seam: registers a stand-in entity so this test
  // does not depend on lane L3's SatelliteLayer being present in this
  // worktree. LayerPanel polls entityPositions on a 1s interval, so the
  // button's enabled state lags the registration by up to that long.
  await expect
    .poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_SET_ENTITY__ === "function"))
    .toBe(true);
  await page.evaluate(() => window.__GLOBE_TEST_SET_ENTITY__?.("sat:25544", { x: 6.4, y: 0, z: 0 }));
  await expect(followBtn).toBeEnabled({ timeout: 2_000 });

  await followBtn.click();
  await expect(canvas).toHaveAttribute("data-camera-view", "follow", { timeout: 5_000 });
});
