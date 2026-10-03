import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

// Exercise overlay WMTS requests and legends on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

for (const viewport of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  for (const route of ["/globe", "/map"]) {
    test(`Y4 header ${route} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await waitForHydration(page);
      const header = page.locator('[data-spine="route-header"]');
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      console.log(`Y4 header ${route} ${viewport.width}: ${box?.height}px`);
      expect(box!.height).toBeLessThanOrEqual(60);
      for (const control of [header.getByRole("button", { name: "Surfaces" }), header.getByRole("button", { name: "Portfolio" }), ...["STREET", "ORBIT", "GLOBE"].map((name) => header.getByRole("link", { name, exact: true })), header.getByRole("button", { name: "Ask my AI" })]) {
        await expect(control).toBeVisible();
        const rect = await control.boundingBox();
        expect(rect!.width).toBeGreaterThanOrEqual(44);
        expect(rect!.height).toBeGreaterThanOrEqual(44);
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 1440) {
        const kicker = header.locator(".kicker");
        await expect(kicker).toContainText(route === "/globe" ? "the reach, from orbit" : "the projects as a constellation");
        expect(await kicker.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
    });
  }
}


const fixture = (path: string) => readFileSync(new URL(`./fixtures/${path}`, import.meta.url));
const overlays = [
  { id: "IMERG_Precipitation_Rate", title: "Precipitation rate", unit: "mm/hr", date: "2026-09-29", age: "24 h", source: "NASA GIBS / GPM IMERG" },
  { id: "OMPS_Ozone_Total_Column", title: "Total-column ozone", unit: "DU", date: "2026-09-30", age: "0 h", source: "NASA GIBS / OMPS Suomi NPP" },
];

async function imageryFixtures(page: Page, feed: { fail: boolean }) {
  for (const [endpoint, path] of [["weather", "weather-2026-09-24.json"], ["tle", "tle.json"], ["aircraft", "aircraft.json"], ["whereami", "whereami-IN.json"]]) {
    await page.route(`**/api/${endpoint}`, (route) => route.fulfill({ json: JSON.parse(fixture(path).toString()) }));
  }
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => route.fulfill({ contentType: "image/jpeg", body: fixture("gibs/gibs-day.jpg") }));
  const requests: string[] = [];
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => {
    const url = route.request().url();
    requests.push(url);
    if (feed.fail && overlays.some((entry) => url.includes(`/${entry.id}/`))) return route.fulfill({ status: 404, body: "unavailable" });
    return route.fulfill({ contentType: url.endsWith(".png") ? "image/png" : "image/jpeg", body: fixture(url.endsWith(".png") ? "wmts/tile-overlay.png" : "wmts/tile-base.jpg") });
  });
  return requests;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
  for (const fail of [false, true]) {
    test(`Y4-catalogue-${fail ? "404" : "loaded"}-${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const feed = { fail };
      const requests = await imageryFixtures(page, feed);
      await page.clock.setFixedTime(new Date("2026-09-30T00:07:00Z"));
      await page.goto("/globe");
      await waitForHydration(page);
      if (viewport.width < 640) await page.locator("[data-hud-overflow] > summary").click();
      await page.getByRole("button", { name: "Pause the globe's ambient rotation", exact: true }).click();
      if (viewport.width < 640) await page.getByRole("button", { name: "Open the layers sheet", exact: true }).click();
      const panel = page.locator(viewport.width < 640 ? "[data-globe-layer-sheet]" : "[data-globe-layer-panel]");
      await expect(panel).toBeVisible();
      // Isolate imagery through the public preset, leaving the other globe
      // features to their gate specs instead of rendering them in every case.
      await panel.getByRole("button", { name: "Clean", exact: true }).click();
      await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery");
      await panel.locator("summary").filter({ hasText: "Imagery" }).click();
      const catalog = panel.locator("[data-globe-layer-catalog]");
      await expect(catalog).toBeVisible();
      if (!fail) expect(await catalog.evaluate((node) => getComputedStyle(node).backgroundColor)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
      for (const entry of overlays) {
        await catalog.getByRole("button", { name: entry.title, exact: true }).click();
        const active = catalog.locator(`[data-globe-active-overlay="${entry.id}"]`);
        await active.scrollIntoViewIfNeeded();
        await expect(active).toContainText(entry.source);
        await expect(active).toContainText(entry.unit);
        await expect.poll(() => requests.some((url) => url.includes(`/${entry.id}/default/${entry.date}/2km/`))).toBe(true);
        if (fail) {
          await expect(active.getByRole("status")).toHaveText("feed unavailable");
          await expect(active.locator("[data-globe-legend]")).toHaveCount(0);
          await expect(active).not.toContainText("Daily frame");
        } else {
          await expect(active).toContainText(`Daily frame ${entry.date} UTC`);
          await expect(active).toContainText(entry.age);
          const legends = active.locator("[data-globe-legend]");
          await expect(legends).toHaveCount(entry.id.startsWith("IMERG") ? 2 : 1);
          await legends.first().scrollIntoViewIfNeeded();
          await expect(legends.first()).toBeInViewport();
          await expect(active.getByRole("list", { name: `Legend, ${entry.unit}` }).first()).toBeVisible();
          if (entry.id.startsWith("IMERG")) {
            await expect(active).toContainText("not live radar");
            await expect(active).toContainText("Snow");
            await legends.last().scrollIntoViewIfNeeded();
            await expect(legends.last()).toBeInViewport();
          }
        }
        if (viewport.width === 360 && !fail) await page.screenshot({ path: `/tmp/G4-${viewport.width}-${entry.id}-loaded.png` });
      }
      if (fail) {
        feed.fail = false;
        for (const entry of overlays) {
          const toggle = catalog.getByRole("button", { name: entry.title, exact: true });
          await toggle.click();
          await toggle.click();
          const active = catalog.locator(`[data-globe-active-overlay="${entry.id}"]`);
          await expect(active).toContainText(`Daily frame ${entry.date} UTC`);
          await expect(active.locator("[data-globe-legend]")).toHaveCount(entry.id.startsWith("IMERG") ? 2 : 1);
          await expect(active.getByRole("status")).toHaveCount(0);
        }
      } else {
        // Scrubbing across midnight must request a different frame without
        // camera motion, then show that loaded frame instead of today's date.
        await catalog.getByRole("button", { name: overlays[1].title, exact: true }).focus();
        await page.keyboard.press("["); // 00:07 UTC minus one 15-minute step crosses midnight.
        for (const [index, entry] of overlays.entries()) {
          const date = index === 0 ? "2026-09-28" : "2026-09-29";
          await expect.poll(() => requests.some((url) => url.includes(`/${entry.id}/default/${date}/2km/`))).toBe(true);
          await expect(catalog.locator(`[data-globe-active-overlay="${entry.id}"]`)).toContainText(`Daily frame ${date} UTC`);
        }
        await panel.getByRole("button", { name: "Dots", exact: true }).click();
        for (const entry of overlays) {
          const active = catalog.locator(`[data-globe-active-overlay="${entry.id}"]`);
          await expect(active.getByRole("status")).toHaveText("Imagery unavailable; showing dots");
          await expect(active.locator("[data-globe-legend]")).toHaveCount(0);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
