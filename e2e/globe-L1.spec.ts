import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE L1 (real earth), end to end. `e2e/globe.spec.ts` stays untouched (this
 * lane owns only this new file, per globe-lanes.md's ownership rule) — it
 * already proves the day/night split and the markers toggle against
 * whichever earth style is active. This file is the imagery style's own
 * acceptance: NASA GIBS mocked to small committed fixtures reaches
 * `data-earth-style="imagery"` / `data-earth-status="live"`, and an aborted
 * feed falls back to the dot earth with `data-earth-status="failed"` —
 * "never show a stale value as live" applies here exactly as it does to any
 * other feed in this world.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const GIBS_DIR = join(FIXTURES, "gibs");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const DAY_JPG = readFileSync(join(GIBS_DIR, "gibs-day.jpg"));
const BASE_JPG = readFileSync(join(GIBS_DIR, "gibs-base.jpg"));
const NIGHT_JPG = readFileSync(join(GIBS_DIR, "gibs-night.jpg"));
const SEA_ICE_PNG = readFileSync(join(GIBS_DIR, "gibs-seaice.png"));
const RELIEF_JPG = readFileSync(join(GIBS_DIR, "gibs-relief.jpg"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** Routes every GIBS WMS request to one of the three committed fixtures by
 *  its own LAYERS param, so the day, gap-fill and night-lights fetches each
 *  get a plausible (if tiny) real image rather than all three sharing one. */
async function withGibsFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: SEA_ICE_PNG });
    if (url.includes("ASTER_GDEM")) return route.fulfill({ contentType: "image/jpeg", body: RELIEF_JPG });
    const body = url.includes("Black_Marble") ? NIGHT_JPG : url.includes("BlueMarble") ? BASE_JPG : DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

test("the imagery style reaches status live once NASA GIBS is mocked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await withGibsFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const probe = page.locator("[data-earth-style]");
  await expect(probe).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
  await expect(probe).toHaveAttribute("data-earth-status", "live");
});

test("a fully aborted GIBS feed falls back to the dot earth with status failed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => route.abort());
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);

  const probe = page.locator("[data-earth-style]");
  await expect(probe).toHaveAttribute("data-earth-style", "dots", { timeout: 30_000 });
  await expect(probe).toHaveAttribute("data-earth-status", "failed");
  // The dot earth still draws something: this is a fallback, not a blank globe.
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible();
});

test.describe("day, dusk and night crops at 1440 and 390", () => {
  const times = [
    ["day", "2026-09-24T12:27:00+05:30"],
    ["dusk", "2026-09-24T18:27:00+05:30"],
    ["night", "2026-09-25T00:27:00+05:30"],
  ] as const;
  // Each crop has its own cold navigation and render, rather than six
  // independent captures competing for one test's total time budget.
  for (const width of [1440, 390]) {
    for (const [label, iso] of times) {
      test(`${label} at ${width}`, async ({ page }, testInfo) => {
        await withApiFixtures(page);
        await withGibsFixtures(page);
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
        await page.clock.setFixedTime(new Date(iso));
        await page.goto("/globe");
        await waitForHydration(page);
        const earth = page.locator("[data-earth-style]");
        await expect(earth).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
        await expect(earth).toHaveAttribute("data-earth-status", "live");
        const canvas = page.locator("[data-globe-root] canvas");
        await expect(canvas).toBeVisible();
        // CameraDirector writes these from the frame loop, after the
        // scene has mounted; root hydration alone cannot prove that.
        await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
        await expect(canvas).toHaveAttribute("data-camera-flying", "false");
        await page.screenshot({ path: testInfo.outputPath(`globe-l1-${label}-${width}.png`) });
      });
    }
  }
});
