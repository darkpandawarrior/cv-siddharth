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
  await page.locator("[data-explore-bar]").waitFor({ state: "attached" });
  if (!(await page.locator("[data-explore-bar] input").isVisible())) await page.locator("[data-globe-search-toggle]").click();
  await page.getByRole("button", { name: "Pin points", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pin points", exact: true })).toHaveAttribute("aria-pressed", "true");
  return canvas;
}
export async function surfacePosition(page: Page, shift = 0) {
  // Camera framing and DOM overlays both change after Escape. Require two
  // settled probe reads and a real canvas hit; never reuse old coordinates.
  let previous: { x: number; y: number } | null = null;
  let point: { x: number; y: number } | null = null;
  await expect.poll(async () => {
    const current = await page.evaluate(shift => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-globe-root] canvas");
      const probe = document.querySelector<HTMLElement>("[data-subsolar-probe]");
      if (!canvas || !probe?.dataset.globeX || !probe.dataset.globeY || !probe.dataset.globeR) return null;
      const box = canvas.getBoundingClientRect();
      const x = Number(probe.dataset.globeX), y = Number(probe.dataset.globeY), r = Number(probe.dataset.globeR);
      for (const dx of [shift < 0 ? -0.75 : 0.75, shift < 0 ? -0.85 : 0.85, shift]) {
        for (const dy of [0, -0.2, 0.2, -0.45, 0.45]) {
          const point = { x: box.x + x + dx * r, y: box.y + y + dy * r };
          if (document.elementFromPoint(point.x, point.y) === canvas) return { x, y, point };
        }
      }
      return { x, y, point: null };
    }, shift);
    const settled = current && previous && Math.abs(current.x - previous.x) <= 1 && Math.abs(current.y - previous.y) <= 1;
    previous = current;
    point = settled ? current?.point ?? null : null;
    return point;
  }, { message: "A settled, exposed globe surface must remain available for pinning" }).not.toBeNull();
  return point!;
}
for (const mobile of [false, true]) test.describe(mobile ? "touch" : "desktop", () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });
  test("pins compares scrubs removes and clears", async ({ page }, testInfo) => {
    const shot = async (state: string) => { await page.mouse.move(0, 0); await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${state}.png`) }); };
    const canvas = await openPinnedGlobe(page);
    await shot("pin-mode");
    const first = await surfacePosition(page, -0.2);
    if (mobile) await page.touchscreen.tap(first.x, first.y);
    else { await page.mouse.move(first.x, first.y); await canvas.focus(); await page.keyboard.press("Enter"); }
    await expect(page.locator("[data-pinned-point]")).toHaveCount(1);
    await shot("one-pin");
    const second = await surfacePosition(page, 0.2);
    if (mobile) await page.touchscreen.tap(second.x, second.y); else await page.mouse.click(second.x, second.y);
    await expect(page.locator("[data-pinned-point]")).toHaveCount(2);
    const panel = page.getByRole("region", { name: "Pinned point comparison" });
    await expect(panel).toContainText("sampled model grid");
    await expect(panel).toContainText("5.0 m/s");
    await expect(panel).toContainText("2026-09-30 11:00 UTC");
    await expect(panel).toContainText("Unavailable: no event within 300 km");
    const frame = await panel.boundingBox();
    const toolbar = await page.locator("[data-explore-bar]").boundingBox();
    expect(frame?.y, "The comparison must leave Done pinning fully exposed").toBeGreaterThanOrEqual((toolbar?.y ?? 0) + (toolbar?.height ?? 0));
    await shot("compare");
    await panel.locator("[data-pin-scroll]").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole("button", { name: "Close pinned readouts" })).toBeInViewport();
    await shot("compare-observations");
    await panel.locator("[data-pin-scroll]").evaluate(el => { el.scrollTop = 0; });
    const solarBefore = await panel.locator('[data-pin-value="Local solar time"]').allTextContents();
    const sunBefore = await panel.locator('[data-pin-value="Sun position"]').allTextContents();
    const windBefore = await panel.locator('[data-pin-value="Wind"]').allTextContents();
    await canvas.focus(); await page.keyboard.press("[");
    await expect(panel.locator("[data-pin-time]")).not.toHaveText("Viewing 2026-09-30 12:00 UTC");
    await expect.poll(() => panel.locator('[data-pin-value="Local solar time"]').allTextContents()).not.toEqual(solarBefore);
    await expect.poll(() => panel.locator('[data-pin-value="Sun position"]').allTextContents()).not.toEqual(sunBefore);
    await expect(panel.locator('[data-pin-value="Wind"]')).toHaveText(windBefore);
    await shot("scrubbed");
    await page.getByRole("button", { name: "Close pinned readouts" }).focus();
    await page.keyboard.press("Tab");
    await expect(panel.locator("[data-pinned-point]").first()).toBeFocused();
    const remove = page.getByRole("button", { name: "Remove point A", exact: true });
    if (mobile) await remove.tap(); else await remove.click();
    await expect(page.locator("[data-pinned-point]")).toHaveCount(1);
    await shot("removed");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    // Escape exits pin mode; pointer pinning must be explicitly re-enabled.
    if (!(await page.locator("[data-explore-bar] input").isVisible())) await page.locator("[data-globe-search-toggle]").click();
    await page.getByRole("button", { name: "Pin points", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pin points", exact: true })).toHaveAttribute("aria-pressed", "true");
    const again = await surfacePosition(page, -0.2);
    if (mobile) await page.touchscreen.tap(again.x, again.y); else await page.mouse.click(again.x, again.y);
    await expect(panel).toBeVisible();
    const close = page.getByRole("button", { name: "Close pinned readouts" });
    if (mobile) await close.tap(); else await close.click();
    await expect(panel).toHaveCount(0);
    await shot("cleared");
  });
  test("failed sources remain explicitly unavailable", async ({ page }, testInfo) => {
    await openPinnedGlobe(page, true);
    const point = await surfacePosition(page);
    if (mobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    const panel = page.getByRole("region", { name: "Pinned point comparison" });
    await expect(panel).toContainText("Unavailable: feed not loaded or failed");
    await expect(panel).toContainText("Observation time unavailable");
    await page.mouse.move(0, 0);
    await panel.locator("[data-pin-scroll]").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: testInfo.outputPath("unavailable.png") });
    const more = panel.getByText("More readings", { exact: true });
    if (mobile) await more.tap(); else await more.click();
    await expect(panel).toContainText("Marine");
    await expect(panel).toContainText("NOAA CO-OPS");
    await expect(panel).toContainText("No cached reading");
    await panel.locator("[data-pin-scroll]").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: testInfo.outputPath("more-readings.png") });
  });
});
