import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { offsetToSlider } from "../src/world/globe/timeMachine/rangeModel.ts";
import type { Page, Locator } from "@playwright/test";

/**
 * WAVE 6 LANE X3 (time machine UI), end to end: the non-linear scrubber
 * actually moves the store's offset, HistoryLayer replays real USGS quakes
 * while scrubbed away from now, EarthImagery's daily time-lapse names the
 * past day it is showing, and swipe compare's divider drags, nudges and
 * exits. Fixed clock, every external feed routed to a committed fixture
 * (G10, same discipline as e2e/globe.spec.ts) — this spec never depends on
 * a live network, including the feeds other lanes' layers own (HazardLayer's
 * live "now" quakes, EONET, GDACS, aurora, Kp, launches), which are aborted
 * rather than given real fixtures: this lane doesn't touch what they draw,
 * only that they fail quietly instead of reaching out.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const GIBS_DIR = join(FIXTURES, "gibs");
const HISTORY_DIR = join(FIXTURES, "history");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const monthQuakes = JSON.parse(readFileSync(join(HISTORY_DIR, "usgs-4.5-month.geojson"), "utf8"));
const weekQuakes = JSON.parse(readFileSync(join(HISTORY_DIR, "usgs-2.5-week.geojson"), "utf8"));

const DAY_JPG = readFileSync(join(GIBS_DIR, "gibs-day.jpg"));
const BASE_JPG = readFileSync(join(GIBS_DIR, "gibs-base.jpg"));
const NIGHT_JPG = readFileSync(join(GIBS_DIR, "gibs-night.jpg"));
const SEA_ICE_PNG = readFileSync(join(GIBS_DIR, "gibs-seaice.png"));
const RELIEF_JPG = readFileSync(join(GIBS_DIR, "gibs-relief.jpg"));

const MONTH_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson";
const WEEK_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";
// HazardLayer's own live "now" feed (a different USGS endpoint from this
// lane's two above) — routed by its own exact URL, not a domain wildcard,
// so registration order can never make it shadow this lane's two fetches.
const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

/** Same fixture-by-LAYERS-param routing as e2e/globe-L1.spec.ts's own
 *  `withGibsFixtures` (that lane's file, not reused by import — every spec
 *  in this suite is self-contained). Covers the day-fetch chain, the
 *  time-lapse frames (smaller WIDTH/HEIGHT, same LAYERS/endpoint) and
 *  compare's exact-date request, all one endpoint distinguished only by
 *  query params this route doesn't need to inspect beyond LAYERS. */
async function withGibsFixtures(page: Page) {
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: SEA_ICE_PNG });
    if (url.includes("ASTER_GDEM")) return route.fulfill({ contentType: "image/jpeg", body: RELIEF_JPG });
    const body = url.includes("Black_Marble") ? NIGHT_JPG : url.includes("BlueMarble") ? BASE_JPG : DAY_JPG;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

/** This lane's own two USGS feeds (registered after the blanket abort below
 *  so they take precedence — Playwright resolves multiple matching routes
 *  last-registered-first). */
async function withHistoryFixtures(page: Page) {
  await page.route(MONTH_URL, (route) => route.fulfill({ json: monthQuakes }));
  await page.route(WEEK_URL, (route) => route.fulfill({ json: weekQuakes }));
}

/** Every OTHER lane's live feed this page also opens, none of them this
 *  lane's concern: aborted so HazardLayer/aurora/launches settle into their
 *  own honest "failed" state instead of reaching a real network (G10). Each
 *  is its own exact or narrowly-scoped URL, never a bare domain wildcard, so
 *  none of them can shadow this lane's two USGS history fetches regardless
 *  of registration order. */
async function abortUnrelatedFeeds(page: Page) {
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

async function withAllFixtures(page: Page) {
  await abortUnrelatedFeeds(page);
  await withHistoryFixtures(page);
  await withApiFixtures(page);
  await withGibsFixtures(page);
}

/** Sets the store's `timeOffsetMin` by driving the real slider input, not a
 *  store backdoor (globe-lanes.md's ownership rule keeps this spec off
 *  globeStore.ts/GlobeScene.tsx). React ignores a plain `el.value = x`
 *  assignment (it tracks value through the native setter it wraps), so this
 *  calls that native setter directly before dispatching `input`, the
 *  standard way to drive a controlled input from outside React. */
async function setOffsetMinutes(slider: Locator, minutes: number) {
  const position = offsetToSlider(minutes);
  await slider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(position));
}

type HistoryDebug = { status: "idle" | "loading" | "live" | "failed"; total: number; activePulses: number };
function readHistoryDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __HISTORY_DEBUG__?: HistoryDebug }).__HISTORY_DEBUG__);
}

async function openGlobe(page: Page, isoNow: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withAllFixtures(page);
  await page.clock.setFixedTime(new Date(isoNow));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
}

