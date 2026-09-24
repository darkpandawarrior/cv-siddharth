import { expect, test } from "./lib/test.ts";
import { writing, writingGeneratedAt } from "../src/data/writing.ts";

/**
 * /loopdown must actually show every lesson the-loopdown registry has
 * published so far, and say when writing.ts was last regenerated.
 *
 * Derived from the live registry rather than a hand-typed slug list: a lesson
 * going live on dev.to and NOT appearing here is exactly the bug this lane
 * fixed upstream in gen-loopdown.mjs (engagementOf reading the registry's
 * dead `links` field instead of its real url_devto/etc. fields). A hardcoded
 * count would keep passing after that bug came back.
 */
const liveLessons = writing.lessons.filter((l) => l.links?.devto);

test("/loopdown lists every lesson currently live on dev.to", async ({ page }) => {
  await page.goto("/loopdown");
  for (const lesson of liveLessons) {
    await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
  }
});

test("/loopdown shows a writing.ts as-of chip dated within 7 days", async ({ page }) => {
  await page.goto("/loopdown");
  const chip = page.locator("[data-evidence-chip]").first();
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(`as of ${writingGeneratedAt}`);
  const ageDays = (Date.now() - new Date(`${writingGeneratedAt}T00:00:00Z`).getTime()) / 86_400_000;
  expect(ageDays, `writing.ts is ${ageDays.toFixed(1)} days old — regenerate it (npm run gen:loopdown)`).toBeLessThanOrEqual(7);
});
