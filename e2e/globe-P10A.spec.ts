import { test, expect, waitForHydration } from "./lib/test.ts";
test("ocean buoy toggle is accessible and failed sources stay honest", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.route("**/api/buoys", (route) => route.fulfill({ status: 502, json: { error: "NOAA NDBC unreachable" } }));
  await page.route("**/api/volcanoes", (route) => route.fulfill({ status: 502, json: { error: "Smithsonian weekly report unreachable" } }));
  await page.route("**/api/sun", (route) => route.fulfill({ status: 502, json: { error: "Solar image unreachable" } }));
  await page.goto("/globe"); await waitForHydration(page);
  const toggle = page.getByRole("button", { name: "Ocean buoys", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("NOAA NDBC unreachable", { exact: true })).toBeVisible();
});
test("buoy fixture observations are labelled as snapshots with source", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.route("**/api/buoys", (route) => route.fulfill({ json: { buoys: [{ id: "41001", lat: 34.7, lon: -72.7, at: Date.parse("2026-09-29T22:00:00Z"), wave: 2.3, period: 8, wind: 4, direction: 90, water: 25 }] } }));
  await page.goto("/globe"); await waitForHydration(page);
  await page.getByRole("button", { name: "Ocean buoys", exact: true }).click();
  await expect(page.getByText("1 sampled stations, NOAA NDBC, observation times in inspector", { exact: true })).toBeVisible();
});
