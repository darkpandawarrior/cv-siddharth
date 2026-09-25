import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * The two corpus joins from REC-5 and REC-7 (I8a): the weeb genre scatter and
 * the fleet-by-era strip. Both carry a wording rule that is easy to regress
 * silently, so it is asserted here rather than trusted to a code review.
 */

test("/shipped fleet-era strip says 'last Play update', never 'shipped by'", async ({ page }) => {
  await page.goto("/shipped");
  await waitForHydration(page);
  const strip = page.locator("#fleet-era");
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("last Play update");

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("shipped by");
});

test("/weeb genre panel renders after scroll", async ({ page }) => {
  await page.goto("/weeb");
  await waitForHydration(page);
  const panel = page.locator("#weeb-genres");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await expect(panel.locator("svg circle").first()).toBeVisible();
});
