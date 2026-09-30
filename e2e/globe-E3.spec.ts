import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

export async function openPinnedGlobe(page: Page, failed = false) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00Z"));
  const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname === "/api/weather") return route.fulfill({ json: fixture("weather-2026-09-24") });
    if (url.pathname === "/api/whereami") return route.fulfill({ json: fixture("whereami-IN") });
    if (url.pathname === "/api/wind") return failed ? route.fulfill({ status: 503, body: "unavailable" }) : route.fulfill({ json: { connected: true, stale: false, modelTime: "2026-09-30T11:00:00Z", grid: { latStart: -90, latStep: 180, latCount: 2, lonStart: -180, lonStep: 180, lonCount: 2 }, u: [3,3,3,3], v: [4,4,4,4], attribution: ["Open-Meteo (CC BY 4.0)"] } });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, body: "unavailable" });
    return route.continue();
  });
  await page.route("https://earthquake.usgs.gov/**", route => failed ? route.abort() : route.fulfill({ json: { type: "FeatureCollection", metadata: { generated: Date.parse("2026-09-30T12:00:00Z") }, features: [] } }));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect(canvas).toHaveAttribute("tabindex", "0", { timeout: 30000 });
  await page.getByRole("button", { name: "Pin points", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pin points", exact: true })).toHaveAttribute("aria-pressed", "true");
  return canvas;
}
export async function surfacePosition(page: Page, shift = 0) {
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(() => probe.getAttribute("data-globe-x")).not.toBeNull();
  const canvas = await page.locator("[data-globe-root] canvas").first().boundingBox();
  if (!canvas) throw new Error("Canvas missing");
  const x = Number(await probe.getAttribute("data-globe-x"));
  const y = Number(await probe.getAttribute("data-globe-y"));
  const r = Number(await probe.getAttribute("data-globe-r"));
  return { x: canvas.x + x + shift * r, y: canvas.y + y - r * 0.3 };
}
for (const mobile of [false, true]) test.describe(mobile ? "touch" : "desktop", () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
  test("pins compares scrubs removes and clears", async ({ page }) => {
    const canvas = await openPinnedGlobe(page);
    const first = await surfacePosition(page, -0.2);
    if (mobile) await page.touchscreen.tap(first.x, first.y);
    else { await page.mouse.move(first.x, first.y); await canvas.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("[data-pinned-point]")).toHaveCount(1);
    const second = await surfacePosition(page, 0.2);
    if (mobile) await page.touchscreen.tap(second.x, second.y); else await page.mouse.click(second.x, second.y);
    await expect(page.locator("[data-pinned-point]")).toHaveCount(2);
    const panel = page.getByRole("region", { name: "Pinned point comparison" });
    await expect(panel).toContainText("sampled model grid");
    await expect(panel).toContainText("5.0 m/s");
    await expect(panel).toContainText("2026-09-30 11:00 UTC");
    await expect(panel).toContainText("Unavailable: no event within 300 km");
    const before = await panel.locator("[data-pinned-point]").allTextContents();
    await canvas.focus(); await page.keyboard.press("[");
    await expect(panel.locator("[data-pin-time]")).not.toHaveText("Viewing 2026-09-30 12:00 UTC");
    await expect.poll(() => panel.locator("[data-pinned-point]").allTextContents()).not.toEqual(before);
    await page.getByRole("button", { name: "Close pinned readouts" }).focus();
    await page.keyboard.press("Tab");
    await expect(panel.locator("[data-pinned-point]").first()).toBeFocused();
    await page.getByRole("button", { name: "Remove point A", exact: true }).click();
    await expect(page.locator("[data-pinned-point]")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    if (mobile) await page.touchscreen.tap(first.x, first.y); else await page.mouse.click(first.x, first.y);
    await expect(panel).toBeVisible();
    await page.getByRole("button", { name: "Close pinned readouts" }).click();
    await expect(panel).toHaveCount(0);
  });
  test("failed sources remain explicitly unavailable", async ({ page }) => {
    await openPinnedGlobe(page, true);
    const point = await surfacePosition(page);
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    const panel = page.getByRole("region", { name: "Pinned point comparison" });
    await expect(panel).toContainText("Unavailable: feed not loaded or failed");
    await expect(panel).toContainText("Observation time unavailable");
    await panel.getByText("More readings", { exact: true }).click();
    await expect(panel).toContainText("Marine");
    await expect(panel).toContainText("NOAA CO-OPS");
    await expect(panel).toContainText("No cached reading");
  });
});
