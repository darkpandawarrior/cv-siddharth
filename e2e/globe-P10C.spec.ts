import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
const STATIONS = "https://api.tidesandcurrents.noaa.gov/mdapi/**";
const DATA = "https://api.tidesandcurrents.noaa.gov/api/**";
async function open(page: Page) {
  await page.clock.install({ time: new Date("2026-08-12T12:30:00Z") });
  await page.addInitScript(() => { window.__W11_TEST__ = true; localStorage.setItem("cv-siddharth:globe-intro-seen", "1"); });
  await page.route("**/api/**", (route) => new URL(route.request().url()).hostname === "localhost" ? route.fulfill({ status: 503, json: {} }) : route.fallback());
  await page.route("https://marine-api.open-meteo.com/**", (route) => route.fulfill({ json: {} }));
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: {} }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/globe"); await waitForHydration(page);
  await page.waitForFunction(() => !!window.__V4_HOVER__);
}
test("near a NOAA station shows dated MLLW water level, next tide and sourced CAPE", async ({ page }) => {
  await page.route(STATIONS, (route) => route.fulfill({ json: { stations: [{ id: "8518750", name: "The Battery", lat: 40.7, lng: -74 }] } }));
  await page.route(DATA, (route) => route.fulfill({ json: route.request().url().includes("product=water_level") ? { data: [{ t: "2026-08-12 12:24", v: "1.23" }] } : { predictions: [{ t: "2026-08-12 14:00", v: "0.2", type: "L" }] } }));
  await page.route("https://api.open-meteo.com/v1/forecast**", (route) => route.fulfill({ json: { hourly: { time: ["2026-08-12T12:00"], cape: [123] } } }));
  await open(page); await page.evaluate(() => window.__V4_HOVER__!.move({ lat: 40.7, lon: -74 }));
  await expect(page.locator("[data-hover-tide]")).toContainText("1.23 m MLLW", { timeout: 20000 });
  await expect(page.locator("[data-hover-tide]")).toContainText("next low 2026-08-12 14:00 UTC");
  await expect(page.locator("[data-hover-cape]")).toContainText("123 J/kg, atmospheric instability proxy, not lightning", { timeout: 20000 });
  await expect(page.locator("[data-hover-meteor]")).toHaveCount(2);
  await expect(page.locator("[data-hover-meteor]").first()).toContainText("Southern Delta Aquariids");
  await expect(page.locator("[data-hover-meteor]").last()).toContainText("Perseids");
});
test("outside US coverage states the radius limit, failed CAPE is explicit", async ({ page }) => {
  await page.route(STATIONS, (route) => route.fulfill({ json: { stations: [{ id: "8518750", name: "The Battery", lat: 40.7, lng: -74 }] } }));
  await page.route("https://api.open-meteo.com/v1/forecast**", (route) => route.fulfill({ status: 503, json: {} }));
  await open(page); await page.evaluate(() => window.__V4_HOVER__!.move({ lat: 18.52, lon: 73.86 }));
  await expect(page.locator("[data-hover-tide]")).toContainText("No NOAA tide station within 50 km (US coastal coverage)", { timeout: 20000 });
  await expect(page.locator("[data-hover-cape]")).toContainText("CAPE feed unreachable", { timeout: 20000 });
});
