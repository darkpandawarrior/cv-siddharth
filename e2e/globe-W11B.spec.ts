import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, TestInfo } from "@playwright/test";
import { GIBS_BASES, GIBS_OVERLAYS } from "../src/world/globe/layers/gibsCatalog.ts";

// Source audit reproductions: F1 dormant picker, F2 clipped health, F3 generic
// empty copy, F4 inactive contrast, F5 tiny hierarchy, F6 missing ticks, F8 hidden health.
test.use({ serviceWorkers: 'block' });

async function open(page: Page, failed = false, rows = false) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.route(/^https:\/\//, async (route) => {
    if (rows && new URL(route.request().url()).hostname === "earthquake.usgs.gov") {
      return route.fulfill({ path: join(process.cwd(), "e2e/fixtures/hazards/quakes.json"), contentType: "application/json" });
    }
    if (!failed && new URL(route.request().url()).hostname === "gibs.earthdata.nasa.gov") {
      const png = route.request().url().includes(".png");
      return route.fulfill({ path: join(process.cwd(), "e2e/fixtures/gibs", png ? "gibs-seaice.png" : "gibs-day.jpg"), contentType: png ? "image/png" : "image/jpeg" });
    }
    return route.abort();
  });
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });
}
async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  if (process.env.GLOBE_SHOTS_DIR) {
    mkdirSync(process.env.GLOBE_SHOTS_DIR, { recursive: true });
    copyFileSync(path, join(process.env.GLOBE_SHOTS_DIR, `${name}.png`));
  }
}
function panel(page: Page) {
  return page.locator("[data-globe-layer-panel]:visible, [data-globe-layer-sheet]:visible");
}
async function layers(page: Page) {
  const expand = page.getByRole("button", { name: /Open.*layers/i });
  await expect(panel(page).or(expand)).toBeVisible();
  if (!await panel(page).count()) await expand.click();
  await expect(panel(page)).toBeVisible();
}

test("F1 F4 F5 F6: reachable lazy catalog, real URL state and full legends", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const chunks: string[] = [];
  page.on("request", (request) => { if (/LayerCatalog.*\.js/.test(request.url())) chunks.push(request.url()); });
  await open(page);
  await layers(page);
  await shot(page, info, "desktop-layers-default");
  expect(chunks).toHaveLength(0);
  const inactive = panel(page).locator('button[aria-pressed="false"] span').filter({ hasText: "Countries" });
  expect(await inactive.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgb(113, 113, 122)");
  await panel(page).locator("summary").filter({ hasText: "Imagery" }).click();
  const catalog = panel(page).locator("[data-globe-layer-catalog]");
  await expect(catalog.getByRole("radio")).toHaveCount(5);
  await expect(catalog.locator('button[aria-pressed]')).toHaveCount(GIBS_OVERLAYS.length);
  await expect.poll(() => chunks.length).toBeGreaterThan(0);
  const base = catalog.getByRole("radio", { name: new RegExp(GIBS_BASES[1].title) });
  await base.click();
  await expect(base).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => page.url(), { timeout: 2000 }).toContain(GIBS_BASES[1].id);
  await page.reload();
  await waitForHydration(page);
  await layers(page);
  await panel(page).locator("summary").filter({ hasText: "Imagery" }).click();
  await expect(panel(page).getByRole("radio", { name: new RegExp(GIBS_BASES[1].title) })).toHaveAttribute("aria-checked", "true");
  const overlay = GIBS_OVERLAYS[0];
  await panel(page).getByRole("button", { name: overlay.title, exact: true }).click();
  for (const stop of overlay.legend!.stops) await expect(panel(page).locator(`[data-globe-active-overlay="${overlay.id}"] [data-globe-legend]`).first().getByText(`${stop.label} ${overlay.legend!.unit}`, { exact: true })).toBeVisible();
  await panel(page).getByRole("region", { name: "Active imagery" }).scrollIntoViewIfNeeded();
  await shot(page, info, "desktop-imagery-legend");
  await expect(panel(page).locator("[data-earth-status-line]")).toContainText(/\d{4}-\d{2}-\d{2}/, { timeout: 30000 });
});

test("F1: a rejected lazy catalog offers recovery instead of endless loading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/assets/LayerCatalog-*.js", route => route.abort());
  await open(page);
  await layers(page);
  const imagery = panel(page).locator("details").filter({ has: page.locator("summary").filter({ hasText: "Imagery" }) });
  await imagery.locator("summary").click();
  await expect(imagery.getByRole("status")).toHaveText("Imagery choices unavailable. Reload to try again.");
  await expect(imagery.locator("[data-globe-layer-catalog]")).toHaveCount(0);
  await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible();
});

