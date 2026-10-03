import { forceDeviceTier } from "./lib/deviceTier.ts";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";

// Exercise imagery mesh pixels on its graphics branch.
test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// Solid contrasting fixtures reveal mesh holes independently of the real
// mosaic's dark ocean. The PNG swath deliberately carries alpha-zero data.
for (const scenario of ["solid coverage", "swath fallback"]) {
  test(`phone day hemisphere has no empty-tile pixels: ${scenario}`, async ({ page }, testInfo) => {
    const solid = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#20b080" } }).png().toBuffer();
    const empty = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const black = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#000000" } }).png().toBuffer();
    const base = await sharp({ create: { width: 512, height: 256, channels: 4, background: "#20b080" } }).png().toBuffer();
    const gapPixels = Buffer.alloc(512 * 512 * 4);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      gapPixels[(y * 512 + x) * 4 + 3] = x < 256 && y < 256 ? 0 : 255;
    }
    const swath = await sharp(gapPixels, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    let tiles = 0, swaths = 0;
    await page.route("**/api/**", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      if (["weather", "tle", "aircraft", "whereami"].includes(name ?? "")) {
        const file = name === "weather" ? "weather-2026-09-24" : name === "whereami" ? "whereami-IN" : name;
        return route.fulfill({ contentType: "application/json", body: readFileSync(new URL(`./fixtures/${file}.json`, import.meta.url)) });
      }
      return route.abort();
    });
    await page.route("https://gibs.earthdata.nasa.gov/**", route => {
      const url = route.request().url();
      if (url.includes("/wmts/")) {
        tiles++;
        if (scenario === "swath fallback") {
          swaths++;
          return route.fulfill({ contentType: "image/png", body: swath });
        }
        return route.fulfill({ contentType: "image/png", body: solid });
      }
      if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: empty });
      if (url.includes("ASTER_GDEM")) return route.abort();
      return route.fulfill({ contentType: "image/png", body: scenario === "solid coverage" ? black : base });
    });
    await page.clock.setFixedTime(new Date("2026-10-01T07:00:00Z"));
    await page.goto("/globe");
    await waitForHydration(page);
    await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-status", "live", { timeout: 30_000 });
    await expect.poll(() => tiles).toBeGreaterThan(0);
    if (scenario === "swath fallback") await expect.poll(() => swaths).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__GLOBE_TEST_GET_IMAGERY_STATUS__?.("VIIRS_SNPP_CorrectedReflectance_TrueColor"))).toMatchObject({ state: "live" });
    const canvas = page.locator("[data-globe-root] canvas").first();
    await expect(canvas).toHaveAttribute("data-camera-flying", "false");
    await page.screenshot({ path: testInfo.outputPath("phone-swath.png") });
    const shot = await canvas.screenshot();
    const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // The lit interior lies to the right of the terminator in the opening
    // Pune view. Stay inside the limb and below the overlapping HUD.
    const samples: number[][] = [];
    for (let y = 0.58; y <= 0.72; y += 0.02) {
      for (let x = 0.58; x <= 0.75; x += 0.02) {
        const offset = (Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * info.channels;
        samples.push([...data.subarray(offset, offset + 3)]);
      }
    }
    expect(samples.length).toBeGreaterThan(40);
    for (const pixel of samples) expect(Math.max(...pixel), `empty-tile colour at sampled pixel ${pixel}`).toBeGreaterThan(45);
  });
}
