import { test, expect, waitForHydration } from "./lib/test.ts";

test("the mobile studio previews the selected real project with keyboard access", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await waitForHydration(page);

  const studio = page.locator(".hero-studio-stage");
  const selector = studio.getByRole("group", { name: "Choose a project to preview" });
  await expect(studio.locator(".hero-device-screen")).toHaveAttribute("src", /doori\/screenshots\/track_data_preview_overview_tab\.webp/);

  const gaddi = selector.getByRole("button", { name: "Gaddi" });
  await gaddi.focus();
  await page.keyboard.press("Enter");
  await expect(gaddi).toHaveAttribute("aria-pressed", "true");
  await expect(studio.locator(".hero-device-screen")).toHaveAttribute("src", /gaddi\/screenshots\/home_phone\.webp/);
  await expect(studio.getByRole("link", { name: "Explore case study" })).toHaveAttribute("href", "/project/gaddi");

  await selector.getByRole("button", { name: "PaymentsLab-KMP" }).click();
  await expect(studio.locator(".hero-device-screen")).toHaveAttribute("src", /paymentslab-kmp\/screenshots\/ios_catalog\.png/);
  await expect(studio.getByRole("link", { name: "Explore case study" })).toHaveAttribute("href", "/project/paymentslab-kmp");
  await expect(studio.locator(".hero-device-screen")).toHaveJSProperty("complete", true);
  await expect(studio.locator(".hero-device-screen")).not.toHaveJSProperty("naturalWidth", 0);
  const assertFitsViewport = async () => {
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      scroll: scrollX,
      documentWidth: document.documentElement.scrollWidth,
      boxes: [...document.querySelectorAll(".hero-studio-copy, .hero-studio-stage, .hero-device-shell, .hero-studio-selector button")]
        .map(el => ({ name: el.className, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })),
    }));
    await testInfo.attach("hero-bounds", { body: JSON.stringify(bounds), contentType: "application/json" });
    expect(bounds.scroll).toBe(0);
    expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.width);
    for (const box of bounds.boxes) {
      expect(box.left, `${box.name} clips the left viewport edge`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} clips the right viewport edge`).toBeLessThanOrEqual(bounds.width);
    }
  };
  await assertFitsViewport();
  await page.setViewportSize({ width: 320, height: 844 });
  await assertFitsViewport();
  await page.screenshot({ path: testInfo.outputPath("hero-mobile-320.png"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("hero-mobile.png"), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await selector.getByRole("button", { name: "Doori" }).click();
  await page.locator("#top").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("hero-desktop.png"), fullPage: false });
});
