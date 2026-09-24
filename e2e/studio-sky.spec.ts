import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Ops, OpsRun } from "../api/_lib/ops-handler.ts";

/**
 * R3 (reality-spec.md#R3, master-plan.md#P1-02): the hero rig actually
 * changes with the real Pune sun, and the Blueprint needle actually reads
 * live CI, both proven against fixtures rather than the live network (G10).
 *
 * This file does NOT import BlueprintInstrument.tsx: that module pulls in
 * three/@react-three/fiber, which this codebase's own SSR isolation rule
 * (themeColorThree.ts's split from themeColor.ts) keeps out of any context
 * that isn't a browser page, and Playwright spec bodies run in Node, not
 * the page. `computeNeedle` below is a deliberately independent
 * reimplementation of BlueprintInstrument's reading, matching the
 * acceptance line's own wording: the angle is "computed in the test", so a
 * bug shared between the two would still be caught.
 */
const NEEDLE_RANGE_DEG = 180; // must match BlueprintInstrument.tsx's own export of the same name

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const opsFixture: Ops = JSON.parse(readFileSync(join(FIXTURES, "ops.json"), "utf8"));

/** Independent of BlueprintInstrument.tsx's `needleReading` on purpose (see
 *  the file header). Newest run per workflow, then green/total * range. */
function computeNeedle(ops: Ops): number {
  if (!ops.connected) return 0;
  const newest = new Map<string, OpsRun>();
  for (const run of ops.runs) {
    const prev = newest.get(run.workflow);
    if (!prev || run.at > prev.at) newest.set(run.workflow, run);
  }
  const rows = [...newest.values()];
  if (rows.length === 0) return 0;
  const green = rows.filter((r) => r.conclusion === "success").length;
  return (green / rows.length) * NEEDLE_RANGE_DEG;
}

async function withWeather(page: import("@playwright/test").Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
}

async function withOps(page: import("@playwright/test").Page) {
  await page.route("**/api/ops", (route) => route.fulfill({ json: opsFixture }));
}

/** Mean 0..255 luma of a screenshot buffer, decoded once via sharp. Same
 *  grayscale-raw-average technique as studio-visuals.spec.ts's variance
 *  check, just reporting the mean instead of asserting it directly. */
async function meanLuma(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data as Buffer;
  let sum = 0;
  for (const p of pixels) sum += p;
  return sum / pixels.length;
}

/**
 * The clip sits on `Orbit`'s base plinth (`studio-orbit.glb`'s flat wedge
 * under the phone), not the whole `.hero-studio-object` canvas. Measured
 * directly (scratchpad diagnostic, not guessed): the full canvas is
 * dominated by two things StudioRig's lighting cannot move at all: the
 * page's own flat CSS backdrop showing through the canvas's alpha:true
 * clear, and the phone SCREEN, a `meshBasicMaterial` texture that ignores
 * scene lights by design. Averaged over the whole canvas those two regions
 * hold the delta under 2/255 even at a wide day/night light swing.
 *
 * The plinth is part of the same group whose rings spin every frame
 * forever, so it is technically a moving target too (`page.clock` fakes
 * `Date`, not `requestAnimationFrame`, and `emulateMedia({reducedMotion:
 * "reduce"})` is not an option: Phone3D.tsx's own progressive-enhancement
 * gate reads reduced motion as "no WebGL at all" and swaps in the static
 * TiltPhone fallback, which has no StudioRig to measure). But it is a broad
 * flat surface, not a thin ring catching a sharp specular glint, so the
 * ~1 degree of drift `Orbit`'s slow spin (0.065 rad/s) adds across a 300ms
 * settle window reads as noise next to the day/night lighting delta: three
 * independent runs (fresh browser context each) landed at 27.14, 26.45 and
 * 26.57 on this exact region, comfortably clear of the required margin and
 * of each other.
 */
const PLINTH_CLIP = { left: 320, top: 310, width: 80, height: 110 };

