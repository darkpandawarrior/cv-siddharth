import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";

for (const touch of [false, true]) {
  test.describe(touch ? "double tap" : "double click", () => {
    test.use({ hasTouch: touch });
    test("zooms the free orbit through the native canvas gesture", async ({ page }) => {
      await page.setViewportSize({ width: touch ? 390 : 1440, height: touch ? 844 : 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
      for (const [route, file] of Object.entries({ weather: "weather-2026-09-24.json", tle: "tle.json", aircraft: "aircraft.json", whereami: "whereami-IN.json" })) {
        const json = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
        await page.route(`**/api/${route}`, r => r.fulfill({ json }));
      }
      await page.goto("/globe");
      await waitForHydration(page);
      const canvas = page.locator("[data-globe-root] canvas").first();
      await expect(canvas).toBeVisible();
      const probe = page.locator("[data-subsolar-probe]");
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(0);
      const before = Number(await probe.getAttribute("data-globe-r"));
      const box = (await canvas.boundingBox())!;
      const x = box.x + box.width * 0.55;
      const y = box.y + box.height * 0.55;
      if (touch) {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
      } else await page.mouse.dblclick(x, y);
      await expect.poll(async () => Number(await probe.getAttribute("data-globe-r"))).toBeGreaterThan(before * 1.1);
    });
  });
}
