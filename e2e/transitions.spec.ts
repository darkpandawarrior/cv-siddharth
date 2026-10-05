import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";
import { skipSoftwareRenderer } from "./lib/gpu.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const responses: Record<string, unknown> = {
  weather: fixture("weather-2026-09-24.json"), "github-activity": fixture("activity.json"),
  ops: fixture("ops.json"), aircraft: fixture("aircraft.json"), tle: fixture("tle.json"),
  signals: fixture("live/signals-nulls.json"),
  spotify: { connected: false, isPlaying: false, recent: [] }, whereami: { country: null },
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.route("**/api/**", (route) => route.fulfill({
    json: responses[new URL(route.request().url()).pathname.slice(5)] ?? { connected: false },
  }));
  await page.addInitScript(() => {
    localStorage.setItem("playground:v2:onboarded", "1");
    const calls: string[][] = [];
    Object.defineProperty(window, "__altitudeTransitions", { value: calls });
    const original = document.startViewTransition;
    if (!original) return;
    Object.defineProperty(document, "startViewTransition", { configurable: true,
      value: new Proxy(original, {
        apply(target, receiver, args) {
          calls.push(typeof args[0] === "object" ? args[0].types ?? [] : []);
          return Reflect.apply(target, receiver, args);
        },
      }),
    });
  });
});

async function transitionTypes(page: Page) {
  return page.evaluate(() => (window as Window & { __altitudeTransitions: string[][] }).__altitudeTransitions);
}

// These checks exercise the DOM rail under the normal headless software tier.
test("ORBIT to GLOBE requests altitude-up and the reverse altitude-down", async ({ page }) => {
  await page.goto("/map");
  await waitForHydration(page);
  await page.locator('[data-altitude-stop="globe"]').click();
  await expect(page).toHaveURL(/\/globe/);
  await expect.poll(() => transitionTypes(page)).toContainEqual(["altitude-up"]);
  await page.locator('[data-altitude-stop="orbit"]').click();
  await expect(page).toHaveURL(/\/map/);
  await expect.poll(() => transitionTypes(page)).toContainEqual(["altitude-down"]);
});

test("reduced motion cuts both altitude directions without View Transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map");
  await waitForHydration(page);
  await page.locator('[data-altitude-stop="globe"]').click();
  await expect(page).toHaveURL(/\/globe/);
  await page.locator('[data-altitude-stop="orbit"]').click();
  await expect(page).toHaveURL(/\/map/);
  expect(await transitionTypes(page)).toEqual([]);
});

test("the opacity fallback settles without View Transitions", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(document, "startViewTransition", { value: undefined }));
  await page.goto("/map");
  await waitForHydration(page);
  await page.locator('[data-altitude-stop="globe"]').click();
  await expect(page).toHaveURL(/\/globe/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).opacity)).toBe("1");
});

test("project titles and magnetic CTAs respond to live reduced motion", async ({ page }) => {
  await page.goto("/project/doori");
  await waitForHydration(page);
  await expect(page.locator("h1 .motion-segment").first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("h1 .motion-segment")).toHaveCount(0);
  await page.goto("/hire");
  await waitForHydration(page);
  const cta = page.locator('a[href^="mailto:"]').first();
  await cta.hover({ position: { x: 12, y: 12 } });
  expect(await cta.evaluate((element) => (element as HTMLElement).style.translate)).toBe("");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.mouse.move(0, 0);
  await cta.hover({ position: { x: 12, y: 12 } });
  await expect.poll(() => cta.evaluate((element) => (element as HTMLElement).style.translate)).not.toBe("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => cta.evaluate((element) => (element as HTMLElement).style.translate)).toBe("");
});

test("coarse pointers leave the hire CTA stationary", async ({ page }) => {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = match(query);
      if (query === "(pointer: fine)") Object.defineProperty(media, "matches", { value: false });
      return media;
    };
  });
  await page.goto("/hire");
  await waitForHydration(page);
  const cta = page.locator('a[href^="mailto:"]').first();
  await cta.hover({ position: { x: 12, y: 12 } });
  expect(await cta.evaluate((element) => (element as HTMLElement).style.translate)).toBe("");
});

test("landmark Enter to a project has no black screencast frame", { tag: "@gpu" }, async ({ page }, testInfo) => {
  await skipSoftwareRenderer(page);
  await forceDeviceTier(page, "viewport");
  await page.goto("/playground?at=doori");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Enter the valley", exact: true }).click();
  const canvas = page.locator('[data-world="v2"] canvas');
  await expect(canvas).toHaveAttribute("data-terrain-ready", "true");
  await page.getByRole("list", { name: "Landmarks in this world" }).getByRole("button", { name: "Doori", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  const panel = page.getByRole("dialog", { name: "Doori landmark details" });
  await expect(panel).toBeVisible();
  const shaderErrors: string[] = [];
  page.on("console", (message) => { if (/Shader Error|WebGL.*INVALID/.test(message.text())) shaderErrors.push(message.text()); });
  await canvas.evaluate((element) => {
    const states: string[] = [];
    Object.defineProperty(window, "__dissolveStates", { value: states });
    new MutationObserver(() => { states.push((element as HTMLElement).dataset.dissolve ?? ""); })
      .observe(element, { attributes: true, attributeFilter: ["data-dissolve"] });
  });
  const cdp = await page.context().newCDPSession(page);
  const frames: Promise<number>[] = [];
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    frames.push(sharp(Buffer.from(data, "base64")).removeAlpha().grayscale().raw().toBuffer()
      .then((pixels) => pixels.reduce((sum, value) => sum + value, 0) / pixels.length));
  });
  try {
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
    await expect.poll(() => frames.length).toBeGreaterThan(0);
    const beforeEnter = frames.length;
    await panel.getByRole("link", { name: "Enter", exact: true }).click();
    await expect(page).toHaveURL(/\/project\/doori/);
    await expect(page.locator("h1")).toContainText("Doori");
    await expect.poll(() => frames.length).toBeGreaterThan(beforeEnter + 1);
  } finally {
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
  }
  const luma = await Promise.all(frames);
  await testInfo.attach("transition-frame-luma", { body: JSON.stringify(luma), contentType: "application/json" });
  expect(luma.length).toBeGreaterThan(2);
  expect(Math.min(...luma)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as Window & { __dissolveStates: string[] }).__dissolveStates)).toContain("complete");
  expect(shaderErrors).toEqual([]);
  expect(await transitionTypes(page)).toContainEqual(["altitude-down"]);
});
