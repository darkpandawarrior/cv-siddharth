import { test, expect } from "@playwright/test";

/**
 * The two surfaces the world rebuild added, neither of which any existing
 * suite touches.
 *
 * Both exist for visitors the 3D world was never going to reach — someone
 * whose browser has no WebGL, or who has asked their OS for less motion. That
 * is exactly the audience least likely to be checked by hand, which is why
 * they get a test rather than a look.
 */

test.describe("the static corridor, for visitors who never see it move", () => {
  // page.emulateMedia, not test.use({ reducedMotion }) — the context option
  // silently fails to reach matchMedia here (verified on Playwright 1.61.1:
  // the page still reported no-preference and rendered the 3D world), so a
  // suite written with it would pass by testing the wrong branch. rail.spec.ts
  // already reaches for emulateMedia for the same reason.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("a reduced-motion visitor gets the baked corridor, not a blank branch", async ({ page }) => {
    await page.goto("/playground");
    // The list branch is what reduced-motion resolves to; the plate sits above
    // the room grid, which remains the navigation.
    const plate = page.locator('img[src*="corridor"]');
    await expect(plate).toBeVisible();

    // It has to SAY something. A decorative bake with an empty alt would leave
    // a screen-reader user with a heading and nothing between it and the grid.
    const alt = await plate.getAttribute("alt");
    expect(alt, "the corridor plate needs real alt text").toBeTruthy();
    expect(alt!.length).toBeGreaterThan(40);

    // and the grid is still there — the plate is additive, never a substitute
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("a[href^='/']").count()).toBeGreaterThan(5);
  });

  test("does not silently clip at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/playground");
    await page.locator('img[src*="corridor"]').waitFor();
    const over = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const img = document.querySelector('img[src*="corridor"]') as HTMLElement | null;
      return img ? Math.round(img.getBoundingClientRect().right) - limit : -1;
    });
    expect(over, "the plate must not run past the viewport").toBeLessThanOrEqual(1);
  });
});
