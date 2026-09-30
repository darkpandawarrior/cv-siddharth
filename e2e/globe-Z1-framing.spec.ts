import { test, expect, waitForHydration } from "./lib/test.ts";

for (const width of [1440, 390]) {
  test(`reduced motion preserves roundness and settled framing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
    await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
    await page.route("https://**", route => route.abort());
    await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
    await page.goto("/globe");
    await waitForHydration(page);
    await expect(page.locator("[data-globe-root] canvas").first()).toHaveAttribute("data-camera-view", "orbit");
    await page.waitForFunction(() => !!window.__GUIDE_DEBUG__?.screenRadii());
    await page.screenshot({ path: `/tmp/agent-lanes/Z1/framing-${width}.png` });
    await expect.poll(() => page.evaluate(() => {
      const radii = window.__GUIDE_DEBUG__!.screenRadii()!;
      return Math.abs(radii.horizontal / radii.vertical - 1);
    })).toBeLessThan(0.01);

    if (width === 1440) {
      await page.locator("[data-globe-inspector]").getByRole("button", { name: "Close", exact: true }).click();
    }
    await page.evaluate(() => window.__GUIDE_DEBUG__!.face("pune"));
    await expect.poll(() => page.evaluate(() => window.__GUIDE_DEBUG__!.cameraDistance())).toBeCloseTo(14, 1);
    let previous: { x: number; y: number } | null = null;
    let stable = 0;
    await expect.poll(async () => {
      const point = (await page.evaluate(() => window.__GUIDE_DEBUG__!.screenPoint("pune")))!;
      stable = previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.2 ? stable + 1 : 0;
      previous = point;
      return stable;
    }, { intervals: [50] }).toBeGreaterThanOrEqual(3);
    const before = (await page.evaluate(() => window.__GUIDE_DEBUG__!.screenPoint("pune")))!;
    await page.mouse.move(before.x, before.y);
    const after = (await page.evaluate(() => new Promise<{ x: number; y: number } | null>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.__GUIDE_DEBUG__!.screenPoint("pune"))));
    })))!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.2);
  });
}
