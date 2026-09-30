import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { offsetToSlider } from "../src/world/globe/timeMachine/rangeModel.ts";
import type { Page, Locator } from "@playwright/test";

/**
 * WAVE 9 LANE S4 (sources-owner.md): the Local Guide ring's cumulative-to-
 * date scaling as the Time Machine scrubs, the career-ops-hq org marker
 * (Spain, org-published, country level only), the recent-public-GitHub-
 * activity-by-hour histogram gated to >= 5 events, and the Q&A answers
 * count in the guide layer's own status line. Fixed clock, every external
 * feed this page reaches routed to a committed fixture or aborted (G10,
 * same discipline as e2e/globe.spec.ts) — this spec never depends on a live
 * network. Read via `window.__GUIDE_DEBUG__` (GuideLayer.tsx's own e2e seam,
 * same convention as HazardLayer's `__HAZARD_DEBUG__`/HistoryLayer's
 * `__HISTORY_DEBUG__`) rather than a raycast click: unlike a quake glyph
 * that can be placed exactly at the camera-facing centre for a click test
 * (globe-L7.spec.ts's own trick), the guide places sit at their REAL city
 * coordinates and e2e/globe-T1.spec.ts (this layer's original lane)
 * already established arming `__GLOBE_TEST_SELECT__` / reading a debug
 * global instead of a real WebGL raycast for exactly this layer.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const activityFixture = JSON.parse(readFileSync(join(FIXTURES, "activity.json"), "utf8"));

const ALL_DAY_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

async function withApiFixtures(page: Page, activity: unknown) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.abort());
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: activity }));
  // PulseLayer's other two feeds (this lane never draws anything from
  // them) — aborted so they settle into their own honest "failed" state
  // instead of reaching a real network (G10).
  await page.route("**/api/ops", (route) => route.abort());
  await page.route("**/api/signals", (route) => route.abort());
}

/** This page's other default-on layers' own live feeds, none of them this
 *  lane's concern: aborted rather than fixtured (same discipline as
 *  e2e/globe-X3.spec.ts's own `abortUnrelatedFeeds`). */
async function abortUnrelatedFeeds(page: Page) {
  await page.route(ALL_DAY_URL, (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

/** Same real-slider approach as e2e/globe-X3.spec.ts's own `setOffsetMinutes`
 *  (globe-lanes.md's ownership rule keeps this spec off globeStore.ts). */
async function setOffsetMinutes(slider: Locator, minutes: number) {
  const position = offsetToSlider(minutes);
  await slider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(position));
}

type GuideDebug = {
  simYear: number;
  scales: Record<string, number>;
  statusDetail: string;
  orgMarker: { lat: number; lon: number };
  activityEvents: number;
  activityHistogram: number[] | null;
  face: (slug: string) => void;
  screenPoint: (slug: string) => { x: number; y: number } | null;
};
function readGuideDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __GUIDE_DEBUG__?: GuideDebug }).__GUIDE_DEBUG__);
}

async function openGlobe(page: Page, isoNow: string, activity: unknown = activityFixture) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await abortUnrelatedFeeds(page);
  await withApiFixtures(page, activity);
  await page.clock.setFixedTime(new Date(isoNow));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas")).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await readGuideDebug(page))?.statusDetail, { timeout: 15_000 }).toBeTruthy();
}

test("the guide layer's status line surfaces the real Q&A answers count, computed from mapsTotals", async ({ page }) => {
  await openGlobe(page, "2026-09-24T12:27:00+05:30");
  const debug = await readGuideDebug(page);
  // mapsTotals.qaAnswers, src/data/generated/mapsPlaces.ts — the community
  // Q&A feature's answer count (NOT mapsTotals.answers, which is a
  // different, much larger field: binary yes/no responses to Google's
  // automated prompts). This is the literal number the generated data
  // carries today; a future re-export changing it is expected to move this
  // assertion, not to be a hardcoded 6 baked into GuideLayer.tsx itself (see
  // this lane's own status-line template, which reads the field rather than
  // a copied literal).
  expect(debug?.statusDetail).toContain("6 Q&A answers");
  expect(debug?.statusDetail).toContain("670 automated-prompt answers");

  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toContainText("6 Q&A answers");
});

