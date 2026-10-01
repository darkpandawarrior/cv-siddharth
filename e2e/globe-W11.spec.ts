import { test, expect, waitForHydration } from "./lib/test.ts";
import { photonFixture, reverseFixture, weatherFixture } from "./fixtures/explore/exploreFixtures.ts";
import type { Page } from "@playwright/test";

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.addInitScript(() => { window.__W11_TEST__ = true; window.__GLOBE_PRESENCE_TEST__ = { FR: 3 }; });
  // All external feeds are deterministic or explicitly unavailable. The
  // same-origin country artifact and worker are deliberately never mocked.
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
  await page.route("https://photon.komoot.io/api/**", route => route.fulfill({ json: photonFixture }));
  await page.route("https://api.bigdatacloud.net/**", route => route.fulfill({ json: reverseFixture }));
  await page.route("https://api.open-meteo.com/**", route => route.fulfill({ json: weatherFixture }));
  await page.route("https://earthquake.usgs.gov/**", route => route.fulfill({ json: { features: [{ id: "fixture-paris", properties: { mag: 2, place: "Synthetic Paris fixture", time: Date.parse("2026-09-28T11:00:00Z"), url: "" }, geometry: { type: "Point", coordinates: [2.35, 48.85, 5] } }] } }));
  await page.goto("/globe"); await waitForHydration(page);
  await expect(page.getByRole("combobox", { name: "Search places" })).toBeVisible({ timeout: 30_000 });
}

test("Paris search supports keyboard selection and populates the place inspector", async ({ page }) => {
  await openGlobe(page);
  let requests = 0; page.on("request", r => { if (r.url().includes("photon.komoot.io")) requests++; });
  await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Search places" });
  await expect(search).toBeFocused();
  await search.fill("Pa"); await page.waitForTimeout(400); expect(requests).toBe(0);
  await search.fill("Paris"); await expect(page.getByRole("option")).toContainText("Paris");
  // The one-box command/ask row precedes the first place result.
  await expect(page.getByRole("option", { name: /^Paris\b/ })).toBeVisible();
  await search.press("ArrowDown"); await search.press("ArrowDown");
  await expect(page.getByRole("option", { name: /^Paris\b/ })).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  const inspector = page.getByRole("region", { name: "Selection details" });
  await expect(inspector.getByRole("heading")).toHaveText("Paris");
  await expect(inspector).toContainText("France"); await expect(inspector).toContainText("Photon (OpenStreetMap, ODbL)");
  await expect(inspector).toContainText("48.8566, 2.3522");
  expect(requests).toBe(1);
  await search.press("Escape"); await expect(search).toHaveValue("");
});

test("countries toggle loads real boundaries and picks France with live counts", async ({ page }) => {
  await openGlobe(page);
  const open = page.getByRole("button", { name: "Open the layers panel" });
  if (await open.isVisible()) await open.click();
  const toggle = page.getByRole("button", { name: /^Countries/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false"); await toggle.click();
  await page.waitForFunction(() => !!window.__W11_COUNTRY__);
  await page.evaluate(() => window.__W11_COUNTRY__!.pick({ lat: 48.8566, lon: 2.3522 }));
  const inspector = page.getByRole("region", { name: "Selection details" });
  await expect(inspector.getByRole("heading")).toHaveText("France");
  await expect(inspector.locator("dd").nth(0)).toHaveText("FR");
  await expect(inspector.locator("dd").nth(1)).toHaveText("3");
  await expect(inspector.locator("dd").nth(2)).toHaveText("1");
  await page.evaluate(() => window.__W11_COUNTRY__!.hover({ lat: 48.8566, lon: 2.3522 }));
  await expect(page.getByRole("tooltip")).toHaveText("France");
  await toggle.click(); await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("point lookup is user initiated and rate limited; measurement reports geodesic distance", async ({ page }) => {
  await openGlobe(page);
  let weatherRequests = 0; page.on("request", r => { if (r.url().includes("api.open-meteo.com")) weatherRequests++; });
  expect(weatherRequests).toBe(0);
  await page.getByRole("button", { name: "What's here", exact: true }).click();
  await page.evaluate(() => { window.__W11_POINT__!({ lat: 48.8566, lon: 2.3522 }); window.__W11_POINT__!({ lat: 0, lon: 0 }); });
  const inspector = page.getByRole("region", { name: "Selection details" });
  await expect(inspector).toContainText("18°C"); await expect(inspector).toContainText("Europe/Paris");
  await expect(inspector).toContainText("Sunrise"); expect(weatherRequests).toBe(1);
  await page.getByRole("button", { name: "Measure", exact: true }).click();
  await page.evaluate(() => { window.__W11_POINT__!({ lat: 51.5074, lon: -0.1278 }); window.__W11_POINT__!({ lat: 40.7128, lon: -74.006 }); });
  await expect(page.locator("[data-measure-result]")).toHaveText("5570.2 km · 3007.7 nm · 288.3° initial");
  expect(weatherRequests).toBe(1);
  await page.getByRole("button", { name: "Clear exploration" }).click();
  await expect(page.locator("[data-measure-result]")).toHaveCount(0);
});
