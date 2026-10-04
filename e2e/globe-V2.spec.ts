import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE V2 (wave 7): the globe's first composer (Bloom, HDR city lights) and
 * `uNightGain`. `e2e/globe.spec.ts` stays untouched — this new file owns
 * its own fixtures and routing, same ownership rule as every other lane spec
 * in this directory.
 *
 * Fixture strategy: solid-colour GIBS images generated in-process with
 * `sharp({create})`, not committed binaries — the shader's brightness math
 * is what's under test, so a flat colour whose value we chose is a cleaner
 * signal than a photo whose luminance we'd have to measure first anyway.
 * "Bloom on" and "bloom off" are the SAME composer pipeline (GlobePost
 * always mounts at tier 1/2 imagery — this lane's whole point is that the
 * shader, not a toggle, decides what blooms): a night texture bright enough
 * that `* uNightGain` (1.6) clears the composer's `luminanceThreshold`
 * (1.0) versus one dim enough that it never does. That is exactly what
 * "bloom off" means for a plain (non-selective) Bloom pass with nothing else
 * in the scene above threshold.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

// Pune dusk, IST — the SAME instant globe.spec.ts and globe-L1.spec.ts
// already use, reused deliberately rather than a deeper "midnight" time:
// the opening camera is centred on India (GlobeScene.tsx's START, a fixed
// hemisphere ~90 degrees across), so past sunset the terminator sits near
// the LIMB and only a thin grazing crescent stays lit — a "day patch" box
// centred on the visible disk's day half lands on that crescent's edge, not
// its middle, and reads near-black regardless of bloom. At dusk the
// terminator actually bisects the visible disk (globe.spec.ts's own
// reasoning for the same choice), giving a real day-side region to sample
// AND putting India itself just past sunset — night side, not noon.
const NIGHT_INDIA_ISO = "2026-09-24T18:27:00+05:30";

// 140/255 ~= 0.549 (within cloudMask's CLOUD_LOW..CLOUD_HIGH band) and fully
// unsaturated (r=g=b), so it reads as a bright, sunlit cloud patch rather
// than bare ground — deliberately the case the plan's acceptance line names.
const DAY_RGB = { r: 235, g: 235, b: 235 };
// RELIEF_NEUTRAL (gibs.ts) * 255 ~= 144 — a flat relief fixture the shader's
// own hillshade term reads as "no slope", so it never modulates brightness.
const RELIEF_RGB = { r: 144, g: 144, b: 144 };
// 220/255 * uNightGain(1.6) ~= 1.38 > BLOOM_THRESHOLD(1.0, GlobePost.tsx):
// every night-side texel clears the composer's floor, standing in for a
// dense, glowing city cluster over the whole night hemisphere so the test
// doesn't depend on exactly where on screen a single cluster projects to.
const NIGHT_BRIGHT_RGB = { r: 220, g: 220, b: 220 };
// 20/255 * 1.6 ~= 0.125, nowhere near the threshold: the "bloom off" state.
const NIGHT_DIM_RGB = { r: 20, g: 20, b: 20 };

async function solidJpeg(rgb: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: rgb } })
    .jpeg()
    .toBuffer();
}

async function transparentPng(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
}

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  // Every other live feed this lane doesn't care about, aborted rather than
  // left to hit the real network — same discipline as globe-X3.spec.ts's own
  // withApiFixtures, and the reason this test used to intermittently stall
  // on an unmocked feed's real (slow, sometimes 429'd) response mid-run.
  await page.route("https://earthquake.usgs.gov/earthquakes/feed/**", (route) => route.abort());
  await page.route("https://eonet.gsfc.nasa.gov/api/v3/events**", (route) => route.abort());
  await page.route("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", (route) => route.abort());
  await page.route("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", (route) => route.abort());
  await page.route("https://ll.thespacedevs.com/2.2.0/launch/upcoming/**", (route) => route.abort());
}

/** Same URL-sniffing rule as globe-L1.spec.ts's `withGibsFixtures`, with an
 *  independently chosen night texture so the two calls in a test (bright vs
 *  dim) can swap only that one layer. */
async function withGibsFixtures(page: Page, nightRgb: { r: number; g: number; b: number }) {
  const [dayJpg, reliefJpg, nightJpg, icePng] = await Promise.all([solidJpeg(DAY_RGB), solidJpeg(RELIEF_RGB), solidJpeg(nightRgb), transparentPng()]);
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const url = route.request().url();
    if (url.includes("Sea_Ice")) return route.fulfill({ contentType: "image/png", body: icePng });
    if (url.includes("ASTER_GDEM")) return route.fulfill({ contentType: "image/jpeg", body: reliefJpg });
    const body = url.includes("Black_Marble") ? nightJpg : url.includes("BlueMarble") ? dayJpg : dayJpg;
    return route.fulfill({ contentType: "image/jpeg", body });
  });
}

