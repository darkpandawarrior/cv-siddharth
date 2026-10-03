import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

// Exercise terrain DEM loading and app-ring picking on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 1);
});

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
type FrameStallWindow = Window & { __Y3_RESUME_FRAMES__?: () => void };
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
      await page.evaluate(p => {
        const frames = new Map<number, FrameRequestCallback>();
        const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
        let id = -1;
        // Withhold paint after the initial pending rows. Settling data must
        // still start on a slow compositor without another animation frame.
        window.requestAnimationFrame = callback => {
          if (!document.querySelector("[data-hover-cape]")) return raf(callback);
          frames.set(--id, callback);
          return id;
        };
        window.cancelAnimationFrame = handle => { if (!frames.delete(handle)) cancel(handle); };
        (window as FrameStallWindow).__Y3_RESUME_FRAMES__ = () => {
          window.requestAnimationFrame = raf;
          window.cancelAnimationFrame = cancel;
          frames.forEach(callback => raf(callback));
          frames.clear();
          delete (window as FrameStallWindow).__Y3_RESUME_FRAMES__;
        };
        window.__V4_HOVER__!.move(p);
      }, point);
      const rows = page.locator("[data-hover-marine], [data-hover-air-quality], [data-hover-flood], [data-hover-tide], [data-hover-cape]");
      await expect(rows).toHaveCount(5, { timeout: 2500 });
      const rowMs = Date.now() - began;
      expect(rowMs).toBeLessThan(2500);
      for (const text of await rows.allTextContents()) {
        expect(text).toContain("loading");
        expect(text).not.toMatch(/^No /);
      }
      // Leaving cancels the settle timer; returning to the same cell must
      // re-arm it even while paint remains withheld.
      await page.evaluate(p => { window.__V4_HOVER__!.leave(); window.__V4_HOVER__!.move(p); }, point);
      await expect.poll(() => Object.keys(starts).length, { timeout: 2500 }).toBe(5);
      await page.evaluate(() => (window as FrameStallWindow).__Y3_RESUME_FRAMES__?.());
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
    } finally {
      await page.evaluate(() => (window as FrameStallWindow).__Y3_RESUME_FRAMES__?.());
      release();
    }
  });
}

for (const viewport of viewports.filter(v => v.width < 640)) {
  test.describe(`native touch at ${viewport.width}px`, () => {
    test.use({ hasTouch: true });
    test("a canvas tap keeps the desktop hover chip hidden", async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.goto("/globe");
      await waitForHydration(page);
      const canvas = page.locator("[data-globe-root] canvas").first();
      await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
      const probe = page.locator("[data-subsolar-probe]");
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(0);
      const target = await canvas.evaluate(el => {
        const probe = document.querySelector("[data-subsolar-probe]")!;
        const box = el.getBoundingClientRect();
        const cx = box.x + Number(probe.getAttribute("data-globe-x"));
        const cy = box.y + Number(probe.getAttribute("data-globe-y"));
        const radius = Number(probe.getAttribute("data-globe-r"));
        const covered: { x: number; y: number; hit: string | undefined }[] = [];
        // Stay inside the lower disc, choosing a point the current chrome exposes.
        for (const dy of [0.7, 0.5, 0.3, 0.1]) for (const dx of [0, -0.35, 0.35, -0.6, 0.6]) {
          if (dx * dx + dy * dy > 0.8 * 0.8) continue;
          const x = cx + dx * radius, y = cy + dy * radius;
          const hit = document.elementFromPoint(x, y);
          if (hit === el) return { x, y, radius, covered };
          covered.push({ x, y, hit: hit?.tagName });
        }
        throw new Error(`No canvas point on lower disc: ${JSON.stringify({ width: box.width, height: box.height, cx, cy, radius, covered })}`);
      });
      const { x, y } = target;
      await testInfo.attach("touch-canvas-point", { body: JSON.stringify(target), contentType: "application/json" });
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, { x, y })).toBe("CANVAS");
      await expect(page.locator("[data-hover-readout]")).toBeHidden();
      await page.touchscreen.tap(x, y);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      await expect(page.locator("[data-hover-readout]")).toBeHidden();
    });
  });
}