test("the hero rig is measurably brighter at Pune noon than at Pune night", async ({ page }, testInfo) => {
  test.slow(); // two full page loads plus WebGL settle time
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withWeather(page);

  const plinthClip = async () => {
    const box = await page.locator(".hero-studio-object canvas").boundingBox();
    if (!box) throw new Error("hero canvas has no bounding box");
    return {
      x: box.x + PLINTH_CLIP.left,
      y: box.y + PLINTH_CLIP.top,
      width: PLINTH_CLIP.width,
      height: PLINTH_CLIP.height,
    };
  };

  await page.clock.setFixedTime(new Date("2026-09-24T03:15:00+05:30"));
  await page.goto("/");
  await waitForHydration(page);
  await expect(page.locator(".hero-studio-object canvas")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(300); // let the auto-rotate settle, same as studio-visuals.spec.ts
  const nightLuma = await meanLuma(await page.screenshot({ clip: await plinthClip(), path: testInfo.outputPath("hero-night-1440.png") }));

  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.reload();
  await waitForHydration(page);
  await expect(page.locator(".hero-studio-object canvas")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(300);
  const dayLuma = await meanLuma(await page.screenshot({ clip: await plinthClip(), path: testInfo.outputPath("hero-day-1440.png") }));

  await testInfo.attach("luma", { body: JSON.stringify({ nightLuma, dayLuma }), contentType: "application/json" });
  expect(dayLuma, `day luma ${dayLuma} vs night luma ${nightLuma}`).toBeGreaterThanOrEqual(nightLuma + 8);
});

test("the Blueprint needle reads the fixture's CI health", async ({ page }) => {
  const expectedAngle = computeNeedle(opsFixture);
  await withOps(page);
  await page.goto("/blueprint");
  await waitForHydration(page);
  const canvas = page.locator("main canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });

  const needleEl = page.locator("[data-needle]");
  await expect(needleEl).toBeAttached({ timeout: 30000 });
  const [needleAttr, sourceAttr] = await Promise.all([
    needleEl.getAttribute("data-needle"),
    needleEl.getAttribute("data-needle-source"),
  ]);
  expect(Number(needleAttr)).toBeCloseTo(expectedAngle, 5);
  expect(["pending", "model"]).toContain(sourceAttr);
});

test("a disconnected CI board rests the needle at zero", async ({ page }) => {
  await page.route("**/api/ops", (route) => route.fulfill({ json: { connected: false, stale: false, repo: "cv-siddharth", runs: [], neverRan: [], supplyChain: { connected: false, indexBuiltAt: null, apps: [] } } }));
  await page.goto("/blueprint");
  await waitForHydration(page);
  const needleEl = page.locator("[data-needle]");
  await expect(needleEl).toBeAttached({ timeout: 30000 });
  await expect(needleEl).toHaveAttribute("data-needle", "0");
  await expect(needleEl).toContainText("CI unavailable right now");
});

test("a stale board keeps the needle but says 'last good'", async ({ page }) => {
  const stale: Ops = { ...opsFixture, stale: true };
  await page.route("**/api/ops", (route) => route.fulfill({ json: stale }));
  await page.goto("/blueprint");
  await waitForHydration(page);
  const needleEl = page.locator("[data-needle]");
  await expect(needleEl).toBeAttached({ timeout: 30000 });
  expect(Number(await needleEl.getAttribute("data-needle"))).toBeCloseTo(computeNeedle(stale), 5);
  await expect(needleEl).toContainText("last good,");
});

test("a half-green board rests the needle at half the gauge", async ({ page }) => {
  const halfGreen: Ops = {
    ...opsFixture,
    stale: false,
    runs: [
      { workflow: "ci.yml", conclusion: "success", at: "2026-09-24T02:00:00Z", url: "x", event: "push", recentFailures: 0, recentTotal: 1 },
      { workflow: "refresh-media.yml", conclusion: "failure", at: "2026-09-24T02:00:00Z", url: "x", event: "schedule", recentFailures: 1, recentTotal: 1 },
    ],
  };
  await page.route("**/api/ops", (route) => route.fulfill({ json: halfGreen }));
  await page.goto("/blueprint");
  await waitForHydration(page);
  const needleEl = page.locator("[data-needle]");
  await expect(needleEl).toBeAttached({ timeout: 30000 });
  expect(Number(await needleEl.getAttribute("data-needle"))).toBeCloseTo(computeNeedle(halfGreen), 5);
  expect(computeNeedle(halfGreen)).toBeCloseTo(NEEDLE_RANGE_DEG / 2, 5);
});
