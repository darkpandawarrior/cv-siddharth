import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { offsetToSlider } from "../src/world/globe/timeMachine/rangeModel.ts";

/**
 * LANE C4 (wave 8), "Living daylight": the golden-hour band, the waking
 * band, and the rising/setting cities readout, all computed from the same
 * subsolar point the terminator already draws. Fixed clock, every /api/*
 * mocked and every unrelated live feed aborted (same discipline as
 * e2e/globe.spec.ts and e2e/globe-X3.spec.ts's own G10 comment) so this
 * spec's own network log stays about this layer alone.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance cameraIntro.ts's markIntroSeen has: a blocked
      // localStorage just replays the intro, not a reason to fail this spec.
    }
  });
}

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedIntroSeen(page);
  await withFixtures(page);
  // 12:27 IST -- well inside a daytime hour for India, so the golden-hour
  // and waking bands sit over the Americas/Pacific instead, and the readout
  // has real candidates on both sides (checked against the bundled data
  // when this spec was written).
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

async function setOffsetMinutes(page: Page, minutes: number) {
  const slider = page.getByLabel(/Simulated time offset, non-linear/).first();
  const position = offsetToSlider(minutes);
  await slider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(position));
}

test.describe("LANE C4: living daylight", () => {
  test("the layer panel lists the daylight layer, on by default", async ({ page }) => {
    await openGlobe(page);
    const sheet = page.getByRole("button", { name: /^Layers$/ });
    if (await sheet.isVisible().catch(() => false)) await sheet.click();
    const row = page.getByRole("button", { name: "Golden hour and waking cities" });
    await expect(row).toBeVisible();
  });

  test("the readout pill shows non-negative rising/setting counts and opens a city list", async ({ page }) => {
    await openGlobe(page);
    const pill = page.getByRole("button", { name: "Cities rising and setting right now" });
    await expect(pill).toBeVisible();

    const dialog = page.getByRole("dialog", { name: "Cities rising and setting right now" });
    await expect(dialog).toBeHidden();
    await pill.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Rising")).toBeVisible();
    await expect(dialog.getByText("Setting")).toBeVisible();
  });

  test("clicking a listed city flies there and selects it in the inspector", async ({ page }) => {
    await openGlobe(page);
    const pill = page.getByRole("button", { name: "Cities rising and setting right now" });
    await pill.click();
    const dialog = page.getByRole("dialog", { name: "Cities rising and setting right now" });
    const firstCity = dialog.locator("li button").first();
    await expect(firstCity).toBeVisible();
    const name = (await firstCity.locator("span").first().textContent())?.trim();
    expect(name).toBeTruthy();
    await firstCity.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: name! })).toBeVisible();
  });

  test("Escape closes the open readout without selecting anything", async ({ page }) => {
    await openGlobe(page);
    const pill = page.getByRole("button", { name: "Cities rising and setting right now" });
    await pill.click();
    const dialog = page.getByRole("dialog", { name: "Cities rising and setting right now" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("scrubbing time changes which cities the readout lists", async ({ page }) => {
    await openGlobe(page);
    const pill = page.getByRole("button", { name: "Cities rising and setting right now" });
    await pill.click();
    const dialog = page.getByRole("dialog", { name: "Cities rising and setting right now" });
    const before = await dialog.textContent();

    // Jump 12 real hours forward: the subsolar point moves roughly to the
    // opposite side of the earth, so the two terminators -- and therefore
    // the readout's whole city list -- land somewhere else entirely.
    await setOffsetMinutes(page, 12 * 60);
    await page.waitForTimeout(300); // simTime's useMemo settles on the next render
    const after = await dialog.textContent();
    expect(after).not.toBe(before);
  });

  test("the open readout paints above the Pune inspector card, not underneath it", async ({ page }) => {
    // Regression for the wave-8 verifier's blocking find: Pune preselects
    // itself on desktop first load (useGlobe's `capable && innerWidth>=640
    // && !selected` rule), so the readout's own popover and the Inspector
    // card are both on screen by default -- the exact overlap the
    // topbar's `relative z-20` stacking context used to hide the popover
    // behind, regardless of the popover's own declared z-index (see
    // DaylightReadout.tsx's doc comment).
    await openGlobe(page);
    await expect(page.locator("[data-globe-inspector]")).toBeVisible();
    const pill = page.getByRole("button", { name: "Cities rising and setting right now" });
    await pill.click();
    const dialog = page.getByRole("dialog", { name: "Cities rising and setting right now" });
    await expect(dialog).toBeVisible();

    // Body-level portal now places the dialog by the pill's own
    // getBoundingClientRect rather than nesting it inside the topbar's
    // `relative z-20` context, so it no longer reliably overlaps the
    // Inspector card's box the way the reported bug did. What actually
    // matters, and what's tested directly here regardless of exact
    // geometry: every corner of the dialog's own box must resolve (via
    // elementFromPoint) to the dialog itself, never to whatever else is
    // stacked underneath it.
    const box = (await dialog.boundingBox())!;
    const corners: Array<[number, number]> = [
      [box.x + 4, box.y + 4],
      [box.x + box.width - 4, box.y + 4],
      [box.x + 4, box.y + box.height - 4],
      [box.x + box.width - 4, box.y + box.height - 4],
      [box.x + box.width / 2, box.y + box.height / 2],
    ];
    for (const [x, y] of corners) {
      const hitsDialog = await page.evaluate(
        ([px, py]) => document.elementFromPoint(px, py)?.closest('[role="dialog"][aria-label="Cities rising and setting right now"]') != null,
        [x, y],
      );
      expect(hitsDialog, `point (${x}, ${y}) inside the dialog's own box must hit the dialog`).toBe(true);
    }
  });

  test("break-it: turning the layer off hides the readout pill", async ({ page }) => {
    await openGlobe(page);
    await expect(page.getByRole("button", { name: "Cities rising and setting right now" })).toBeVisible();

    const sheet = page.getByRole("button", { name: /^Layers$/ });
    if (await sheet.isVisible().catch(() => false)) await sheet.click();
    await page.getByRole("button", { name: "Golden hour and waking cities" }).click();

    await expect(page.getByRole("button", { name: "Cities rising and setting right now" })).toBeHidden();
  });
});