for (const viewport of [...viewports, { width: 1024, height: 768 }]) {
  test(`HTTP failures stay distinct from no-data at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    for (const host of ["marine-api.open-meteo.com", "air-quality-api.open-meteo.com", "flood-api.open-meteo.com", "api.open-meteo.com", "api.tidesandcurrents.noaa.gov"]) {
      await page.route(`https://${host}/**`, r => r.fulfill({ status: 503, body: "Feed unavailable" }));
    }
    await page.route("https://api.tidesandcurrents.noaa.gov/mdapi/**", r => r.fulfill({ json: { stations: [{ id: "9414290", name: "San Francisco", lat: 37.8063, lng: -122.4659 }] } }));
    await page.goto("/globe");
    await waitForHydration(page);
    await page.waitForFunction(() => !!window.__V4_HOVER__);
    await page.evaluate(() => window.__V4_HOVER__!.move({ lat: 37.8063, lon: -122.4659 }));
    for (const row of ["marine", "air-quality", "flood", "tide", "cape"]) {
      await expect(page.locator(`[data-hover-${row}]`)).toContainText("unreachable");
      await expect(page.locator(`[data-hover-${row}]`)).not.toContainText("No ");
    }
  });
}

for (const viewport of viewports.filter(v => v.width < 640)) {
  test.describe(`scene picks at ${viewport.width}px`, () => {
    test.use({ hasTouch: true });
    test("the biggest app column remains tappable", async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.clock.setFixedTime(new Date("2026-09-28T10:30:00Z"));
      await page.route("**/api/signals", r => r.fulfill({ json: { ...fixture("live/signals.json"), ci: undefined } }));
      await page.goto("/globe");
      await waitForHydration(page);
      const canvas = page.locator("[data-globe-root] canvas");
      await expect(canvas).toHaveAttribute("data-camera-flying", "false");
      const point = await canvas.evaluate(async el => {
        const read = () => (window as unknown as { __REACH_DEBUG__?: { appProbeX: number; appProbeY: number } }).__REACH_DEBUG__;
        for (let frame = 0; frame < 3; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
        const box = el.getBoundingClientRect(), p = read();
        if (!p || !Number.isFinite(p.appProbeX) || !Number.isFinite(p.appProbeY)) throw new Error("App projection is not ready");
        return { x: box.x + p.appProbeX, y: box.y + p.appProbeY };
      });
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point)).toBe("CANVAS");
      await page.touchscreen.tap(point.x, point.y);
      await expect(page.locator("[data-globe-inspector] h2")).toHaveText("SmartBike");
    });

    test("a Moon single tap selects it and a double tap zooms without a card", async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.clock.setFixedTime(new Date("2026-09-30T22:30:00Z"));
      await page.goto("/globe");
      await waitForHydration(page);
      const canvas = page.locator("[data-globe-root] canvas");
      await expect(canvas).toHaveAttribute("data-camera-flying", "false");
      const moon = page.locator("[data-moon-probe]");
      await expect(moon).toHaveAttribute("data-moon-x", /^-?\d+$/);
      const point = () => canvas.evaluate(el => {
        const box = el.getBoundingClientRect(), moon = document.querySelector("[data-moon-probe]")!;
        return { x: box.x + Math.max(8, Math.min(box.width - 8, Number(moon.getAttribute("data-moon-x")))), y: box.y + Math.max(8, Math.min(box.height - 8, Number(moon.getAttribute("data-moon-y")))) };
      });
      let p = await point();
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, p)).toBe("CANVAS");
      await page.touchscreen.tap(p.x, p.y);
      const selection = page.getByRole("region", { name: "Selection details" });
      await expect(selection.locator("h2")).toHaveText("The Moon");
      await selection.getByRole("button", { name: "Close", exact: true }).click();
      const probe = page.locator("[data-subsolar-probe]");
      const before = Number(await probe.getAttribute("data-globe-r"));
      p = await point();
      expect(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, p)).toBe("CANVAS");
      await page.touchscreen.tap(p.x, p.y);
      await page.touchscreen.tap(p.x, p.y);
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(before * 1.1);
      await expect(selection).toBeHidden();
    });
  });
}
