import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { fleetStats } from "../src/data/store.ts";

async function openGlobe(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.route(/^https:\/\//, route => route.abort());
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: {} }));
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.getByRole("combobox", { name: "Search places or ask the globe" })).toBeVisible({ timeout: 30_000 });
}

test("selection actions precede the layers and are within ten page Tabs", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  const inspector = page.locator("[data-globe-inspector]");
  await expect(inspector).toBeVisible();
  expect(await inspector.evaluate(el => !!(el.compareDocumentPosition(document.querySelector("[data-globe-layer-panel]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  let tabs = 0;
  for (; tabs < 10; tabs++) {
    await page.keyboard.press("Tab");
    if (await inspector.evaluate(el => el.contains(document.activeElement))) break;
  }
  expect(tabs + 1).toBeLessThanOrEqual(10);
  expect(await inspector.evaluate(el => el.contains(document.activeElement))).toBe(true);
});

for (const width of [1440, 390]) {
  test(`T opens and focuses the tour at ${width}px`, async ({ page }) => {
    await openGlobe(page, width, width === 1440 ? 900 : 844);
    await page.locator("[data-globe-root]").focus();
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: "Guided tour" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await expect(page.locator("[data-story-entry-compact], [data-film-entry-compact]")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await expect(dialog).toContainText(`${fleetStats.installFloor.toLocaleString("en-IN")} installs`);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

test("phone search is readable and clears the sheet edge", async ({ page }) => {
  await openGlobe(page, 390, 844);
  const input = page.getByRole("combobox", { name: "Search places or ask the globe" });
  await expect(input).toHaveAttribute("placeholder", "Search or ask");
  expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(200);
  await expect(page.getByRole("button", { name: "Surprise me", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open the layers sheet" }).click();
  await expect(page.locator("[data-globe-layer-sheet]")).toBeVisible();
  await expect(page.locator("[data-explore-bar]")).toBeHidden();
  await page.getByRole("button", { name: "Close the layers sheet" }).click();
  await expect(input).toBeVisible();
});

test("tablet fact labels wrap inside their scrollable panel", async ({ page }) => {
  await openGlobe(page, 1024, 768);
  const labels = page.locator("[data-globe-panel] ul > li > span");
  expect(await labels.count()).toBeGreaterThan(0);
  for (const label of await labels.all()) {
    expect(await label.evaluate(el => {
      const rect = el.getBoundingClientRect(), parent = el.closest("[data-globe-panel]")!.getBoundingClientRect();
      return rect.left >= parent.left - 1 && rect.right <= parent.right + 1 && el.scrollWidth <= el.clientWidth + 1;
    })).toBe(true);
  }
});
