import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
const KEY = "cv-siddharth:globe-saved-views";
const query = "lat=20.0000&lon=30.0000&alt=26.00&view=orbit&t=0&ly=hazards&base=VIIRS_SNPP_CorrectedReflectance_TrueColor";

async function setup(page: Page, raw?: string, failure?: "read" | "write") {
  await page.addInitScript(({ key, raw, failure }) => {
    localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    if (raw !== undefined) localStorage.setItem(key, raw);
    const storage = localStorage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      getItem: (k: string) => { if (k === key && failure === "read") throw new Error("blocked"); return storage.getItem(k); },
      setItem: (k: string, v: string) => { if (k === key && failure === "write") throw new Error("quota"); storage.setItem(k, v); },
      removeItem: (k: string) => storage.removeItem(k),
    } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { savedLink: string }).savedLink = text; } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  }, { key: KEY, raw, failure });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/") || !["localhost", "127.0.0.1"].includes(url.hostname)) return route.fulfill({ status: 503, body: "Unavailable fixture" });
    return route.continue();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/globe?${query}`);
  await waitForHydration(page);
}
async function open(page: Page, phone: boolean) {
  if (phone) await page.getByRole("button", { name: "Open the layers sheet" }).tap();
  const button = page.getByRole("button", { name: "Save this view", exact: true }).filter({ visible: true });
  if (phone) await button.tap(); else { await button.focus(); await page.keyboard.press("Enter"); }
  const panel = page.locator("dialog[open][data-saved-views]");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Name (optional)")).toBeFocused();
  expect(await panel.getByRole("button").evaluateAll(buttons => buttons.every(button => { const box = button.getBoundingClientRect(); return box.width >= 44 && box.height >= 44; }))).toBe(true);
  return panel;
}

for (const phone of [false, true]) {
  test.describe(phone ? "phone saved views" : "desktop saved views", () => {
    test.use({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: phone, isMobile: phone });
    test("save rename share restore delete with actual controls", async ({ page }) => {
      await setup(page);
      let panel = await open(page, phone);
      await expect(panel.getByText("No saved views yet.")).toBeVisible();
      await panel.locator("summary").focus();
      await page.keyboard.press("Space");
      await expect(panel.getByText("No saved views yet.")).toBeHidden();
      await page.keyboard.press("Space");
      await expect(panel.getByText("No saved views yet.")).toBeVisible();
      await panel.getByLabel("Name (optional)").fill("Pacific night");
      await panel.getByLabel("Name (optional)").press("Enter");
      await expect(panel.getByRole("heading", { name: "Pacific night" })).toBeVisible();
      await panel.getByRole("button", { name: "Rename", exact: true }).click();
      await panel.getByLabel("New name").fill("My ocean");
      await panel.getByLabel("New name").press("Enter");
      await expect(panel.getByRole("heading", { name: "My ocean" })).toBeVisible();
      await panel.getByRole("button", { name: "Share view", exact: true }).click();
      await expect(panel.getByRole("status")).toHaveText("Saved view link copied.");
      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY);
      expect(stored).toHaveLength(1);
      expect(Object.keys(stored[0]).sort()).toEqual(["id", "name", "query", "version"]);
      const link = await page.evaluate(() => (window as unknown as { savedLink: string }).savedLink);
      expect(new URL(link).search.slice(1)).toBe(stored[0].query);
      let requests = 0;
      page.on("request", request => { if (request.url().includes("earthquake.usgs.gov")) requests++; });
      const restore = panel.getByRole("button", { name: "Restore", exact: true });
      if (phone) await restore.tap(); else await restore.click();
      await waitForHydration(page);
      await expect.poll(() => requests, { timeout: 30000 }).toBeGreaterThan(0);
      panel = await open(page, phone);
      await expect(panel.getByRole("heading", { name: "My ocean" })).toBeVisible();
      await panel.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(panel.getByText("No saved views yet.")).toBeVisible();
      await panel.getByRole("button", { name: "Save view", exact: true }).click();
      await expect(panel.getByRole("heading", { name: "Untitled view" })).toBeVisible();
      await panel.getByRole("button", { name: "Delete", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    });
    test("past dates and invalid entries are explicit", async ({ page }) => {
      const past = new Date(Date.now() - 86400000).toISOString().slice(0, 16) + "Z";
      await setup(page, JSON.stringify([{ version: 1, id: "past", name: "Yesterday", query: query.replace("t=0", `at=${encodeURIComponent(past)}`) }, { version: 99 }]));
      const panel = await open(page, phone);
      await expect(panel.getByRole("status")).toHaveText("Invalid or outdated saved views were removed.");
      await expect(panel.getByText(/^Past ·/)).toBeVisible();
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, KEY)).toBe(1);
    });
    for (const failure of ["read", "write"] as const) test(`storage ${failure} failure is visible`, async ({ page }) => {
      await setup(page, undefined, failure);
      const panel = await open(page, phone);
      if (failure === "write") await panel.getByRole("button", { name: "Save view", exact: true }).click();
      await expect(panel.getByRole("status")).toContainText(failure === "read" ? "storage is unavailable" : "Could not save changes");
      await expect(panel.getByText("No saved views yet.")).toBeVisible();
    });
    test("twenty entries are kept and another save is refused", async ({ page }) => {
      await setup(page, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ version: 1, id: `v-${i}`, name: `View ${i}`, query }))));
      const panel = await open(page, phone);
      await panel.getByRole("button", { name: "Save view", exact: true }).click();
      await expect(panel.getByRole("status")).toContainText("20 saved views");
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).length, KEY)).toBe(20);
    });
  });
}
