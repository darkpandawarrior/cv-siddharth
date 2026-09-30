import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page, TestInfo } from "@playwright/test";

const day = readFileSync(new URL("./fixtures/gibs/gibs-day.jpg", import.meta.url));
const tle = JSON.parse(readFileSync(new URL("./fixtures/tle.json", import.meta.url), "utf8"));
const weather = JSON.parse(readFileSync(new URL("./fixtures/weather-2026-09-24.json", import.meta.url), "utf8"));

async function capture(page: Page, info: TestInfo, state: string) {
  const path = info.outputPath(`${state}.png`);
  if (page.viewportSize()!.width < 640 && await page.locator("[data-scene-receipt][open]").count()) {
    await page.locator("[data-scene-receipt-body]").scrollIntoViewIfNeeded();
  } else if (page.viewportSize()!.width >= 640 && await page.locator("[data-scene-receipt][open]").count()) {
    await expect(page.locator("[data-scene-receipt-body]")).toBeVisible();
  }
  await page.screenshot({ path });
  await info.attach(state, { path, contentType: "image/png" });
}

async function openReceipt(page: Page, failed = false, reducedMotion: "reduce" | "no-preference" = "reduce") {
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.emulateMedia({ reducedMotion });
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00Z"));
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  // One allowlist: every external HTTP host is mocked/denied, including
  // imagery, hazards, telemetry and optional media. No live feeds in QA.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      if (url.pathname === "/api/tle") return route.fulfill({ json: tle });
      if (reducedMotion === "no-preference" && url.pathname === "/api/weather") return route.fulfill({ json: weather });
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

    test("loading, fallback, controls and simulation stay honest", async ({ page }, info) => {
      const release = await openReceipt(page);
      const receipt = page.locator("[data-scene-receipt]");
      const summary = receipt.locator("summary");
      await expect(receipt).not.toHaveAttribute("open");
      const height = await summary.evaluate((el) => el.getBoundingClientRect().height);
      expect(height).toBeGreaterThanOrEqual(44);
      expect(height).toBeLessThan(50);
      await capture(page, info, "loading-collapsed");
      // Real keyboard disclosure, then pointer/touch close and reopen.
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(receipt).toHaveAttribute("open", "");
      await expect(page.locator("[data-receipt-imagery]")).toContainText("No imagery date confirmed");
      await capture(page, info, "loading-expanded");
      release();
      await expect(page.locator("[data-receipt-imagery]")).toContainText("NASA GIBS MODIS Terra true colour, 2026-09-29", { timeout: 30_000 });
      await expect(page.locator("[data-scene-receipt-body]")).toBeVisible();
      await expect(summary).toContainText("MODIS Terra · 2026-09-29");
      await expect(page.locator("[data-receipt-date]")).toHaveCSS("white-space", "nowrap");
      await expect(page.locator("[data-scene-receipt-body]")).toContainText("Snapshot imagery, not live");
      await expect(page.locator("[data-scene-receipt-body]")).toContainText("Observation age: 1 UTC calendar day");
      await expect(page.locator("[data-scene-summary]")).toContainText("MODIS Terra true colour, 2026-09-29");
      const wind = page.locator('[data-receipt-layer="wind"]');
      await expect(wind).toHaveAttribute("data-available", "false");
      await expect(wind).toContainText("Open-Meteo wind feed unreachable");
      await expect(page.locator('[data-receipt-layer="satellites"]')).toContainText("Modelled");
      await capture(page, info, "loaded-expanded");
      if (!mobile) {
        const body = page.locator("[data-scene-receipt-body]");
        await expect(body).toHaveCSS("position", "fixed");
        // The first sentence must be painted, not merely mounted inside
        // a clipped scroller. Portal placement keeps it reachable.
        expect(await page.locator("[data-receipt-imagery]").evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(rect.x + 4, rect.y + 4));
        })).toBe(true);
        await summary.focus();
        await page.keyboard.press("Tab");
        await expect(body).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(summary).toBeFocused();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Escape");
        await expect(receipt).not.toHaveAttribute("open");
        await expect(summary).toBeFocused();
        await summary.click();
      }
      if (mobile) await summary.tap(); else await summary.click();
      await expect(receipt).not.toHaveAttribute("open");
      await capture(page, info, "loaded-collapsed");
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
      await expect(page.locator("[data-receipt-imagery]")).toContainText("MODIS Terra true colour, 2026-09-29");
      await panel.getByRole("button", { name: "Soil moisture", exact: true }).click();
      const soil = page.locator('[data-receipt-layer="SMAP_L4_Analyzed_Surface_Soil_Moisture"]');
      await expect(soil).toContainText("NASA GIBS / SMAP L4");
      await expect(soil).toContainText("Modelled");
      await expect(soil).toContainText("Observation age not reported");
      await expect(soil).toHaveAttribute("data-available", "false");
      await panel.getByRole("button", { name: "GOES-East infrared", exact: true }).click();
      if (mobile) await panel.getByRole("button", { name: "Close the layers sheet" }).tap();
      const goes = page.locator('[data-receipt-layer="GOES-East_ABI_Band13_Clean_Infrared"]');
      await expect(goes).toContainText("feed unavailable", { timeout: 30_000 });
      await expect(goes).toHaveAttribute("data-available", "false");
      await page.locator("[data-globe-root]").focus();
      await page.keyboard.press("[");
      await expect(page.locator('[data-receipt-layer="aircraft"]')).toContainText("Hidden during simulated time");
      await expect(page.locator("[data-receipt-imagery]")).toContainText("2026-09-29");
      await capture(page, info, "simulated-unavailable-overlays");
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(receipt).not.toHaveAttribute("open");
    });

    test("total imagery failure names the dots fallback", async ({ page }, info) => {
      await openReceipt(page, true);
      const receipt = page.locator("[data-scene-receipt]");
      if (mobile) await receipt.locator("summary").tap(); else await receipt.locator("summary").click();
      await expect(page.locator("[data-receipt-imagery]")).toContainText("dots fallback", { timeout: 30_000 });
      await expect(page.locator("[data-scene-receipt-body]")).toContainText("NASA GIBS unreachable on every fallback rung");
      await expect(page.locator("[data-receipt-imagery]")).toContainText("No imagery date confirmed");
      await expect(page.locator("[data-receipt-imagery]")).not.toContainText("2026-09-29");
      await capture(page, info, "imagery-failed-expanded");
    });
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test.describe(`receipt composition ${viewport.width}x${viewport.height}`, () => {
    const mobile = viewport.width < 640;
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });
    test("Viewing and event strip remain usable together", async ({ page }, info) => {
      const release = await openReceipt(page, false, "no-preference");
      release();
      const receipt = page.locator("[data-scene-receipt]");
      await expect(receipt.locator("summary")).toContainText("MODIS Terra", { timeout: 30_000 });
      const measure = () => page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        return { offset: (document.querySelector("[data-globe-stage]") as HTMLElement).style.getPropertyValue("--globe-top-offset"),
          inspector: box("[data-globe-inspector]"), topbar: box("[data-globe-topbar]"), facts: box("[data-globe-panel]"), receipt: box("[data-scene-receipt]") };
      });
      const withReceipt = await measure();
      await receipt.evaluate((el) => { el.style.display = "none"; });
      await expect(receipt).toBeHidden();
      const withoutReceipt = await measure();
      await receipt.evaluate((el) => { el.style.removeProperty("display"); });
      const measurements = info.outputPath("layout-measurements.json");
      writeFileSync(measurements, JSON.stringify({ withReceipt, withoutReceipt }, null, 2));
      await info.attach("layout-measurements", { path: measurements, contentType: "application/json" });
      expect(withReceipt.offset).toBe(withoutReceipt.offset);
      expect(withReceipt.inspector).toEqual(withoutReceipt.inspector);
      if (!mobile) expect(withReceipt.facts).toEqual(withoutReceipt.facts);
      await capture(page, info, "strip-collapsed-viewing-collapsed");
      await receipt.locator("summary").focus();
      await page.keyboard.press("Enter");
      if (!mobile) {
        const expanded = await measure();
        expect(expanded.offset).toBe(withReceipt.offset);
        expect(expanded.facts).toEqual(withReceipt.facts);
        expect(expanded.inspector).toEqual(withReceipt.inspector);
      }
      await capture(page, info, "strip-collapsed-viewing-expanded");
      await page.keyboard.press("Space");
      if (mobile) await page.getByRole("button", { name: "Open the time sheet", exact: true }).tap();
      const strip = page.locator("[data-event-strip]:visible");
      await expect(strip).toBeVisible();
      if (mobile) await strip.locator("summary").tap(); else await strip.locator("summary").click();
      await expect(strip).toHaveAttribute("open", "");
      await expect(strip).toContainText("Counts are unknown.");
      await capture(page, info, "strip-expanded-viewing-collapsed");
      if (mobile) {
        await page.getByRole("button", { name: "Close the time sheet", exact: true }).tap();
        await expect(receipt.locator("summary")).toBeInViewport();
      } else {
        await receipt.locator("summary").click();
        await capture(page, info, "strip-expanded-viewing-expanded");
        await page.setViewportSize({ width: viewport.width - 1, height: viewport.height });
        await expect(receipt).not.toHaveAttribute("open");
        await expect(page.locator("[data-scene-receipt-body]")).toBeHidden();
      }
    });
  });
}
