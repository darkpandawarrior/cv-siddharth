import { expect, test } from "@playwright/test";
import { compareSets } from "../src/data/compareSets.ts";

/**
 * A project page's two "things to look at" — the compare viewer and the gallery — are both
 * data-driven and both fail silently. compareSets.ts is generated from disk, so a set can vanish
 * (or never appear) without a single error; the gallery falls back to an auto-generated list, so an
 * empty one just renders nothing. Assert on the rendered page, not on the data.
 */
for (const slug of Object.keys(compareSets)) {
  test(`${slug}: the compare viewer renders, above the gallery`, async ({ page }) => {
    await page.goto(`/project/${slug}`);
    const compare = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Same screen,/ }) });
    await expect(compare).toBeVisible();
    // Scroll to it: the screenshots are loading="lazy", so they never decode while the section
    // sits thousands of px below the viewport and naturalWidth stays 0 forever.
    await compare.scrollIntoViewIfNeeded();
    // Non-empty: a real, decoded image, not an empty frame. Polled — these are loading="lazy",
    // so naturalWidth is 0 for a beat after the element becomes visible.
    const shot = compare.locator("img").first();
    await expect(shot).toBeVisible();
    await expect
      .poll(() => shot.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const gallery = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Screens \(/ }) });
    await expect(gallery).toBeVisible();
    const tops = await Promise.all(
      [compare, gallery].map((l) => l.evaluate((e: HTMLElement) => e.offsetTop)),
    );
    expect(tops[0], "compare belongs above the gallery").toBeLessThan(tops[1]);
  });
}

/**
 * THE BUG: the live-embed reveal probe looked up `#ComposeTarget`, which the Compose Multiplatform
 * 1.12 build under /portfolio-app does not have — it renders into a plain div and has no <canvas>
 * at all. So the probe timed out, gave up, and the "live" frame stayed a black box forever. This
 * asserts the iframe actually reveals (opacity 1), which is the only observable difference.
 */
test("the portfolio's live CMP/Wasm embed reveals over its screenshot floor", async ({ page }) => {
  test.slow(); // first load pulls ~12 MB of Wasm and compiles it
  await page.goto("/project/portfolio");
  // The iframe is lazy-mounted on first intersection, so it does not exist until the device wall
  // is scrolled to — waiting on the iframe itself would wait forever.
  await page.getByRole("heading", { name: "One codebase, every surface" }).scrollIntoViewIfNeeded();
  const frame = page.locator('iframe[title="Live web build"]');
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await expect(frame).toHaveCSS("opacity", "1", { timeout: 90_000 });
});
