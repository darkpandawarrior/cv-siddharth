import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const dem = readFileSync(new URL("./fixtures/street/terrarium-tile.png", import.meta.url));
const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 740 }];

async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
  for (const [route, file] of Object.entries({ weather: "weather-2026-09-24.json", tle: "tle.json", aircraft: "aircraft.json", whereami: "whereami-IN.json", wind: "wind/wind-2026-09-28.json" })) {
    await page.route(`**/api/${route}`, r => r.fulfill({ json: fixture(file) }));
  }
  await page.addInitScript(() => {
    localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    window.__W11_TEST__ = true;
  });
}

for (const viewport of viewports) {
  test.describe(`interaction truth at ${viewport.width}px`, () => {
    test.use({ hasTouch: viewport.width < 640 });
    for (const failed of [false, true]) {
      test(`terrain-${failed ? "404" : "loaded"}-${viewport.width}: ${failed ? "404 never earns a credit" : "earns its credit after DEM decoding"}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await prepare(page);
        await page.addInitScript(() => {
          window.__GLOBE_TEST_STREET__ = { lat: 18.5195, lon: 73.8412, bearing: 135, pitch: 55 };
          const states: string[] = [];
          Object.assign(window, { __Y3_TERRAIN_STATES__: states });
          new MutationObserver(() => {
            const state = document.querySelector("[data-street-view]")?.getAttribute("data-terrain-state");
            if (state && states.at(-1) !== state) states.push(state);
          }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-terrain-state"] });
        });
        await page.route("https://tiles.openfreemap.org/**", r => r.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
        await page.route("https://api.panoramax.xyz/api/search**", r => r.fulfill({ json: fixture("street/panoramax-empty.json") }));
        let release!: () => void;
        const ready = new Promise<void>(resolve => { release = resolve; });
        let tiles = 0;
        await page.route("**/api/terrain?**", async r => {
          tiles++;
          await ready;
          await (failed ? r.fulfill({ status: 404, body: "No DEM tile" }) : r.fulfill({ contentType: "image/png", body: dem }));
        });
        try {
          await page.goto("/globe");
          await waitForHydration(page);
          const street = page.locator("[data-street-view]");
          await expect(street).toHaveAttribute("data-terrain-state", "loading");
          await expect.poll(() => tiles).toBeGreaterThan(0);
          await expect(street).toContainText("Terrain loading");
          await expect(street).not.toContainText("SRTM");
          release();
          await expect(street).toHaveAttribute("data-terrain-state", failed ? "unreachable" : "enabled", { timeout: 30_000 });
          const states = await page.evaluate(() => (window as unknown as { __Y3_TERRAIN_STATES__: string[] }).__Y3_TERRAIN_STATES__);
          if (failed) {
            expect(states).not.toContain("enabled");
            await expect(street).toContainText("Terrain unreachable; showing a flat map");
            await expect(street).not.toContainText("SRTM");
            expect(await page.evaluate(() => window.__GLOBE_TEST_STREET_MAP__!.getTerrain())).toBeNull();
          } else {
            await expect(street).toContainText("Terrain: SRTM, courtesy of the U.S. Geological Survey");
            expect(await page.evaluate(() => window.__GLOBE_TEST_STREET_MAP__!.getTerrain()?.source)).toBe("terrain-dem");
          }
          await testInfo.attach("terrain-states", { body: JSON.stringify({ states, tiles }), contentType: "application/json" });
        } finally { release(); }
      });
    }
  });
}

for (const viewport of [...viewports, { width: 1024, height: 768 }]) {
  test(`all five hover rows are present within 2.5s at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    const starts: Record<string, number> = {};
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    // NOAA's public San Francisco station, no private location data.
    const point = { lat: 37.8063, lon: -122.4659 };
    await page.route("https://api.tidesandcurrents.noaa.gov/mdapi/**", r => r.fulfill({ json: { stations: [{ id: "9414290", name: "San Francisco", lat: point.lat, lng: point.lon }] } }));
    for (const [host, json] of Object.entries({
      "marine-api.open-meteo.com": { current: {} },
      "air-quality-api.open-meteo.com": { current: {} },
      "flood-api.open-meteo.com": { daily: { river_discharge: [] } },
      "api.open-meteo.com": { hourly: { time: [], cape: [] } },
      "api.tidesandcurrents.noaa.gov/api": { data: [], predictions: [] },
    })) {
      await page.route(`https://${host}/**`, async r => {
        starts[host] ??= Date.now();
        await ready;
        await r.fulfill({ json });
      });
    }
    try {
      await page.goto("/globe");
      await waitForHydration(page);
      await page.waitForFunction(() => !!window.__V4_HOVER__);
      const began = Date.now();
      await page.evaluate(p => window.__V4_HOVER__!.move(p), point);
      const rows = page.locator("[data-hover-marine], [data-hover-air-quality], [data-hover-flood], [data-hover-tide], [data-hover-cape]");
      await expect(rows).toHaveCount(5, { timeout: 2500 });
      const rowMs = Date.now() - began;
      expect(rowMs).toBeLessThan(2500);
      for (const text of await rows.allTextContents()) {
        expect(text).toContain("loading");
        expect(text).not.toMatch(/^No /);
      }
      await expect.poll(() => Object.keys(starts).length, { timeout: 2500 }).toBe(5);
      release();
      await expect(page.locator("[data-hover-air-quality]")).toContainText("No air-quality data here");
      await expect(page.locator("[data-hover-marine]")).toContainText("No marine data here");
      await expect(page.locator("[data-hover-flood]")).toContainText("No river data here");
      await expect(page.locator("[data-hover-cape]")).toContainText("No current CAPE model reading");
      await expect(page.locator("[data-hover-tide]")).toContainText("no current reading");
      const timings = { width: viewport.width, rowMs, settledMs: Date.now() - began, requestStartMs: Object.fromEntries(Object.entries(starts).map(([host, at]) => [host, at - began])) };
      const path = testInfo.outputPath("hover-timings.json");
      writeFileSync(path, JSON.stringify(timings));
      await testInfo.attach("hover-timings", { path, contentType: "application/json" });
    } finally { release(); }
  });
}
