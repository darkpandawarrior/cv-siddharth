import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, Locator } from "@playwright/test";
import { QUAKES_URL, EONET_URL, GDACS_URL, OVATION_URL, KP_URL, LAUNCHES_URL, nhcConeUrl, NHC_CONE_LAYER_IDS } from "../src/world/globe/layers/feedUrls.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const json = (name: string) => JSON.parse(fixture(name).toString());

async function openGlobe(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  for (const [path, file] of [["weather", "weather-2026-09-24.json"], ["tle", "tle.json"], ["aircraft", "aircraft.json"], ["whereami", "whereami-IN.json"]]) {
    await page.route(`**/api/${path}`, (route) => route.fulfill({ json: json(file) }));
  }
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => {
    const url = route.request().url();
    const file = url.includes("Sea_Ice") ? "gibs-seaice.png" : url.includes("Black_Marble") ? "gibs-night.jpg" : url.includes("BlueMarble") ? "gibs-base.jpg" : "gibs-day.jpg";
    return route.fulfill({ contentType: file.endsWith("png") ? "image/png" : "image/jpeg", body: fixture(`gibs/${file}`) });
  });
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => route.fulfill({ contentType: "image/jpeg", body: fixture("wmts/tile-base.jpg") }));
  for (const [url, file] of [[QUAKES_URL, "quakes.json"], [EONET_URL, "eonet.json"], [GDACS_URL, "gdacs.json"], [OVATION_URL, "ovation.json"], [KP_URL, "kp.json"], [LAUNCHES_URL, "launches.json"]]) {
    await page.route(url, (route) => route.fulfill({ json: json(`hazards/${file}`) }));
  }
  for (const id of NHC_CONE_LAYER_IDS) await page.route(nhcConeUrl(id), (route) => route.fulfill({ json: json(`hazards/${id === NHC_CONE_LAYER_IDS[0] ? "nhc-cone.json" : "nhc-empty.json"}`) }));
  // Weekly volcanoes have an independent server feed; EONET supplies this key's fixture.
  await page.route("**/api/volcanoes", (route) => route.fulfill({ json: { connected: false, rows: [] } }));
  await page.clock.setFixedTime(new Date("2026-09-27T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
}

async function layers(page: Page, width: number) {
  if (width < 640) {
    await page.getByRole("button", { name: "Open the layers sheet" }).click();
    return page.locator("[data-globe-layer-sheet]");
  }
  const opener = page.getByRole("button", { name: "Open the layers panel" });
  if (await opener.isVisible()) await opener.click();
  return page.locator("[data-globe-layer-panel]");
}

async function contained(inner: Locator, outer: Locator) {
  await expect(inner).toBeVisible(); await expect(outer).toBeVisible();
  const a = await inner.boundingBox(), b = await outer.boundingBox();
  expect(a).not.toBeNull(); expect(b).not.toBeNull();
  expect(a!.x).toBeGreaterThanOrEqual(b!.x);
  expect(a!.y).toBeGreaterThanOrEqual(b!.y);
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width);
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + b!.height);
}

for (const [width, height] of [[1440, 900], [1024, 768], [820, 1180]]) {
  test(`X-ray stays in the Layers column, clear of chrome at ${width}`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = { id: "quake:test", kind: "quake", title: "Test event", rows: [], source: "USGS fixture", live: true };
    });
    await openGlobe(page, width, height);
    await expect(page.locator("[data-globe-inspector]")).toBeVisible({ timeout: 30_000 });
    const collapse = page.getByRole("button", { name: "Collapse the layers panel" });
    if (await collapse.isVisible()) await collapse.click();
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    const readout = page.locator("[data-xray-panel]");
    await expect(readout).toBeVisible();
    await page.screenshot({ path: `test-results/Y2-xray-${width}.png` });
    await contained(readout, page.locator("[data-globe-layer-panel]"));
    const box = (await readout.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    for (const selector of ["[data-explore-bar]", "[data-globe-inspector]", "[data-globe-time-scrubber]"]) {
      const other = page.locator(selector);
      if (!(await other.isVisible())) continue;
      const b = (await other.boundingBox())!;
      expect(box.x < b.x + b.width && box.x + box.width > b.x && box.y < b.y + b.height && box.y + box.height > b.y, selector).toBe(false);
    }
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    await expect(readout).toHaveCount(0);
    const panel = await layers(page, width);
    await expect(panel).toContainText("X X-ray");
    await expect(panel).toContainText("/ or Cmd-K search");
    // Reopening from a scrolled panel must bring its readout into view too.
    await panel.getByText("X X-ray", { exact: false }).scrollIntoViewIfNeeded();
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    await expect(readout).toBeVisible();
    await contained(readout, panel);
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    await expect(readout).toHaveCount(0);
  });
}

