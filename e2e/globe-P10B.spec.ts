import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import sharp from "sharp";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const dem = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: 128, g: 0, b: 0 } } }).png().toBuffer();

for (const width of [1440, 390]) {
  test.describe(`terrain at ${width}px`, () => {
    test.use({ hasTouch: width === 390 });
    for (const failed of [false, true]) {
      test(`terrain ${failed ? "falls back after a DEM failure" : "loads through the routed DEM source"} at width ${width}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.addInitScript(() => {
          localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
          window.__GLOBE_TEST_STREET__ = { lat: 18.5195, lon: 73.8412, bearing: 135, pitch: 55 };
        });
        await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
        await page.route("https://**", route => route.abort());
        await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
        for (const [route, file] of Object.entries({ weather: "weather-2026-09-24.json", tle: "tle.json", aircraft: "aircraft.json", whereami: "whereami-IN.json" })) {
          await page.route(`**/api/${route}`, r => r.fulfill({ json: fixture(file) }));
        }
        await page.route("https://tiles.openfreemap.org/**", r => r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#17202b" } }] } }));
        await page.route("https://api.panoramax.xyz/api/search**", r => r.fulfill({ json: fixture("street/panoramax-empty.json") }));
        let tiles = 0;
        await page.route("**/api/terrain?**", r => { tiles++; return failed ? r.fulfill({ status: 503, body: "Terrain unavailable" }) : r.fulfill({ contentType: "image/png", body: dem }); });
        await page.goto("/globe");
        await waitForHydration(page);
        const street = page.locator("[data-street-view]");
        await expect(street).toHaveAttribute("data-terrain-state", failed ? "unreachable" : "enabled", { timeout: 30_000 });
        await expect.poll(() => tiles).toBeGreaterThan(0);
        const terrain = await page.evaluate(() => {
          const map = window.__GLOBE_TEST_STREET_MAP__!;
          return { source: map.getTerrain()?.source, encoding: (map.getStyle().sources["terrain-dem"] as { encoding?: string }).encoding, pitch: map.getPitch() };
        });
        // MapLibre's own degree/radian round trip through setPitch/getPitch lands
        // a float a few ULPs off the integer (measured: 55.00000000000001, not a
        // product bug) - toMatchObject's Object.is-style equality has no
        // tolerance for that, toBeCloseTo does.
        if (failed) {
          expect(terrain.source).toBeUndefined();
          await expect(street).toContainText("Terrain unreachable; showing a flat map");
          await expect(street).not.toContainText("U.S. Geological Survey");
          expect(await page.evaluate(() => window.__GLOBE_TEST_STREET_MAP__!.getLayoutProperty("terrain-hillshade", "visibility"))).toBe("none");
        } else {
          expect(terrain.source).toBe("terrain-dem");
          await expect(street).toContainText("U.S. Geological Survey");
        }
        expect(terrain.encoding).toBe("terrarium");
        expect(terrain.pitch).toBeCloseTo(55, 5);
        await testInfo.attach("terrain-session-tiles", { body: JSON.stringify({ width, tiles }), contentType: "application/json" });
        await page.screenshot({ path: testInfo.outputPath(`terrain-${failed ? "failed" : "enabled"}-${width}.png`) });
      });
    }
  });
}