test("F2 F5: narrow desktop panel wraps provenance beside existing scene controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    (window as unknown as { __GLOBE_TEST_SELECT__: unknown }).__GLOBE_TEST_SELECT__ = {
      id: "w11b-fixture", kind: "quake", title: "Example source record", rows: [{ label: "source", value: "Fixture only" }], source: "e2e fixture", live: false,
    };
  });
  await open(page);
  await layers(page);
  const detail = panel(page).locator("li p").first();
  await expect(detail).toHaveCSS("white-space", "normal");
  const box = await panel(page).boundingBox();
  for (const other of await page.locator("[data-explore-bar]:visible, [data-globe-inspector]:visible").all()) {
    const beside = await other.boundingBox();
    expect(box!.x < beside!.x + beside!.width && box!.x + box!.width > beside!.x && box!.y < beside!.y + beside!.height && box!.y + box!.height > beside!.y).toBe(false);
  }
  await shot(page, info, "desktop-1024-panel-inspector");
});

test("F3 F8: aborted imagery and feed sources have honest visible failures", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, true);
  await layers(page);
  await expect(panel(page).locator("[data-earth-status-line]")).toContainText("Imagery unavailable, showing dots", { timeout: 30000 });
  await panel(page).getByRole("tab", { name: "Live" }).click();
  await panel(page).getByRole("button", { name: "Satellites", exact: true }).click();
  await expect(panel(page).locator("[data-feed-empty]")).toContainText("Unavailable: CelesTrak TLE", { timeout: 30000 });
  await shot(page, info, "desktop-live-unavailable");
  await panel(page).getByRole("tab", { name: "Layers" }).click();
  await panel(page).getByRole("button", { name: "Satellites", exact: true }).click();
  await panel(page).getByRole("tab", { name: "Live" }).click();
  await panel(page).getByRole("button", { name: "Satellites", exact: true }).click();
  await expect(panel(page).locator("[data-feed-empty]")).toContainText("Layers off: Satellites");
  await shot(page, info, "desktop-live-layers-off");
  await panel(page).getByRole("button", { name: "Turn on layers" }).click();
});

test("F3: filtered session rows return with Show all; connected empty groups wait", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, false, true);
  await layers(page);
  await panel(page).getByRole("tab", { name: "Live" }).click();
  await expect(panel(page).locator("[data-feed-list] li button").first()).toBeVisible({ timeout: 30000 });
  await panel(page).getByRole("button", { name: "Signals", exact: true }).click();
  await expect(panel(page).locator("[data-feed-empty]")).toContainText("No signals items in this session yet");
  await shot(page, info, "desktop-live-filter-empty");
  await panel(page).getByRole("button", { name: "Show all" }).click();
  await expect(panel(page).locator("[data-feed-list] li button").first()).toBeVisible();
});

test("F3: connected producers with no session entries keep neutral waiting copy", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, true);
  await layers(page);
  await panel(page).getByRole("tab", { name: "Live" }).click();
  await panel(page).getByRole("button", { name: "Explorers", exact: true }).click();
  await expect(panel(page).locator("[data-feed-empty]")).toContainText("Nothing yet");
  await shot(page, info, "desktop-live-waiting");
});

test.describe("phone targets and scroll", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("F1 F5 F8: sheet scrolls to 44px imagery controls without overflow", async ({ page }, info) => {
    await open(page, true);
    await layers(page);
    await shot(page, info, "phone-layers-top");
    await expect(panel(page).locator("[data-earth-status-line]")).toContainText("Imagery unavailable, showing dots", { timeout: 30000 });
    await panel(page).locator("[data-earth-status-line]").scrollIntoViewIfNeeded();
    await shot(page, info, "phone-earth-failed");
    await panel(page).locator("summary").filter({ hasText: "Imagery" }).click();
    for (const button of await panel(page).getByRole("radio").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await panel(page).getByRole("radio").first().scrollIntoViewIfNeeded();
    await shot(page, info, "phone-imagery");
    await panel(page).getByRole("tab", { name: "Live" }).click();
    for (const chip of await panel(page).locator('[aria-label="Filter the live feed"] button').all()) {
      const box = await chip.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