for (const [width, height] of [[390, 844], [360, 740]]) {
  test(`phone X-ray toggle and HUD entry work at ${width}`, async ({ page }) => {
    await openGlobe(page, width, height);
    const sheet = await layers(page, width);
    const toggle = sheet.locator("[data-xray-sheet-toggle]");
    await expect(toggle).toBeVisible();
    const target = (await toggle.boundingBox())!;
    expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const readout = sheet.locator("[data-xray-panel]");
    await expect(readout).toBeVisible();
    await expect.poll(async () => Number((await sheet.locator("[data-xray-legend]").innerText()).match(/quadtree, (\d+)/)?.[1] ?? 0)).toBeGreaterThan(0);
    await expect.poll(async () => Number((await sheet.locator("[data-xray-stats]").innerText()).match(/draw calls\s+(\d+)/)?.[1] ?? 0)).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/Y2-xray-${width}.png` });
    await contained(readout, sheet);
    await contained(sheet.getByRole("button", { name: "Close the layers sheet" }), sheet);
    await contained(toggle, sheet);
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await readout.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    const controls = (await toggle.boundingBox())!, box = (await readout.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(controls.y + controls.height);
    await toggle.click();
    await expect(readout).toHaveCount(0);
    await sheet.getByRole("button", { name: "Close the layers sheet" }).click();
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("[data-xray-panel]")).toBeVisible();
    await contained(sheet.locator("[data-xray-panel]"), sheet);
    await page.locator("[data-xray-toggle]").waitFor({ state: "attached" });
    if (!(await page.locator("[data-xray-toggle]").isVisible())) await page.locator("[data-hud-overflow] > summary").click();
    await page.locator("[data-xray-toggle]").click();
    await expect(page.locator("[data-xray-panel]")).toHaveCount(0);
    await page.screenshot({ path: `test-results/Y2-phone-${width}.png` });
  });
}

for (const [width, height] of [[1440, 900], [390, 844], [360, 740]]) {
  test(`eclipse and daylight explain their keys at ${width}`, async ({ page }) => {
    await openGlobe(page, width, height);
    const panel = await layers(page, width);
    await panel.getByRole("button", { name: "Eclipse paths", exact: true }).click();
    await panel.getByText("Umbra / antumbra track (illustrative width)", { exact: true }).scrollIntoViewIfNeeded();
    await expect(panel.getByText("Umbra / antumbra track (illustrative width)", { exact: true })).toBeVisible();
    await expect(panel.getByText("Live shadow point (during eclipse)", { exact: true })).toBeVisible();
    await expect(panel).toContainText("next:");
    const daylight = panel.getByRole("button", { name: "Golden hour and waking cities", exact: true });
    if (await daylight.getAttribute("aria-pressed") === "false") await daylight.click();
    for (const text of ["Golden-hour band", "Waking-cities band"]) {
      const key = panel.getByText(text, { exact: true });
      await key.scrollIntoViewIfNeeded(); await expect(key).toBeVisible();
    }
    await page.screenshot({ path: `test-results/Y2-bands-${width}.png` });
  });
  test(`all drawn Earth events explain their keys at ${width}`, async ({ page }) => {
    await openGlobe(page, width, height);
    const panel = await layers(page, width);
    // The same debug object is published with the renderer's drawn sets.
    await expect.poll(() => page.evaluate(() => {
      const d = window.__HAZARD_DEBUG__;
      return !!d && d.quakes > 0 && d.fires > 0 && d.storms > 0 && d.volcanoes > 0 && d.alerts > 0 && d.launches > 0 && d.nhcCones > 0 && d.aurora;
    })).toBe(true);
    for (const prefix of ["Fires:", "Storms:", "Volcanoes:", "Alerts:", "Launches:", "NHC cones:", "Aurora:"]) {
      const key = panel.locator("[data-globe-legend] li").filter({ hasText: prefix });
      await key.scrollIntoViewIfNeeded(); await expect(key).toBeVisible();
    }
    await expect(panel).toContainText("NOAA OVATION nowcast), Kp 3.33");
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/Y2-keys-${width}.png` });
  });
}