test("scrubbing away from now replays USGS history as pulses, and fetches only once", async ({ page }) => {
  test.setTimeout(150_000); // this sandbox's software-rendered WebGL makes every actionability check (visible/stable) slow, not just this lane's own work — see the sibling tests' own note.
  await openGlobe(page, "2026-09-28T10:00:00Z"); // inside both fixtures' time range
  const slider = page.getByLabel(/Simulated time offset, non-linear/);

  // Nothing fetched at "now" — HistoryLayer's own lazy-fetch gate.
  expect(await readHistoryDebug(page)).toBeUndefined();

  await setOffsetMinutes(slider, -4 * 1440); // 4 days back, inside the week fixture's own span
  await expect.poll(async () => (await readHistoryDebug(page))?.status, { timeout: 30_000 }).toBe("live");
  const afterFirstScrub = await readHistoryDebug(page);
  expect(afterFirstScrub?.total).toBeGreaterThan(0); // month + week feeds, deduped by id

  // Sweep sim time forward across the fixtures' quakes: three clicks of the
  // speed cycle reach "1d/s" (TimeScrubber's own SPEEDS order), fast enough
  // that a couple of real seconds crosses several real quake timestamps.
  for (let i = 0; i < 2; i++) await page.getByTitle("Cycle playback speed").click();
  await page.getByLabel("Play simulated time").click();
  await expect.poll(async () => (await readHistoryDebug(page))?.activePulses ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  // Space (TimeScrubber's own keyboard contract), not a click on the pause
  // button: while playing, the sim clock advances every real animation
  // frame, and this sandbox's software-rendered WebGL is slow enough that a
  // click's visible/stable actionability wait can starve behind it. A key
  // press has no such geometry check.
  await page.keyboard.press(" ");

  // Scrubbing again never re-fetches (module-scope memory cache, "once per
  // page"): the total stays exactly what the first scrub already read.
  await setOffsetMinutes(slider, -10 * 1440);
  await expect.poll(async () => (await readHistoryDebug(page))?.status, { timeout: 20_000 }).toBe("live");
  expect((await readHistoryDebug(page))?.total).toBe(afterFirstScrub?.total);
});

test("daily time-lapse names the past day it shows, and changes as the scrub target changes", async ({ page }) => {
  test.setTimeout(150_000); // this sandbox's software-rendered WebGL is slow enough that texture decode/upload and effect scheduling can outrun generous poll budgets on their own, independent of app logic.
  await openGlobe(page, "2026-09-24T12:00:00Z");
  const slider = page.getByLabel(/Simulated time offset, non-linear/);
  const probe = page.locator("[data-earth-style]");
  await expect(probe).toHaveAttribute("data-earth-status", "live", { timeout: 30_000 });
  const liveDetail = await probe.getAttribute("data-earth-detail");
  expect(liveDetail).not.toContain("time machine");

  await setOffsetMinutes(slider, -3 * 1440);
  await expect.poll(async () => probe.getAttribute("data-earth-detail"), { timeout: 45_000 }).toContain("time machine");
  const detailA = await probe.getAttribute("data-earth-detail");
  const dateA = detailA?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  expect(dateA).toBeTruthy();

  await setOffsetMinutes(slider, -9 * 1440);
  await expect.poll(async () => {
    const d = await probe.getAttribute("data-earth-detail");
    return d?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  }, { timeout: 45_000 }).not.toBe(dateA);

  // Back to "now": the time-lapse label steps aside for the live one again.
  await page.getByRole("button", { name: "Now", exact: true }).click();
  await expect.poll(async () => probe.getAttribute("data-earth-detail"), { timeout: 20_000 }).not.toContain("time machine");
});

test("swipe compare: the divider drags and nudges, Esc exits", async ({ page }) => {
  test.setTimeout(90_000); // see the sibling tests' own note on this sandbox's slow software-rendered WebGL.
  await openGlobe(page, "2026-09-24T12:00:00Z");
  const probe = page.locator("[data-earth-style]");
  await expect(probe).toHaveAttribute("data-earth-status", "live", { timeout: 30_000 });

  await page.getByRole("button", { name: "Compare" }).click();
  const divider = page.locator("[data-globe-compare-divider]");
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  await expect(page.locator("[data-globe-compare]").getByText("Today")).toBeVisible();

  // Drag the handle a quarter of the way toward the left edge.
  const box = await divider.boundingBox();
  if (!box) throw new Error("compare divider has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1440 * 0.2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBeLessThan(30);

  // Keyboard nudges (compare.ts's own vocabulary: arrows 1%, Home to the floor).
  const before = Number(await divider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await divider.getAttribute("aria-valuenow"))).toBe(before + 1);
  await page.keyboard.press("Home");
  await expect(divider).toHaveAttribute("aria-valuenow", "2");

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-globe-compare]")).toHaveCount(0);
});
