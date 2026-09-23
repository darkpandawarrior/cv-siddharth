import { test, expect, waitForHydration } from "./lib/test.ts";
import sharp from "sharp";

/** A blank/solid canvas (context lost, nothing drawn) screenshots as a flat
 * colour; the studio sculpture's amber/titanium/mint palette against the
 * dark ground never does. Real luminance variance is the cheapest honest
 * proof that Blender geometry, not just a DOM node, is on screen. */
async function assertRendered(buffer: Buffer) {
  const { data, info } = await sharp(buffer).resize(64, 64, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = Array.from(data as Buffer);
  const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
  const variance = pixels.reduce((a, b) => a + (b - mean) ** 2, 0) / pixels.length;
  expect(info.width * info.height, "screenshot decoded").toBeGreaterThan(0);
  expect(Math.sqrt(variance), "screenshot reads as flat, nothing rendered").toBeGreaterThan(8);
}

test("the 3D world fills its viewport and the list remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/playground");
  await waitForHydration(page);
  const canvas = page.locator(".playground-world canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(700);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This site is a live demo" })).toBeVisible();
});

test("a missing sculpture keeps the product and navigation available", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/models/studio-orbit.glb", route => route.abort());
  await page.goto("/");
  await waitForHydration(page);
  await expect(page.locator(".hero-device-screen")).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore my work" })).toBeVisible();
  const selected = page.locator(".hero-studio-selector").getByRole("button", { name: "Gaddi" });
  await expect.poll(() => selected.evaluate(el => Object.keys(el).some(key => key.startsWith("__react")))).toBe(true);
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hero-device-screen")).toHaveAttribute("src", /gaddi/);
});

test("the project hero opens its screenshot viewer", async ({ page }) => {
  await page.goto("/project/doori");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Enlarge preview of Doori" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const chapters = page.getByRole("navigation", { name: "Explore this project" });
  for (const link of await chapters.getByRole("link").all()) {
    const href = await link.getAttribute("href");
    await expect(page.locator(href!)).toHaveCount(1);
  }
  await chapters.getByRole("link", { name: "Follow the connections" }).click();
  await expect(page.locator("#connections")).toBeInViewport();
  await expect(page.locator("#connections").getByRole("link", { name: /Gaddi/ })).toHaveAttribute("href", "/project/gaddi");
});

test("dragging the map background orbits its nodes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map");
  await waitForHydration(page);
  const canvas = page.locator("#map canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const label = page.locator("#map span").filter({ hasText: /^Doori$/ });
  await expect(label).toBeVisible();
  const before = await label.boundingBox();
  const bounds = await canvas.boundingBox();
  expect(before).not.toBeNull();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 25);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 180, bounds!.y + 25, { steps: 15 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await label.boundingBox())!.x - before!.x)).toBeGreaterThan(8);
});

test("loading the shared connection preserves the selected product", async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/assets/DeferredPlayRoom-*.js", async route => {
    await ready;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const selected = page.locator(".hero-studio-selector").getByRole("button", { name: "Gaddi" });
    await expect.poll(() => selected.evaluate(el => Object.keys(el).some(key => key.startsWith("__react")))).toBe(true);
    await selected.click();
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".hero-studio-open")).toHaveAttribute("href", "/project/gaddi");
    const originalButton = await selected.elementHandle();
    release();
    await page.waitForLoadState("networkidle");
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".hero-studio-open")).toHaveAttribute("href", "/project/gaddi");
    expect(await originalButton?.evaluate(node => node.isConnected)).toBe(true);
  } finally {
    release();
  }
});

test("the hero plinth renders at 1440 and the studio hex plinth is visible in the screenshot", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await waitForHydration(page);
  const canvas = page.locator(".hero-studio-object canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(200);
  // Let the sculpture's slow auto-rotate settle a frame before capturing.
  await page.waitForTimeout(300);
  const shot = await canvas.screenshot({ path: testInfo.outputPath("hero-plinth-1440.png") });
  await assertRendered(shot);
});

test("at 390 the hero falls back to the static device (no WebGL small-screen budget), and it still fits the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await waitForHydration(page);
  // Phone3D gates 3D behind a desktop-width check; below it TiltPhone (the
  // documented static fallback for studio-orbit.glb) renders instead, and no
  // WebGL canvas should be requested at all at this width.
  await expect(page.locator(".hero-device-screen")).toBeVisible();
  await expect(page.locator(".hero-studio-object canvas")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("hero-fallback-390.png"), fullPage: false });
});
