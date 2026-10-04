import { test, expect, waitForHydration } from "./lib/test.ts";

for (const width of [1440, 390]) {
  test(`software WebGL uses dots and stops ambient rotation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Keep a real WebGL context. Only its renderer string changes, so this
    // exercises the browser probe rather than the tier override seam.
    await page.addInitScript(() => {
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const original = prototype.getParameter;
        prototype.getParameter = function (parameter: number) {
          if (parameter === 7937 || parameter === 37446) return "ANGLE (Google SwiftShader)";
          return original.call(this, parameter);
        };
      }
    });
    let imageryRequests = 0;
    await page.route(/^https:\/\//, (route) => {
      if (new URL(route.request().url()).hostname === "gibs.earthdata.nasa.gov") imageryRequests++;
      return route.abort();
    });
    await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
    await page.routeWebSocket(/^wss?:\/\//, (socket) => socket.close());
    await page.goto("/globe");
    await waitForHydration(page);
    await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible();
    await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "dots");
    await expect(page.locator("[data-autorotate]")).toHaveAttribute("data-autorotate", "off");
    const panelButton = page.getByRole("button", { name: width < 640 ? "Open the layers sheet" : "Open the layers panel", exact: true });
    if (await panelButton.isVisible()) await panelButton.click();
    await expect(page.locator("[data-earth-status-line]:visible")).toContainText("unavailable at this graphics tier");
    await expect(page.locator("[data-globe-composer]")).toHaveCount(0);
    await expect(page.locator("[data-globe-intro]")).toHaveCount(0);
    expect(imageryRequests, "tier 3 must not fetch imagery").toBe(0);
  });
}
