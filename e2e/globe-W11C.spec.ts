import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { briefingFixtures } from "./fixtures/briefing/live.ts";
const shots = process.env.GLOBE_SHOTS_DIR ?? "/private/tmp/claude-501/-Users-darkpandawarrior-Repos/740d63f5-5ee4-444c-898d-1c7247dd41ab/scratchpad/lanes/W11C/screenshots";
async function shot(page: Page, name: string) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${name}.png`), fullPage: false }); }
async function setup(page: Page, down = false, url = "/globe", iss = false) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  const fixtures = briefingFixtures(Date.now());
  let launchRequests = 0;
  page.on("request", request => { if (request.url().startsWith("https://ll.thespacedevs.com/")) launchRequests++; });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (down && ["/api/tle", "/api/volcanoes"].includes(path)) return route.fulfill({ status: 503, body: "Unavailable" });
    return route.fulfill({ json: path === "/api/volcanoes" ? fixtures.gvp : path === "/api/tle" ? iss ? fixtures.tle : { connected: false, objects: [], epochNewest: null } : path === "/api/whereami" ? { country: "IN", countryName: "India" } : {} });
  });
  for (const [pattern, json] of [["https://earthquake.usgs.gov/**", fixtures.quakes], ["https://eonet.gsfc.nasa.gov/**", fixtures.eonet], ["https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", fixtures.kp], ["https://ll.thespacedevs.com/**", fixtures.launches]] as const) {
    await page.route(pattern, route => down ? route.fulfill({ status: 503, body: "Unavailable" }) : route.fulfill({ json }));
  }
  // Every sibling hazard producer must settle locally; no live-provider waits.
  for (const pattern of ["https://www.gdacs.org/**", "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", "https://mapservices.weather.noaa.gov/**"]) {
    await page.route(pattern, route => route.fulfill({ status: 503, body: "Unavailable" }));
  }
  const launchResponse = page.waitForResponse(response => response.url().startsWith("https://ll.thespacedevs.com/"));
  await page.goto(url);
  expect((await launchResponse).status()).toBe(down ? 503 : 200);
  await waitForHydration(page);
  await expect(page.locator("[data-brief-trigger]")).toBeVisible({ timeout: 30000 });
  // Wait for the scene's loaded feeds, rather than the first lazy DOM paint.
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.status.detail), { timeout: 30000 }).toContain(down ? "Launch Library unreachable" : "1 launches");
  return { fixtures, launchRequests: () => launchRequests };
}
async function keyboardOpen(page: Page) {
  const trigger = page.locator("[data-brief-trigger]");
  for (let n = 0; n < 100 && !await trigger.evaluate(el => el === document.activeElement); n++) await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-globe-briefing]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close briefing" })).toBeFocused();
}
test("keyboard open, Inspect, Escape and Fly to; lazy chunk and desktop views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", req => { if (/Briefing[^/]*\.js/.test(req.url())) chunks.push(req.url()); });
  await setup(page);
  expect(chunks.length).toBeGreaterThan(0);
  await keyboardOpen(page);
  await expect(page.locator("[data-brief-card]")).toHaveCount(4, { timeout: 30000 });
  await shot(page, "1440-open");
  await page.keyboard.press("Tab"); // first Fly to
  await expect(page.getByRole("button", { name: "Fly to M6.2 Briefing quake fixture", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); // first Inspect
  await expect(page.getByRole("button", { name: "Inspect M6.2 Briefing quake fixture", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-globe-inspector]")).toContainText("Briefing quake");
  await expect(page.locator("[data-brief-trigger]")).toBeFocused();
  await shot(page, "1440-inspect");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-globe-briefing]")).toHaveCount(0);
  await expect(page.locator("[data-brief-trigger]")).toBeFocused();
  await page.keyboard.press("Enter");
  const before = page.url();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.url(), { timeout: 15000 }).not.toBe(before);
  await page.setViewportSize({ width: 1024, height: 768 });
  await shot(page, "1024-trigger");
  const trigger = await page.locator("[data-brief-trigger]").boundingBox();
  expect(trigger).not.toBeNull();
  expect(trigger!.x + trigger!.width).toBeLessThanOrEqual(1024);
});
test("opening and reopening add no Launch Library requests, including a cached reload", async ({ page }) => {
  const session = await setup(page);
  expect(session.launchRequests()).toBe(1);
  for (let n = 0; n < 2; n++) {
    await keyboardOpen(page);
    await expect(page.locator("[data-brief-card]")).toHaveCount(4);
    await expect(page.locator("[data-globe-briefing]")).toContainText("Briefing launch fixture");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-globe-briefing]")).toHaveCount(0);
  }
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.launches)).toBe(1);
  await keyboardOpen(page);
  await expect(page.locator("[data-globe-briefing]")).toContainText("Briefing launch fixture");
  expect(session.launchRequests()).toBe(1);
});
test("ISS Inspect uses its own epoch and completes the scene's visible pass scan", async ({ page }) => {
  const { fixtures } = await setup(page, false, "/globe", true);
  await keyboardOpen(page);
  const card = page.locator("[data-brief-card]").filter({ hasText: "ISS orbital position" });
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card).toContainText(`TLE epoch ${fixtures.issEpoch}`);
  await expect(card).not.toContainText(fixtures.tle.epochNewest);
  await card.getByRole("button", { name: "Inspect ISS orbital position" }).click();
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.selectedKind)).toBe("satellite");
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.selectedRows?.find(row => row.label === "TLE epoch age")?.value)).toBe("2.0 days");
  await expect.poll(() => page.evaluate(() => window.__HAZARD_DEBUG__?.selectedRows?.find(row => row.label === "Next visible pass (Pune)")?.value), { timeout: 30000 }).toMatch(/^(\d{2}:\d{2}|none in the next 7 days)$/);
});
test("all feeds down names every source with zero cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, true);
  await keyboardOpen(page);
  await expect(page.locator("[data-brief-card]")).toHaveCount(0);
  const panel = page.locator("[data-globe-briefing]");
  for (const source of ["USGS", "NASA EONET", "Smithsonian GVP", "NOAA SWPC", "CelesTrak ISS", "Launch Library 2"]) await expect(panel).toContainText(source);
  await expect(panel).toContainText("Latest request failed", { timeout: 30000 });
  await shot(page, "1440-unavailable");
});
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("sheet, 44 px targets and real Satellites action", async ({ page }) => {
    // Load the share state before waiting for hydrated controls and feeds.
    await setup(page, false, "/globe?ly=hazards,markers,stars,wind,reach,guide,daylight");
    await shot(page, "390-bar");
    await page.locator("[data-brief-trigger]").tap();
    const panel = page.locator("[data-globe-briefing]");
    await expect(panel).toBeVisible();
    const enable = page.getByRole("button", { name: "Turn on Satellites" });
    await expect(enable).toBeVisible();
    await shot(page, "390-sheet");
    for (const button of await panel.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await enable.tap();
    await expect(enable).toHaveCount(0);
    await expect(panel).not.toContainText("Satellites layer is off");
    await page.getByRole("button", { name: "Close briefing" }).tap();
    await expect(page.locator("[data-brief-trigger]")).toBeFocused();
  });
});
