import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

const day = readFileSync(new URL("./fixtures/gibs/gibs-day.jpg", import.meta.url));
const tle = JSON.parse(readFileSync(new URL("./fixtures/tle.json", import.meta.url), "utf8"));

async function openReceipt(page: Page, failed = false) {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00Z"));
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  // One allowlist: every external HTTP host is mocked/denied, including
  // imagery, hazards, telemetry and optional media. No live feeds in QA.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      if (url.pathname === "/api/tle") return route.fulfill({ json: tle });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { connected: false } });
      return route.continue();
    }
    if (!failed && url.hostname === "gibs.earthdata.nasa.gov" && url.pathname.includes("/wms/") && url.searchParams.get("LAYERS") === "MODIS_Terra_CorrectedReflectance_TrueColor") {
      await ready;
      return route.fulfill({ contentType: "image/jpeg", body: day, headers: { "access-control-allow-origin": "*" } });
    }
    return route.abort();
  });
  await page.routeWebSocket("**/*", (socket) => socket.close());
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-scene-receipt] summary")).toBeVisible({ timeout: 30_000 });
  return release;
}

async function layers(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Open the layers sheet", exact: true }).tap();
  return page.locator(mobile ? "[data-globe-layer-sheet]" : "[data-globe-layer-panel]");
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "phone receipt" : "desktop receipt", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: mobile, isMobile: mobile });

    test("loading, fallback, controls and simulation stay honest", async ({ page }) => {
      const release = await openReceipt(page);
      const receipt = page.locator("[data-scene-receipt]");
      const summary = receipt.locator("summary");
      await expect(receipt).not.toHaveAttribute("open");
      const height = await summary.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
      expect(height).toBeLessThan(50);
      // Real keyboard disclosure, then pointer/touch close and reopen.
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(receipt).toHaveAttribute("open", "");
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("No imagery date confirmed");
      release();
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("NASA GIBS MODIS Terra true colour, 2026-09-29", { timeout: 30_000 });
      await expect(receipt.locator("[data-scene-receipt-body]")).toBeVisible();
      await expect(summary).toContainText("MODIS Terra · 2026-09-29");
      await expect(receipt.locator("[data-receipt-date]")).toHaveCSS("white-space", "nowrap");
      await expect(receipt).toContainText("Snapshot imagery, not live");
      await expect(receipt).toContainText("Observation age: 1 UTC calendar day");
      await expect(page.locator("[data-scene-summary]")).toContainText("MODIS Terra true colour, 2026-09-29");
      const wind = receipt.locator('[data-receipt-layer="wind"]');
      await expect(wind).toHaveAttribute("data-available", "false");
      await expect(wind).toContainText("Open-Meteo wind feed unreachable");
      await expect(receipt.locator('[data-receipt-layer="satellites"]')).toContainText("Modelled");
      if (mobile) await summary.tap(); else await summary.click();
      await expect(receipt).not.toHaveAttribute("open");
      if (mobile) await summary.tap(); else await summary.click();
      await expect(receipt).toHaveAttribute("open", "");

      const panel = await layers(page, mobile);
      const toggle = panel.getByRole("button", { name: "Wind", exact: true });
      if (mobile) await toggle.tap(); else await toggle.click();
      await expect(wind).toHaveCount(0);
      if (mobile) await toggle.tap(); else await toggle.click();
      await expect(wind).toHaveCount(1);
      await panel.locator("summary").filter({ hasText: "Imagery" }).click();
      await panel.getByRole("radio", { name: /^Blue Marble/ }).click();
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("MODIS Terra true colour, 2026-09-29");
      await panel.getByRole("button", { name: "Soil moisture", exact: true }).click();
      const soil = receipt.locator('[data-receipt-layer="SMAP_L4_Analyzed_Surface_Soil_Moisture"]');
      await expect(soil).toContainText("NASA GIBS / SMAP L4");
      await expect(soil).toContainText("Modelled");
      await expect(soil).toContainText("Observation age not reported");
      await expect(soil).toHaveAttribute("data-available", "false");
      await panel.getByRole("button", { name: "GOES-East infrared", exact: true }).click();
      if (mobile) await panel.getByRole("button", { name: "Close the layers sheet" }).tap();
      const goes = receipt.locator('[data-receipt-layer="GOES-East_ABI_Band13_Clean_Infrared"]');
      await expect(goes).toContainText("feed unavailable", { timeout: 30_000 });
      await expect(goes).toHaveAttribute("data-available", "false");
      await page.locator("[data-globe-root]").focus();
      await page.keyboard.press("[");
      await expect(receipt.locator('[data-receipt-layer="aircraft"]')).toContainText("Hidden during simulated time");
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("2026-09-29");
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(receipt).not.toHaveAttribute("open");
    });

    test("total imagery failure names the dots fallback", async ({ page }) => {
      await openReceipt(page, true);
      const receipt = page.locator("[data-scene-receipt]");
      if (mobile) await receipt.locator("summary").tap(); else await receipt.locator("summary").click();
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("dots fallback", { timeout: 30_000 });
      await expect(receipt).toContainText("NASA GIBS unreachable on every fallback rung");
      await expect(receipt.locator("[data-receipt-imagery]")).toContainText("No imagery date confirmed");
      await expect(receipt.locator("[data-receipt-imagery]")).not.toContainText("2026-09-29");
    });
  });
}