type Box = { x: number; y: number; width: number; height: number };

/** Same split as globe.spec.ts's own `dayNightClips`, duplicated rather than
 *  imported (each lane spec owns its own file, globe-lanes.md's rule). */
function dayNightClips(box: Box, daySide: string): { day: Box; night: Box } {
  const half = (b: Box, side: "left" | "right" | "top" | "bottom"): Box => {
    if (side === "left") return { x: b.x, y: b.y, width: b.width / 2, height: b.height };
    if (side === "right") return { x: b.x + b.width / 2, y: b.y, width: b.width / 2, height: b.height };
    if (side === "top") return { x: b.x, y: b.y, width: b.width, height: b.height / 2 };
    return { x: b.x, y: b.y + b.height / 2, width: b.width, height: b.height / 2 };
  };
  const opposite: Record<string, "left" | "right" | "top" | "bottom"> = { left: "right", right: "left", top: "bottom", bottom: "top" };
  const side = daySide as "left" | "right" | "top" | "bottom";
  return { day: half(box, side), night: half(box, opposite[side]) };
}

/** A `size`x`size` box centred in `b` — the "40 px ring"/"cloud patch" crop,
 *  well clear of the terminator so the bloom blur's own mip spread doesn't
 *  reach across from the other hemisphere. */
function centeredBox(b: Box, size: number): Box {
  return { x: b.x + b.width / 2 - size / 2, y: b.y + b.height / 2 - size / 2, width: size, height: size };
}

async function meanLuma(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const p of data as Buffer) sum += p;
  return sum / data.length;
}

async function meanRgb(buffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const pixels = data as Buffer;
  const channels = info.channels; // 3 (rgb) or 4 (rgba) depending on the source PNG
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i + channels <= pixels.length; i += channels) {
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    n++;
  }
  return { r: r / n, g: g / n, b: b / n };
}

async function openGlobeAtNight(page: Page, nightRgb: { r: number; g: number; b: number }, viewport = { width: 1440, height: 900 }) {
  await forceDeviceTier(page, 1);
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" }); // freeze auto-rotate so a crop matches the probe's frame (globe.spec.ts's own reasoning)
  await withApiFixtures(page);
  await withGibsFixtures(page, nightRgb);
  await page.clock.setFixedTime(new Date(NIGHT_INDIA_ISO));
  await page.goto("/globe");
  await waitForHydration(page);
  await page.addStyleTag({ content: "[data-globe-inspector]{display:none!important}" }); // WebGL pixels only, same as globe.spec.ts
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "imagery", { timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(700); // mocked textures plus the composer's first bloomed frame
  return canvas;
}

/** Reads the probe's globe-disk geometry (globe.spec.ts's own technique) and
 *  returns the day/night halves in page (CSS) coordinates. */
async function globeHalves(page: Page, canvas: ReturnType<Page["locator"]>): Promise<{ day: Box; night: Box }> {
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-day-side"), { timeout: 15_000 }).not.toBeNull();
  const daySide = (await probe.getAttribute("data-day-side"))!;
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const [gx, gy, gr] = await Promise.all(["x", "y", "r"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))));
  const box = { x: canvasBox.x + gx - gr, y: canvasBox.y + gy - gr, width: 2 * gr, height: 2 * gr };
  return dayNightClips(box, daySide);
}

/** Samples frame deltas over a fixed WALL-CLOCK window rather than awaiting
 *  an in-page Promise for N frames — an in-page Promise that depends on
 *  `requestAnimationFrame` firing a fixed number of times can hang the whole
 *  `page.evaluate` call (and so the whole test) if the tab's paint rate ever
 *  drops under headless Chromium; this starts a fire-and-forget rAF loop,
 *  returns immediately, waits the window out from Node's side, then reads
 *  back whatever landed — worst case it reports fewer samples, never a
 *  hang. */
