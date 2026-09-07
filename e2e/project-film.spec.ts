import { expect, test } from "./lib/test.ts";

/**
 * The showcase film must belong to the project you are looking at.
 *
 * THE BUG: navigating between two project pages left the PREVIOUS project's
 * film on screen and playing. The source URL lives on a <source> child, and a
 * media element only reads its <source> children when it loads — changing the
 * attribute afterwards updates the DOM and nothing else. React had no reason to
 * replace the <video> either (same component, same position), so the same DOM
 * node survived the route change with the old media still in it.
 *
 * It only reproduces under CLIENT-SIDE navigation. A full page load remounts
 * everything and looks fine, which is why this test clicks a link rather than
 * calling goto() twice — the first version of this check passed against the
 * broken build.
 */
const FILMS = ["doori", "gaddi", "paymentslab-kmp"];

async function currentFilm(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const v = document.querySelector("video");
    return v?.currentSrc ?? "";
  });
}

test("the film follows the project across an in-app navigation", async ({ page }) => {
  await page.goto(`/project/${FILMS[0]}`);
  await page.waitForSelector("video");
  await expect.poll(() => currentFilm(page)).toContain(`/projects/${FILMS[0]}/`);

  // Any in-app link to a different project — whichever the page offers.
  const link = page.locator('a[href*="/project/"]').filter({ hasNotText: FILMS[0] }).first();
  const href = await link.getAttribute("href");
  const slug = href?.split("/project/")[1] ?? "";
  test.skip(!slug, "no in-app link to another project on this page");

  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/project/${slug}$`));

  // The assertion that was failing: the element must be showing the NEW film,
  // not merely have the new URL.
  await expect.poll(() => currentFilm(page), { timeout: 10_000 }).toContain(`/projects/${slug}/`);
});
