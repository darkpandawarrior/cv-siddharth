import { test, expect } from "@playwright/test";

// Phase A-part-1: footer + command palette are router-native now (no more
// `#hash` bounce through the legacy HashCompat shim). These checks pin the
// two user-visible contracts: a route link lands on the real path with no
// intermediate `/#...` URL, and a section link stays on "/" and scrolls.
test.describe("primary nav surfaces (footer, command palette)", () => {
  test("footer route link navigates straight to /resume, no hash bounce", async ({ page }) => {
    const seenUrls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) seenUrls.push(frame.url());
    });

    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "Résumé" }).click();
    await expect(page).toHaveURL(/\/resume$/);
    await expect(page.locator("body")).toContainText(/Experience/i);

    expect(seenUrls.some((u) => u.includes("/#"))).toBe(false);
  });

  test("footer section link scrolls to #skills on the home page", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => window.scrollY);

    await page.locator("footer").getByRole("button", { name: "Skills" }).click();
    await expect(page.locator("#skills")).toBeInViewport();

    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
    expect(page.url()).not.toContain("/#");
  });

  test("command palette route command navigates to /loopdown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open command palette (Cmd+K)" }).click();
    await page.getByRole("combobox", { name: "Command palette search" }).fill("Loopdown");
    await page.getByRole("option", { name: /The Loopdown/i }).click();

    await expect(page).toHaveURL(/\/loopdown$/);
    await expect(page.locator("dialog, [role=dialog]")).toHaveCount(0);
  });
});