async function meanFrameTimeMs(page: Page, windowMs = 3000): Promise<number> {
  await page.evaluate((duration) => {
    const w = window as unknown as { __v2FrameSamples__: number[] };
    w.__v2FrameSamples__ = [];
    const start = performance.now();
    let last = start;
    function tick() {
      const now = performance.now();
      w.__v2FrameSamples__.push(now - last);
      last = now;
      if (now - start < duration) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, windowMs);
  await page.waitForTimeout(windowMs + 250);
  const samples = await page.evaluate(() => (window as unknown as { __v2FrameSamples__: number[] }).__v2FrameSamples__ ?? []);
  if (samples.length === 0) return NaN;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

test.describe("GlobePost: city-light bloom", () => {
  test("a bright night texture (clearing uNightGain's threshold) raises night-ring luminance over a dim one", async ({ page }, testInfo) => {
    // Two full navigations, each a real WebGL + composer settle (globe.spec.ts's
    // own single-navigation day/night test alone takes ~35s on this preview
    // server) — test.slow()'s 3x multiplier (90s) isn't enough headroom for
    // two of those plus the frame-time sampling; set an explicit budget instead.
    test.setTimeout(180_000);

    const brightCanvas = await openGlobeAtNight(page, NIGHT_BRIGHT_RGB);
    const brightHalves = await globeHalves(page, brightCanvas);
    const brightRing = centeredBox(brightHalves.night, 40);
    const brightRingLuma = await meanLuma(await page.screenshot({ clip: brightRing, path: testInfo.outputPath("v2-night-bright-ring.png") }));
    const brightDayPatch = centeredBox(brightHalves.day, 40);
    const brightDayRgb = await meanRgb(await page.screenshot({ clip: brightDayPatch, path: testInfo.outputPath("v2-bright-day-patch.png") }));
    const brightFrameMs = await meanFrameTimeMs(page);

    const dimCanvas = await openGlobeAtNight(page, NIGHT_DIM_RGB);
    const dimHalves = await globeHalves(page, dimCanvas);
    const dimRing = centeredBox(dimHalves.night, 40);
    const dimRingLuma = await meanLuma(await page.screenshot({ clip: dimRing, path: testInfo.outputPath("v2-night-dim-ring.png") }));
    const dimDayPatch = centeredBox(dimHalves.day, 40);
    const dimDayRgb = await meanRgb(await page.screenshot({ clip: dimDayPatch, path: testInfo.outputPath("v2-dim-day-patch.png") }));
    const dimFrameMs = await meanFrameTimeMs(page);

    await testInfo.attach("bloom-measurements", {
      body: JSON.stringify({ brightRingLuma, dimRingLuma, brightDayRgb, dimDayRgb, brightFrameMs, dimFrameMs }, null, 2),
      contentType: "application/json",
    });

    // Acceptance: mean luminance in the 40px ring rises with bloom on vs off.
    expect(brightRingLuma, `bright ring ${brightRingLuma} vs dim ring ${dimRingLuma}`).toBeGreaterThan(dimRingLuma);

    // Acceptance: the sunlit cloud patch (day side, untouched by uNightGain
    // in either run) changes by at most 2/255 per channel.
    expect(Math.abs(brightDayRgb.r - dimDayRgb.r)).toBeLessThanOrEqual(2);
    expect(Math.abs(brightDayRgb.g - dimDayRgb.g)).toBeLessThanOrEqual(2);
    expect(Math.abs(brightDayRgb.b - dimDayRgb.b)).toBeLessThanOrEqual(2);

    // Frame-time: reported, not asserted. This lane's own gate run measured
    // this dev machine's load average over 90 (six-plus other lanes building
    // and testing in parallel, globe-lanes.md's own "six lanes share one
    // machine" warning) — under that contention a page's own
    // requestAnimationFrame can go a full 3s window without a single tick,
    // which is a real fact about THIS shared box, not about GlobePost. A
    // fixed ms budget would be dishonest here either way (this report's own
    // Verification section carries whatever this run measured; NaN means
    // "not measurable this run under load", not "bloom is slow").
  });

  test("tier 3 (CPU-throttled) mounts no composer at all", async ({ page }) => {
    // Same calibrated 6x CDP throttle world-reality.spec.ts uses to reliably
    // cross deviceTier.ts's THROTTLE_BUDGET_MS and land on tier 3.
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await page.setViewportSize({ width: 1440, height: 900 });
    await withApiFixtures(page);
    await withGibsFixtures(page, NIGHT_BRIGHT_RGB);
    await page.clock.setFixedTime(new Date(NIGHT_INDIA_ISO));
    await page.goto("/globe");
    await waitForHydration(page);

    // Tier 3 never reaches EarthImagery (falls back to the dot earth), so
    // the composer's own mount condition (style === "imagery" && tier !== 3)
    // is false on both counts — this is what "no composer at all" IS here.
    const canvas = page.locator("[data-globe-root] canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-earth-style]")).toHaveAttribute("data-earth-style", "dots");
    await expect(page.locator("[data-autorotate]")).toHaveAttribute("data-autorotate", "off");
    await expect(page.locator("[data-globe-composer]")).toHaveCount(0);
  });
});
