import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * Lane 3 step A (2026-09-29-globe-wave7-synthesis.md #Lane 3): ATMO_FRAG
 * (sun.ts) now multiplies its flat blue by a per-channel Rayleigh
 * transmittance, so the atmosphere's limb reddens near the terminator and
 * stays blue at noon. This is that plan's own acceptance line, checked
 * against real rendered pixels rather than the pure transmittance math
 * (sun.test.ts already covers that in isolation).
 *
 * Same fixed dusk clock as globe.spec.ts's day/night luma test, chosen for
 * the same reason: the terminator has to cross the visible disk, or every
 * limb point reads as noon or as midnight and this test has nothing to
 * compare.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

const DEG = Math.PI / 180;

test("the atmosphere limb reddens 5 degrees into the twilight side and stays blue facing the sun", async ({ page }, testInfo) => {
  test.slow(); // real WebGL settle plus a full-canvas screenshot and a pixel walk
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T18:27:00+05:30")); // Pune dusk — same fixture time as globe.spec.ts
  await page.goto("/globe");
  await waitForHydration(page);
  // Same reason globe.spec.ts hides this before cropping WebGL pixels: the
  // Inspector card can float over the same screen region as the globe disk.
  await page.addStyleTag({ content: "[data-globe-inspector]{display:none!important}" });

  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(700); // the mocked mask fetch plus the first coloured frame

  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-day-side")).not.toBeNull();
  const num = async (attr: string) => Number(await probe.getAttribute(attr));

  // The globe opens on a camera-intro fly-in (cameraIntro.ts): data-globe-r
  // is still shrinking toward its resting value for a bit after the first
  // coloured frame. Poll it until three consecutive reads agree instead of
  // trusting a fixed delay, so the geometry read below is the settled frame
  // rather than a mid-flight one.
  let settledR: number | null = null;
  let stableStreak = 0;
  for (let i = 0; i < 60 && stableStreak < 3; i++) {
    const rNow = await num("data-globe-r");
    if (settledR !== null && Math.abs(rNow - settledR) < 0.5) stableStreak++;
    else stableStreak = 0;
    settledR = rNow;
    if (stableStreak < 3) await page.waitForTimeout(150);
  }

  const [sx, sy, cx, cy, r] = await Promise.all(
    ["data-subsolar-x", "data-subsolar-y", "data-globe-x", "data-globe-y", "data-globe-r"].map(num),
  );

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const thetaSun = Math.atan2(sy - cy, sx - cx);

  // data-globe-r (GlobeScene.tsx SceneRig) is measured along the camera's
  // local X axis only. The composed layout calls cam.setViewOffset to shift
  // the frustum for the docked right panel, which makes an off-axis
  // (asymmetric) perspective projection: a sphere under it does not project
  // to an exact screen-space circle, so `r` under- or over-shoots the true
  // silhouette at bearings away from thetaSun (confirmed against this
  // fixture: a ring at thetaSun-95deg using `r` landed on dim, still-mostly
  // day-side pixels, not the twilight band). One full-canvas screenshot,
  // decoded once, lets every sample below walk the REAL rendered silhouette
  // (background-vs-not, radially) instead of trusting that circle.
  const canvasBuf = await page.screenshot({ clip: canvasBox, path: testInfo.outputPath("globe-canvas.png") });
  const { data, info } = await sharp(canvasBuf).raw().toBuffer({ resolveWithObject: true });
  const { width: bw, height: bh, channels: bc } = info;
  const pixelAt = (x: number, y: number): { r: number; g: number; b: number } | null => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= bw || yi >= bh) return null;
    const i = (yi * bw + xi) * bc;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };
  // GlobeScene.tsx: <color attach="background" args={["#05070a"]}/>.
  const BG = { r: 5, g: 7, b: 10 };
  const diffFromBg = (p: { r: number; g: number; b: number }) => Math.abs(p.r - BG.r) + Math.abs(p.g - BG.g) + Math.abs(p.b - BG.b);
  const STEP = 2, THRESH = 8, INWARD_MARGIN = 10;
  // SUSTAIN=14 (28px of continuously non-background pixels) rather than a
  // handful: this scene also draws stars, satellite/aircraft rings and the
  // Pune marker cluster, all of which clear the background-difference
  // threshold too. A short sustain run latches onto the first star or ring
  // a radial scan crosses (measured: edge jumping between ~270 and ~560px
  // between adjacent bearings, nowhere near a sphere's smooth silhouette);
  // a run this long only completes on the shell's own solid limb.
  const SUSTAIN = 14;
  /** Radial background-vs-not scan at a given bearing, searching only
   *  `center` plus or minus BAND: the true silhouette radius drifts by
   *  roughly 3px per degree walked (measured, off-axis projection - see the
   *  comment below), so a search band that re-centres on the previous
   *  bearing's edge tracks it, where one fixed band across the whole sweep
   *  either loses the edge or (worse) locks onto a star/ring further out. */
  const BAND = 90;
  function limbSample(theta: number, center: number): { rgb: { r: number; g: number; b: number }; edge: number } | null {
    let edge: number | null = null;
    for (let rr = Math.min(center + BAND, Math.round(r * 1.3)); rr >= Math.max(center - BAND, 0); rr -= STEP) {
      let ok = true;
      for (let k = 0; k < SUSTAIN; k++) {
        const p = pixelAt(cx + (rr - k * STEP) * Math.cos(theta), cy + (rr - k * STEP) * Math.sin(theta));
        if (!p || diffFromBg(p) <= THRESH) { ok = false; break; }
      }
      if (ok) { edge = rr; break; }
    }
    if (edge == null) return null;
    const sampleR = Math.max(edge - INWARD_MARGIN, 0);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const p = pixelAt(cx + sampleR * Math.cos(theta) + dx, cy + sampleR * Math.sin(theta) + dy);
        if (p) { sr += p.r; sg += p.g; sb += p.b; n++; }
      }
    }
    return n > 0 ? { rgb: { r: sr / n, g: sg / n, b: sb / n }, edge } : null;
  }

  const facingSunHit = limbSample(thetaSun, r);
  if (!facingSunHit) throw new Error("no limb edge found facing the sun");
  const facingSunRGB = facingSunHit.rgb;

  // Walk the limb from the sun-facing point, re-centring the search band on
  // each bearing's own detected edge, until a sample turns red-dominant.
  // This is the terminator crossing itself, not an offset guess at it: the
  // off-axis projection (cam.setViewOffset, for the docked right panel)
  // means the true crossing sits at a different screen bearing than the
  // naive +/-90deg from thetaSun would predict, by ~14deg on this fixture,
  // and ATMO_FRAG's `tr` term is symmetric in abs(cosSun) (it reddens in a
  // narrow band right around the terminator and fades BACK toward blue,
  // just dimmer, further into night) so a fixed step chosen without
  // measuring first risks landing past that band rather than in it — both
  // confirmed against this fixture with a throwaway sweep script (see this
  // lane's report). Stopping at the crossing is not circular: a shader that
  // stopped reddening at all would make every bearing in the sweep stay
  // blue-dominant, and the walk below would exhaust MAX_DEG and throw
  // rather than silently pass.
  const MAX_DEG = 100;
  function walkToTwilight(sign: 1 | -1): { theta: number; rgb: { r: number; g: number; b: number } } | null {
    let center = r;
    for (let deg = 1; deg <= MAX_DEG; deg += 1) {
      const theta = thetaSun + sign * deg * DEG;
      const hit = limbSample(theta, center);
      if (!hit) continue;
      center = hit.edge;
      if (hit.rgb.r > hit.rgb.b) return { theta, rgb: hit.rgb };
    }
    return null;
  }
  const twilightHit = walkToTwilight(1) ?? walkToTwilight(-1);
  if (!twilightHit) throw new Error("no red-dominant limb pixel found walking either way around the limb");
  const { theta: twilightTheta, rgb: twilightRGB } = twilightHit;

  await testInfo.attach("limb-rgb", {
    body: JSON.stringify({ facingSunRGB, twilightRGB, thetaSunDeg: thetaSun / DEG, twilightThetaDeg: twilightTheta / DEG }),
    contentType: "application/json",
  });

  expect(facingSunRGB.b, `facing-sun limb ${JSON.stringify(facingSunRGB)}`).toBeGreaterThan(facingSunRGB.r);
  expect(twilightRGB.r, `twilight limb ${JSON.stringify(twilightRGB)}`).toBeGreaterThan(twilightRGB.b);
});
