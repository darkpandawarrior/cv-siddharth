import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { ARTIFACTS } from "../src/world/artifacts.ts";

/**
 * P3-06, v1-carryover-ports (master-plan.md#M6, idea-atlas.md CRAFT-5:
 * "the world publishes its own port audit"). Reuses e2e/world-v2.spec.ts's
 * own fixture set and `gotoWorldV2` shape (that file owns no exported
 * helper, so this is a self-contained copy — the same posture
 * e2e/world-open-data.spec.ts already takes on its own fixtures); every
 * `/api/*` WorldV2 can reach is routed here too, and nothing in this file
 * hits a live network (G10).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");

const FIXED_AT = "2026-09-23T22:26:56Z"; // the shared fixtures' own `at`

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) =>
    route.fulfill({
      json: { at: FIXED_AT, lichess: { online: false, playing: false }, devto: [], ci: {}, downloads: {} },
    }),
  );
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page): Promise<void> {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(FIXED_AT));
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
}

test.describe("GpsLens (P3-06, M6: the v1 location lens survives as the hodi's second wake)", () => {
  test("closed by default; 'g' toggles it open and sets data-accuracy-pct", async ({ page }) => {
    await gotoWorldV2(page);

    await expect(page.locator("[data-gps-lens]")).toHaveAttribute("data-gps-lens", "closed");
    await expect(page.locator("[data-accuracy-pct]")).toHaveCount(0);

    await page.keyboard.press("g");

    await expect(page.locator("[data-gps-lens]")).toHaveAttribute("data-gps-lens", "open");
    await expect(page.locator("[data-accuracy-pct]")).toHaveCount(1, { timeout: 10_000 });
    const pct = await page.locator("[data-accuracy-pct]").getAttribute("data-accuracy-pct");
    expect(Number(pct)).toBeGreaterThanOrEqual(0);
    expect(Number(pct)).toBeLessThanOrEqual(100);
  });

  test("break-it: 'g' pressed inside a text field never toggles the lens", async ({ page }) => {
    await gotoWorldV2(page);
    await page.evaluate(() => {
      const input = document.createElement("input");
      input.id = "e2e-probe-input";
      document.body.appendChild(input);
      input.focus();
    });
    await page.locator("#e2e-probe-input").press("g");
    await expect(page.locator("[data-gps-lens]")).toHaveAttribute("data-gps-lens", "closed");
  });
});

test.describe("Garlands (P3-06, M6: artifacts.ts facts as ambient marigold garlands)", () => {
  test("garland count equals artifacts.ts's own fact count, never a literal", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[data-garlands]")).toHaveAttribute("data-garlands", String(ARTIFACTS.length), { timeout: 15_000 });
  });
});

test.describe("Lanterns (P3-06, M6: Ghosts' presence reused as visitor lanterns, count unchanged)", () => {
  test("lantern count equals the mocked presence count", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(FIXED_AT));
    await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
    // Lanterns.tsx's own e2e seam (G10: a real playhtml room's occupancy
    // during a CI run is never deterministic) — the identical posture
    // presenceGeo.ts's own __GLOBE_PRESENCE_TEST__ takes (see
    // e2e/globe.spec.ts).
    await page.addInitScript(() => {
      (window as unknown as { __LANTERN_PRESENCE_TEST__: Record<string, { x: number; z: number; heading: number }> }).__LANTERN_PRESENCE_TEST__ = {
        a: { x: 0, z: 0, heading: 0 },
        b: { x: 5, z: 5, heading: 1 },
        c: { x: -5, z: 10, heading: 2 },
      };
    });
    await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
    await waitForHydration(page);
    await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });

    await expect(page.locator("[data-lanterns]")).toHaveAttribute("data-lanterns", "3", { timeout: 15_000 });
  });
});

test.describe("LitMap (P3-06, M6: LiveLitMapOverlay ported off the valley's own bounds)", () => {
  test("closed by default; 'm' opens the overlay", async ({ page }) => {
    await gotoWorldV2(page);

    await expect(page.locator("[data-lit-map]")).toHaveAttribute("data-lit-map", "closed");
    await page.keyboard.press("m");
    await expect(page.locator("[data-lit-map]")).toHaveAttribute("data-lit-map", "open");
    await expect(page.locator("[role='dialog'][aria-label='Lit map']")).toBeVisible();
  });
});
