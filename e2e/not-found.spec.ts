import { test, expect } from "@playwright/test";

// Task C1: the $.tsx splat catch-all renders a designed, SSR'd 404 instead of
// the router's default blank/white-screen not-found state.
//
// Task 9A rebuilt the page: it's a real page now (nav + footer + canonical
// type scale), not the standalone ErrorPanel modal. "Return to base" is gone
// — the home control is a plain "Home" link, alongside three other real
// outbound routes (The work, The writing, Résumé) instead of two.
test.describe("404 — catch-all splat route", () => {
  test("a nonexistent route renders the on-brand 404 with a working home link", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.locator("body")).toContainText(/404/i);

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("body")).toContainText(/Senior Android Engineer/i);
  });

  test("the 404's other outbound links actually resolve", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await page.getByRole("link", { name: "The writing" }).click();
    await expect(page).toHaveURL(/\/ink$/);
    await expect(page.locator("body")).toContainText(/The Ink/i);
  });
});
