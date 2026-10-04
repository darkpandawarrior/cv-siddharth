import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { districtAnchors } from "../src/world/v2/valley.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";

const noWebGLTest = test.extend({
  browser: async ({ playwright }, run) => {
    const browser = await playwright.chromium.launch({ args: ["--disable-webgl"] });
    await run(browser);
    await browser.close();
  },
});

const LANE_DIR = process.env.P3_07_CAPTURE_DIR ?? "/tmp/agent-lanes/P3-07";
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const CLEAR = fixture("weather-2026-09-24.json");
const WET = fixture("weather-wet-2026-09-24.json");
const NOON = "2026-09-24T12:27:00+05:30";
const NIGHT = "2026-09-24T03:15:00+05:30";

async function prepare(page: Page, time = NOON, wet = false) {
  page.on("pageerror", (error) => console.error(`world-altitude page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`world-altitude console error: ${message.location().url} ${message.text().slice(0, 1200)}`);
  });
  await page.clock.setFixedTime(new Date(time));
  await page.addInitScript(() => {
    localStorage.setItem("playground:v2:onboarded", "1");
    localStorage.setItem("playground:onboarded", "1");
  });
  await page.route("**/api/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const payload = name === "weather" ? (wet ? WET : CLEAR)
      : name === "github-activity" ? fixture("activity.json")
      : name === "ops" ? fixture("ops.json")
      : name === "aircraft" ? fixture("aircraft.json")
      : name === "tle" ? fixture("tle.json")
      : name === "signals" ? fixture("live/signals.json")
      : { connected: false, isPlaying: false, recent: [], country: null };
    await route.fulfill({ json: payload });
  });
}

async function noWebGL(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(original, {
      apply(target, receiver, args) {
        return /webgl/i.test(String(args[0])) ? null : Reflect.apply(target, receiver, args);
      },
    });
  });
}

test("v2 is the default and v1 stays reachable", async ({ page }) => {
  await forceDeviceTier(page, "viewport");
  await prepare(page);
  await page.goto("/playground");
  await waitForHydration(page);
  await expect(page.locator(".playground-canvas [data-world='v2'] canvas")).toBeVisible();
  await expect(page.locator("[data-world='v1']")).toHaveCount(0);
  await page.goto("/playground?world=v1");
  await expect(page.locator("[data-world='v1'] .playground-world canvas")).toBeVisible();
});

test("unknown arrival values fall back without throwing", async ({ page }) => {
  await noWebGL(page);
  await prepare(page);
  await page.goto("/playground?at=unknown-landmark&world=unknown");
  const fallback = page.locator("[data-concept-fallback]");
  await expect(fallback).toBeVisible();
  await expect(fallback).not.toHaveAttribute("data-at");
  await expect(page.getByRole("region", { name: "Landmarks in this world" })).toContainText("doori");
});

test("the map focus reaches STREET and returns to the same node", async ({ page }) => {
  // Mooring uses the same Hodi code on both live world tiers.
  await forceDeviceTier(page, 2);
  await prepare(page);
  await page.goto("/map?focus=doori");
  await waitForHydration(page);
  await expect(page.locator("[data-focused='doori']")).toBeVisible();
  await page.locator("[data-altitude-stop='street']").click();
  await expect(page).toHaveURL(/\/playground\?at=doori$/);
  const hull = page.locator("canvas[data-hodi-at='doori']");
  // Hodi writes this arrival signal from its first rendered frame.
  await hull.waitFor();
  await expect(hull).toBeVisible();
  await expect(hull).toHaveAttribute("data-hodi-moored", "true");
  const pose = async () => hull.evaluate((canvas) => ({
    x: Number((canvas as HTMLElement).dataset.hodiX),
    z: Number((canvas as HTMLElement).dataset.hodiZ),
  }));
  const initial = await pose();
  const doori = districtAnchors(["doori", "gaddi", "paymentslab-kmp", "candidai", "kmp-app-template", "portfolio", "stutter", "sinc-p"])[0];
  expect(Math.hypot(initial.x - doori.x, initial.z - doori.z)).toBeLessThan(95);
  await page.waitForTimeout(6500);
  expect(await pose()).toEqual(initial);
  // Driving keys ignore a focused link left by the altitude navigation.
  await page.getByText("Sangam", { exact: true }).click();
  await page.keyboard.down("w");
  await expect(page.locator("canvas[data-hodi-moored='false']")).toBeVisible();
  await page.keyboard.up("w");
  await page.locator("[data-altitude-stop='orbit']").click();
  await expect(page).toHaveURL(/\/map\?focus=doori$/);
  await expect(page.locator("[data-focused='doori']")).toBeVisible();
  await page.locator("[data-altitude-stop='globe']").click();
  await expect(page).toHaveURL(/\/globe\?focus=pune$/);
  await expect(page.locator("canvas").first()).toBeVisible();
});

for (const width of [1440, 390]) {
  for (const route of ["map", "arrival", "globe"] as const) {
    test(`visual ${route} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await forceDeviceTier(page, "viewport");
      await prepare(page);
      await page.goto(route === "arrival" ? "/playground?at=doori" : "/map?focus=doori");
      await waitForHydration(page);
      if (route === "arrival") {
        await expect(page.locator("canvas[data-hodi-at='doori']")).toHaveAttribute("data-hodi-moored", "true");
      } else {
        await expect(page.locator("[data-focused='doori']")).toBeVisible();
        if (route === "globe") {
          await page.locator("[data-altitude-stop='globe']").click();
          await expect(page).toHaveURL(/\/globe\?focus=pune$/);
          await expect(page.locator("canvas").first()).toBeVisible();
        }
      }
      const name = route === "map" ? "map-focus-doori" : route === "arrival" ? "playground-at-doori" : "globe";
      await page.screenshot({ path: `${LANE_DIR}/${name}-${width}.png`, fullPage: true });
    });
  }
  for (const state of [
    { name: "day", time: NOON, frame: "01-golden-spawn", wet: false },
    { name: "night", time: NIGHT, frame: "02-night-survey", wet: false },
    { name: "wet", time: NOON, frame: "03-monsoon", wet: true },
  ]) {
    noWebGLTest(`no WebGL ${state.name} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await prepare(page, state.time, state.wet);
      const hydration: string[] = [];
      page.on("console", (message) => { if (/hydrat/i.test(message.text())) hydration.push(message.text()); });
      page.on("pageerror", (error) => { if (/hydrat/i.test(error.message)) hydration.push(error.message); });
      await page.goto("/playground");
      await waitForHydration(page);
      const image = page.locator("[data-concept-fallback] img");
      await expect(image).toHaveAttribute("src", new RegExp(`${state.frame}\\.webp$`));
      await expect(page.locator("figcaption")).toContainText("Concept painting");
      await expect(page.locator(".playground-canvas canvas")).toHaveCount(0);
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator("[data-ledger-row='weather']")).toContainText("°C");
      await page.screenshot({ path: `${LANE_DIR}/fallback-${state.name}-${width}.png`, fullPage: true });
      expect(hydration).toEqual([]);
    });
  }
  test(`reduced motion waits for entry at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await forceDeviceTier(page, "viewport");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await prepare(page);
    await page.goto("/playground");
    await waitForHydration(page);
    await expect(page.locator("[data-concept-fallback]")).toBeVisible();
    await expect(page.locator(".playground-canvas canvas")).toHaveCount(0);
    await expect(page.locator("[data-ledger-row='weather']")).toContainText("°C");
    await page.screenshot({ path: `${LANE_DIR}/reduced-motion-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Enter the valley" }).click();
    await expect(page.locator(".playground-canvas [data-world='v2'] canvas")).toBeVisible();
  });
  for (const state of [{ name: "day", time: NOON }, { name: "night", time: NIGHT }]) {
    test(`preview ${state.name} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await forceDeviceTier(page, "viewport");
      await prepare(page, state.time);
      await page.goto("/playground");
      await waitForHydration(page);
      await expect(page.locator(".playground-canvas [data-world='v2'] canvas")).toBeVisible();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${LANE_DIR}/preview-${state.name}-${width}.png`, fullPage: true });
    });
  }
}

for (const gate of ["tier3", "saveData"] as const) {
  test(`${gate} keeps the concept fallback`, async ({ page }) => {
    await forceDeviceTier(page, gate === "tier3" ? 3 : "viewport");
    if (gate === "saveData") await page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }));
    await prepare(page);
    await page.goto("/playground");
    await expect(page.locator("[data-concept-fallback]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter the valley" })).toHaveCount(0);
  });
}