test("Local Guide rings scale to cumulative-to-date as the Time Machine crosses a year boundary", async ({ page }) => {
  test.setTimeout(150_000); // software-rendered WebGL in this sandbox makes actionability checks slow (same note as globe-X3.spec.ts)
  // "Now" just after a new year, so scrubbing back ~3 weeks crosses from
  // 2026 into 2025 — Bhopal (mapsPlaces.ts: years [2017, 2018, 2019, 2022])
  // has no recorded 2025 activity, so its ring should be identical either
  // side; Pune (years [2024, 2025, 2026]) DOES, so its ring should shrink
  // once the scrub year drops below 2026.
  await openGlobe(page, "2026-01-10T12:00:00+05:30");
  const live = await readGuideDebug(page);
  expect(live?.simYear).toBe(2026);
  const liveBhopal = live?.scales["bhopal"] ?? 0;
  const livePune = live?.scales["pune"] ?? 0;
  expect(livePune).toBeGreaterThan(0);

  const slider = page.getByLabel(/Simulated time offset, non-linear/);
  await setOffsetMinutes(slider, -20 * 1440); // 20 days back: 2025-12-21, before Pune's first recorded (2024) year is affected, but after 2026 no longer counts
  await expect.poll(async () => (await readGuideDebug(page))?.simYear, { timeout: 15_000 }).toBe(2025);

  const scrubbed = await readGuideDebug(page);
  // Pune's last recorded year (2026) is no longer reached, so its ring must
  // shrink; Bhopal's last recorded year (2022) is still fully reached at
  // 2025, so its ring must hold exactly (no false growth/shrink from an
  // unrelated place).
  expect(scrubbed?.scales["pune"]).toBeLessThan(livePune);
  expect(scrubbed?.scales["bhopal"]).toBeCloseTo(liveBhopal, 6);
  // "say so in the inspector": the same layer panel row a visitor already
  // sees names the scrub year rather than silently reshaping the ring.
  expect(scrubbed?.statusDetail).toContain("rings scaled by recorded active years through 2025");
  await expect(page.locator("[data-globe-layer-panel]")).toContainText("rings scaled by recorded active years through 2025");

  // Scrubbing back to "now" restores the lifetime totals.
  await setOffsetMinutes(slider, 0);
  await expect.poll(async () => (await readGuideDebug(page))?.simYear, { timeout: 15_000 }).toBe(2026);
  const restored = await readGuideDebug(page);
  expect(restored?.scales["pune"]).toBeCloseTo(livePune, 6);
});

test("career-ops-hq's org marker is a self-published, country-level location, distinct from owner-visited places", async ({ page }) => {
  await openGlobe(page, "2026-09-24T12:27:00+05:30");
  const debug = await readGuideDebug(page);
  // Spain's country centroid, not a city (sources-owner.md's own live check
  // of api.github.com/orgs/career-ops-hq, re-verified this lane's session).
  expect(debug?.orgMarker).toEqual({ lat: 40.0, lon: -4.0 });
});

async function clickGuideMarker(page: Page, slug: string) {
  await page.evaluate((id) => window.__GUIDE_DEBUG__?.face(id), slug);
  let previous: { x: number; y: number } | null = null;
  let stable = 0;
  await expect.poll(async () => {
    const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
    if (!point) return 0;
    stable = previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.2 ? stable + 1 : 0;
    previous = point;
    return stable;
  }, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  if (!previous) throw new Error("guide marker has no screen point");
  const point = await page.evaluate((id) => window.__GUIDE_DEBUG__?.screenPoint(id), slug);
  if (!point) throw new Error("guide marker has no screen point");
  await page.mouse.click(point.x, point.y);
}

test("clicking the real org marker opens its source-labelled Inspector", async ({ page }) => {
  await openGlobe(page, "2026-09-24T12:27:00+05:30");
  await clickGuideMarker(page, "career-ops-hq");
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  await expect(inspector).toContainText("Spain · org-published location, not a person or office");
  await expect(inspector).toContainText("api.github.com/orgs/career-ops-hq");
  await expect(inspector.getByText("LIVE")).toHaveCount(0);
});

test("the recent-public-GitHub-activity histogram is computed only with >= 5 public events", async ({ page }) => {
  // The committed fixture (e2e/fixtures/activity.json) carries 6 events.
  await openGlobe(page, "2026-09-24T12:27:00+05:30");
  await expect.poll(async () => (await readGuideDebug(page))?.activityEvents, { timeout: 15_000 }).toBe(6);
  const debug = await readGuideDebug(page);
  expect(debug?.activityHistogram).not.toBeNull();
  expect(debug?.activityHistogram).toHaveLength(24);
  expect(debug?.activityHistogram!.reduce((a, b) => a + b, 0)).toBe(6);
  await clickGuideMarker(page, "pune");
  const chart = page.locator("[data-globe-inspector]").getByRole("img", { name: /recent public GitHub activity only/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator("rect")).toHaveCount(24);
  await expect(chart.locator("polyline")).toHaveCount(0);
});

test("a quiet week (fewer than 5 events) renders no histogram at all", async ({ page }) => {
  const quiet = { connected: true, items: activityFixture.items.slice(0, 3) };
  await openGlobe(page, "2026-09-24T12:27:00+05:30", quiet);
  await expect.poll(async () => (await readGuideDebug(page))?.activityEvents, { timeout: 15_000 }).toBe(3);
  const debug = await readGuideDebug(page);
  expect(debug?.activityHistogram).toBeNull();
  await clickGuideMarker(page, "pune");
  await expect(page.locator("[data-globe-inspector]")).toContainText("Pune");
  await expect(page.locator("[data-globe-inspector]").getByRole("img", { name: /recent public GitHub activity only/ })).toHaveCount(0);
});

test("a disconnected public-activity feed cannot display a cached histogram", async ({ page }) => {
  await openGlobe(page, "2026-09-24T12:27:00+05:30", { ...activityFixture, connected: false });
  await expect.poll(async () => (await readGuideDebug(page))?.activityEvents).toBe(6);
  expect((await readGuideDebug(page))?.activityHistogram).toBeNull();
  await clickGuideMarker(page, "pune");
  await expect(page.locator("[data-globe-inspector]")).toContainText("Pune");
  await expect(page.locator("[data-globe-inspector]").getByRole("img", { name: /recent public GitHub activity only/ })).toHaveCount(0);
});
