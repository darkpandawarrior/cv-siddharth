import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";

async function gesture(page: import("@playwright/test").Page, touch: boolean, x: number, y: number) {
  await page.mouse.move(x, y);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x, y })).toBe("CANVAS");
  if (touch) { await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y); }
  else await page.mouse.dblclick(x, y);
}

for (const touch of [false, true]) {
  test.describe(touch ? "double tap" : "double click", () => {
    test.use({ hasTouch: touch });
    test("zooms the free orbit through the native canvas gesture", async ({ page }, info) => {
      await page.setViewportSize({ width: touch ? 390 : 1440, height: touch ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
      await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
      await page.route("https://**", route => route.abort());
      await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
      // AIC864's fixture sits on Pune's ray, above the guide ring. This
      // marker gesture must hit the ring, not an unrelated aircraft.
      await page.route("**/api/aircraft", route => route.abort());
      for (const [route, file] of Object.entries({ weather: "weather-2026-09-24.json", tle: "tle.json", whereami: "whereami-IN.json" })) {
        const json = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
        await page.route(`**/api/${route}`, r => r.fulfill({ json }));
      }
      await page.goto("/globe");
      await waitForHydration(page);
      const canvas = page.locator("[data-globe-root] canvas").first();
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
      const probe = page.locator("[data-subsolar-probe]");
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(0);
      const before = Number(await probe.getAttribute("data-globe-r"));
      const box = (await canvas.boundingBox())!;
      // Aim below the measured search overlay, on the globe's lower disc.
      const x = box.x + Number(await probe.getAttribute("data-globe-x")) - (touch ? 0 : before * 0.6);
      const explore = (await page.locator("[data-explore-bar]").boundingBox())!;
      const y = Math.max(box.y + Number(await probe.getAttribute("data-globe-y")) + before * (touch ? 0.7 : 0.15), explore.y + explore.height + 8);
      writeFileSync(info.outputPath("gesture.json"), JSON.stringify({ x, y, before, box, hit: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML, { x, y }) }, null, 2));
      await page.screenshot({ path: info.outputPath("gesture.png") });
      await expect.poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x, y })).toBe("CANVAS");
      if (touch) {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      } else await page.mouse.dblclick(x, y);
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(before * 1.1);
      await expect(page.locator("[data-pinned-readouts]")).toHaveCount(0);

      // A marker must honour the same dolly gesture. Its first tap must not
      // open a sheet over the second tap or turn this into a fly-to.
      const selection = page.getByRole("region", { name: "Selection details" });
      if (await selection.isVisible()) await selection.getByRole("button", { name: "Close", exact: true }).click();
      await page.waitForFunction(() => !!window.__GUIDE_DEBUG__);
      await page.evaluate(() => window.__GUIDE_DEBUG__!.face("pune"));
      await expect.poll(async () => Number(await canvas.getAttribute("data-camera-distance"))).toBeCloseTo(14, 1);
      let point = (await page.evaluate(() => window.__GUIDE_DEBUG__!.screenPoint("pune")))!;
      await expect.poll(async () => {
        point = (await page.evaluate(() => window.__GUIDE_DEBUG__!.screenPoint("pune")))!;
        await page.mouse.move(point.x, point.y);
        return page.evaluate(p => document.elementFromPoint(p.x, p.y)?.tagName, point);
      }).toBe("CANVAS");
      const markerBefore = Number(await probe.getAttribute("data-globe-r"));
      await gesture(page, touch, point.x, point.y);
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(markerBefore * 1.1);
      await expect(page.locator("[data-pinned-readouts]")).toHaveCount(0);
      await expect(selection).toBeHidden();
    });
  });
}

test.describe("phone disc centre", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("idle exploration leaves the projected centre available for double tap", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
      if (url.pathname === "/api/weather") return route.fulfill({ json: JSON.parse(readFileSync(new URL("./fixtures/weather-2026-09-24.json", import.meta.url), "utf8")) });
      return url.pathname.startsWith("/api/") ? route.fulfill({ status: 503, json: {} }) : route.continue();
    });
    await page.goto("/globe");
    await waitForHydration(page);
    const canvas = page.locator("[data-globe-root] canvas").first();
    await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
    await expect(page.locator("[data-explore-bar]")).toBeVisible();
    const probe = page.locator("[data-subsolar-probe]");
    await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(0);
    const box = (await canvas.boundingBox())!;
    const x = box.x + Number(await probe.getAttribute("data-globe-x")), y = box.y + Number(await probe.getAttribute("data-globe-y"));
    const before = Number(await canvas.getAttribute("data-camera-distance"));
    await gesture(page, true, x, y);
    await expect.poll(async () => Number(await canvas.getAttribute("data-camera-distance"))).toBeLessThan(before);
  });
});
