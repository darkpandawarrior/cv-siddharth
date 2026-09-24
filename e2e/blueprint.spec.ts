import { test, expect, waitForHydration } from "./lib/test.ts";
import sharp from "sharp";

/** Mean per-byte pixel difference between two same-size PNG screenshots.
 *  Raw `Buffer.compare` on PNG bytes is too strict for a live WebGL
 *  readback — re-encoding never comes back bit-identical even for a
 *  genuinely static frame (GPU dithering/AA noise), which is exactly what
 *  studio-visuals.spec.ts's own sharp-based comparison exists to work
 *  around. */
async function meanPixelDiff(a: Buffer, b: Buffer): Promise<number> {
  const [ra, rb] = await Promise.all([
    sharp(a).raw().toBuffer({ resolveWithObject: true }),
    sharp(b).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const n = Math.min(ra.data.length, rb.data.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(ra.data[i] - rb.data[i]);
  return sum / n;
}

/**
 * /blueprint (DESK altitude): the zoom badge names itself, the lathe
 * instrument's canvas actually mounts, and reduced motion genuinely stops
 * the frameloop rather than just skipping a few gated animations.
 */

test("the zoom badge is captioned, not a bare percentage", async ({ page }) => {
  await page.goto("/blueprint");
  await waitForHydration(page);
  const canvas = page.locator("main canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const badge = page.getByText(/zoom \d+%/);
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("zoom");
});

test("the instrument canvas mounts with no console errors", async ({ page }) => {
  // Real page errors (a thrown exception, the failure mode a broken
  // BlueprintInstrument mount would produce) caught directly, not scraped
  // from console text — a resource 404 surfaces as a URL-less generic
  // console "error" that can't be told apart from a real one there (see
  // smoke.spec.ts's own note on this exact ambiguity).
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  // /models/blueprint-instrument.glb is the one request this test actually
  // cares about; everything else (Vercel analytics 404s under local preview,
  // etc.) is out of scope the same way smoke.spec.ts's EXPECTED_404 excludes them.
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/models/") && !res.ok()) failedRequests.push(`${res.status()} ${res.url()}`);
  });
  await page.goto("/blueprint");
  await waitForHydration(page);
  const canvas = page.locator("main canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  // The instrument GLB loads into the same Fly-mode canvas (no separate
  // <canvas> per mesh) — give its fetch/parse a moment, then confirm
  // nothing in Blueprint3D or BlueprintInstrument threw.
  await page.waitForTimeout(1000);
  expect(pageErrors, `uncaught page errors: ${pageErrors.join("\n")}`).toEqual([]);
  expect(failedRequests, `model requests failed: ${failedRequests.join("\n")}`).toEqual([]);
});

test("reduced motion collapses the frameloop to near-static", async ({ page }) => {
  await page.goto("/blueprint");
  await waitForHydration(page);
  const canvas = page.locator("main canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  // Let the scene settle past its initial camera flight before measuring.
  await page.waitForTimeout(1500);

  // Baseline: normal motion, over the same 1s window, for scale — this scene
  // always has SOME non-zero diff even fully frozen (GPU readback noise), so
  // the real assertion is "reduced motion is dramatically calmer", not "zero".
  const normalBefore = await canvas.screenshot();
  await page.waitForTimeout(1000);
  const normalAfter = await canvas.screenshot();
  const normalDiff = await meanPixelDiff(normalBefore, normalAfter);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(500); // the live matchMedia listener's one tick, plus settle

  const reducedBefore = await canvas.screenshot();
  await page.waitForTimeout(1000);
  const reducedAfter = await canvas.screenshot();
  const reducedDiff = await meanPixelDiff(reducedBefore, reducedAfter);

  expect(normalDiff, "normal motion should show real per-second change to compare against").toBeGreaterThan(0.3);
  expect(reducedDiff, `reduced motion still changed almost as much as normal (${reducedDiff} vs ${normalDiff})`).toBeLessThan(normalDiff / 4);
});
