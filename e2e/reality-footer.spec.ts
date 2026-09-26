import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./lib/test.ts";

/**
 * The footer's live layer (spine F3/F4, reality P6, M8): the weather chip
 * (with and without air data, and with the upstream down), the Spotify
 * now-playing chip gated on `connected === true` in production, and the
 * hydration-safety guarantee every live/timed chip on the page makes —
 * nothing painted before mount ever disagrees with what the server sent.
 *
 * P1-00's fixtures (e2e/fixtures/*.json) stand in for every live route this
 * page touches, so a test here never depends on network state.
 */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const WEATHER_OK = fixture("weather-2026-09-24.json");
const WEATHER_NOAIR = fixture("weather-noair-2026-09-24.json");
const SPOTIFY_DISCONNECTED = { connected: false };

async function mockLiveRoutes(
  page: Page,
  opts: { weather?: unknown; weatherAbort?: boolean; spotify?: unknown } = {},
): Promise<void> {
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: opts.spotify ?? SPOTIFY_DISCONNECTED }));
  if (opts.weatherAbort) {
    await page.route("**/api/weather", (route) => route.abort());
  } else {
    await page.route("**/api/weather", (route) => route.fulfill({ json: opts.weather ?? WEATHER_OK }));
  }
}

const NOON = "2026-09-24T12:27:00+05:30"; // solar noon, the same fixed instant spine.spec.ts uses
const NIGHT = "2026-09-24T03:15:00+05:30"; // when the fixtures' own live sample was actually taken

test("footer weather chip reads 'Pune 22.9 °C, overcast, AQI 77'", async ({ page }) => {
  await mockLiveRoutes(page, { weather: WEATHER_OK });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("footer")).toContainText(/22\.9 °C, overcast, AQI 77/);
});

test("with air:null the chip still shows temperature and condition, and never invents an AQI", async ({ page }) => {
  await mockLiveRoutes(page, { weather: WEATHER_NOAIR });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  const footer = page.locator("footer");
  await expect(footer).toContainText(/overcast/);
  await expect(footer).not.toContainText("AQI");
});

test("with /api/weather aborted the chip reads unavailable, with no spinner", async ({ page }) => {
  await mockLiveRoutes(page, { weatherAbort: true });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  const footer = page.locator("footer");
  await expect(footer).toContainText(/unavailable/);
  expect(await page.locator('[role="progressbar"], [aria-busy="true"]').count()).toBe(0);
});

test("with /api/spotify {connected:false} the production build shows no placeholder track text", async ({ page }) => {
  // No import.meta.env.DEV override here on purpose: playwright.config.ts's
  // webServer runs `npm run build && npm run serve` (or a prebuilt preview
  // under PLAYWRIGHT_PREBUILT=1), i.e. this IS the production build — the
  // one surface where SPOTIFY_PREVIEW must never render (spine F3).
  await mockLiveRoutes(page, { spotify: SPOTIFY_DISCONNECTED });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  const footer = page.locator("footer");
  await expect(footer).not.toContainText("Song title");
  await expect(footer).not.toContainText("Artist name");
});

test("a weather reading outside plausible bounds marks the chip SUSPECT (idea-atlas SYS-3)", async ({ page }) => {
  const suspectWeather = {
    ...(WEATHER_OK as { weather: Record<string, unknown> }),
    weather: { ...(WEATHER_OK as { weather: Record<string, unknown> }).weather, tempC: 60 },
  };
  await mockLiveRoutes(page, { weather: suspectWeather });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('[data-evidence-chip][data-suspect="true"]')).toHaveCount(1);
});

test("the fixture's own plausible reading never marks the chip SUSPECT (break-it pair)", async ({ page }) => {
  await mockLiveRoutes(page, { weather: WEATHER_OK });
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator('[data-evidence-chip][data-suspect="true"]')).toHaveCount(0);
});

for (const at of [NOON, NIGHT]) {
  test(`no hydration warnings on / at ${at}`, async ({ page }) => {
    const hydrationWarnings: string[] = [];
    page.on("console", (msg) => {
      if (/hydrat/i.test(msg.text())) hydrationWarnings.push(msg.text());
    });
    await mockLiveRoutes(page, { weather: WEATHER_OK });
    await page.clock.setFixedTime(new Date(at));
    await page.goto("/", { waitUntil: "networkidle" });
    expect(hydrationWarnings).toEqual([]);
  });
}
