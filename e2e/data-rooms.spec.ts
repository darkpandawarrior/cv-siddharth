import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * The data rooms carry a visible, honest as-of chip: chess, weeb, shipped,
 * lanes and time-machine each date the claim they render rather than let a
 * visitor guess how current the numbers are.
 *
 * /chess additionally has to be dated genuinely close to the run date — the
 * chess corpus is meant to be regenerated weekly by refresh-media.yml, so a
 * chip more than 7 days stale is the freshness pipeline actually failing,
 * not a display bug.
 */

const HEADER_ROOMS = ["/weeb", "/shipped", "/lanes", "/time-machine"];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

for (const path of HEADER_ROOMS) {
  for (const vp of VIEWPORTS) {
    test(`${path} renders exactly one evidence chip in its header at ${vp.width}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto(path);
      await waitForHydration(page);
      const headerChips = page.locator("header [data-evidence-chip]");
      await expect(headerChips).toHaveCount(1);
      // A chip that renders is a chip a visitor can follow to /ops — dead
      // weight in the header would be worse than no chip at all.
      await expect(headerChips).toHaveAttribute("href", /^\/ops#/);
    });
  }
}

test("/chess shows an as-of chip dated within 7 days of the run date", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/chess");
  await waitForHydration(page);
  const chip = page.locator("header [data-evidence-chip]");
  await expect(chip).toHaveCount(1);
  const text = await chip.innerText();
  const match = text.match(/as of (\d{4}-\d{2}-\d{2})/);
  expect(match, `chip text "${text}" carries no "as of YYYY-MM-DD" date`).not.toBeNull();
  const stampedDays = (Date.now() - new Date(`${match![1]}T00:00:00Z`).getTime()) / 86_400_000;
  expect(stampedDays, `chess.ts is ${stampedDays.toFixed(1)} days old, past the 7-day freshness bar`).toBeLessThanOrEqual(7);
});
