import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 5 LANE W15 (together: anonymous live viewports of other explorers).
 * Fixed clock, every /api/* route mocked (G10, same discipline as
 * e2e/globe.spec.ts) -- this spec never depends on a live network, and
 * never depends on playhtml's real `globe-view-v1` room either:
 * `__GLOBE_TOGETHER_TEST__` (togetherPresence.ts's own seam) injects exactly
 * the "other explorers" each test wants, the same way `__GLOBE_PRESENCE_TEST__`
 * already does for the country-presence lanes.
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

type FakeExplorer = { lat: number; lon: number; zoom: "orbit" | "region" | "close"; mode: "orbit" | "ground" | "follow" | "street" };

async function setExplorers(page: Page, explorers: Record<string, FakeExplorer>) {
  await page.addInitScript((e) => {
    (window as unknown as { __GLOBE_TOGETHER_TEST__: unknown }).__GLOBE_TOGETHER_TEST__ = e;
  }, explorers);
}

const TWO_EXPLORERS: Record<string, FakeExplorer> = {
  "peer-mumbai": { lat: 21, lon: 72, zoom: "region", mode: "orbit" },
  "peer-buenos-aires": { lat: -33, lon: -60, zoom: "close", mode: "orbit" },
};

async function openGlobe(page: Page, { reducedMotion = true }: { reducedMotion?: boolean } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

test("two injected explorers render exactly two reticles", async ({ page }) => {
  await setExplorers(page, TWO_EXPLORERS);
  await openGlobe(page);

  const seam = page.locator("[data-together-layer]");
  await expect(seam).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => seam.getAttribute("data-together-count"), { timeout: 10_000 }).toBe("2");
});

test("the live count reads 2, the same total the store and the future \"exploring with you\" line read from", async ({ page }) => {
  await setExplorers(page, TWO_EXPLORERS);
  await openGlobe(page);

  const seam = page.locator("[data-together-layer]");
  await expect.poll(async () => seam.getAttribute("data-together-total"), { timeout: 10_000 }).toBe("2");
});

// Waits, entirely in-browser via requestAnimationFrame (no Node/CDP
// round-trip in the loop, so a slow shared machine can't fake "stable" by
// merely stalling between two Node-side polls -- this samples the actual
// render cadence and only accepts a run of REQUIRED consecutive equal
// frames), for data-together-first-x/y to stop moving -- i.e. the camera
// has genuinely come to rest, not just that autoRotate's own flag flipped
// off (see the damping comment at the call site).
//
// The 20s budget (not 8s) is deliberate: OrbitControls' own dampingFactor
// (GlobeScene.tsx, 0.08) decays sphericalDelta a fixed FRACTION PER
// update() CALL, not per real elapsed time -- so on this ten-lanes-sharing-
// one-machine box, a slow tick means fewer update() calls per real second,
// which means the SAME fixed per-call decay takes proportionally longer
// in wall-clock time to settle. Measured isolated (no contention) this
// resolves in 6 frames; under real gate load it needs real seconds of
// headroom, not frames.
async function waitForStableReticle(page: Page, timeoutMs = 20_000): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ timeoutMs: budgetMs }) =>
      new Promise<{ x: number; y: number }>((resolve, reject) => {
        const el = document.querySelector("[data-together-layer]") as HTMLElement | null;
        if (!el) {
          reject(new Error("no [data-together-layer] element"));
          return;
        }
        const REQUIRED_STABLE_FRAMES = 5;
        const deadline = performance.now() + budgetMs;
        let last: string | null = null;
        let stableFrames = 0;
        const tick = () => {
          const x = el.dataset.togetherFirstX;
          const y = el.dataset.togetherFirstY;
          const cur = `${x},${y}`;
          if (cur === last) stableFrames++;
          else {
            stableFrames = 0;
            last = cur;
          }
          if (stableFrames >= REQUIRED_STABLE_FRAMES) {
            resolve({ x: Number(x), y: Number(y) });
            return;
          }
          if (performance.now() > deadline) {
            reject(new Error(`reticle position never stabilized (stuck reading ${cur})`));
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { timeoutMs },
  );
}

test("clicking a reticle flies the camera to look where that explorer looks", async ({ page }) => {
  test.slow(); // a real WebGL settle plus a camera flight to land
  await setExplorers(page, TWO_EXPLORERS);
  // reducedMotion: false -- CameraDirector.tsx's own click-to-fly effect
  // (correctly, per the house reduced-motion rule) jumps the camera
  // INSTANTLY under reduced motion rather than animating, so
  // data-camera-flying below would never see "true" under the default
  // reducedMotion: true this file's other tests use.
  const canvas = await openGlobe(page, { reducedMotion: false });
  // Pune sits close enough to peer-mumbai's (21, 72) reading that, at
  // "region" zoom, their screen projections overlap: PulseLayer.tsx's own
  // ring/packet instancedMeshes (over Pune, LayerPanel.tsx's own onClick)
  // sit in front and steal the raycast before it ever reaches this layer's
  // hit target. Can't fix it in PulseLayer.tsx -- another lane's file --
  // so this test turns that layer off via LayerPanel.tsx's own keyboard map
  // (digit keys toggle LAYER_IDS by index; "6" is "pulses"). That listener
  // is on `window`, not the canvas, so no click-to-focus is needed first.
  await page.keyboard.press("6");

  const seam = page.locator("[data-together-layer]");
  await expect.poll(async () => seam.getAttribute("data-together-count"), { timeout: 10_000 }).toBe("2");
  await expect.poll(async () => seam.getAttribute("data-together-first-x"), { timeout: 10_000 }).not.toBeNull();

  await expect.poll(async () => canvas.getAttribute("data-camera-view")).toBe("orbit");

  // Freeze ambient auto-rotate before reading the reticle's screen position.
  // Without this, the real wall-clock gap between reading
  // data-together-first-x/y and Playwright's click actually landing
  // (actionability checks, event dispatch) lets the live spin drift the
  // reticle off the coordinate that was read -- a race against
  // GlobeScene's own OrbitControls autoRotate, not a coordinate-calculation
  // bug. The pause button is orthogonal to reducedMotion: false above:
  // CameraDirector's flyTo animation gates on the prefers-reduced-motion
  // media query, not on this button, so the flying/landed assertions below
  // still exercise the real animation.
  await page.getByRole("button", { name: "Pause the globe's ambient rotation" }).click();
  await expect(page.locator("[data-autorotate]")).toHaveAttribute("data-autorotate", "off");

  // The first peer can project behind the search controls. Orbit it into
  // the exposed canvas before targeting its actual rendered position.
  await dragOrbit(page, canvas);

  // OrbitControls' own enableDamping (GlobeScene.tsx, dampingFactor 0.08)
  // keeps bleeding off the autoRotate spin for a few more rendered frames
  // after autoRotate itself flips off, so the reticle can still be sliding
  // for a short beat right after the button click above. waitForStableReticle
  // samples on the browser's own rAF cadence until the position genuinely
  // stops moving, before trusting the coordinate the click below uses.
  const { x, y } = await waitForStableReticle(page);
  // page.mouse.click at an absolute point, not canvas.click({position}) --
  // Locator.click() re-runs its own actionability wait (visible/stable/
  // receives-events, each its own poll) before dispatching, which is exactly
  // the kind of extra real-time gap that let auto-rotate drift the target
  // out from under a click in the first place. The camera is already
  // paused and proven stable above, so there is nothing left to wait on.
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: box.x + x, y: box.y + y })).toBe("CANVAS");
  await page.mouse.click(box.x + x, box.y + y);

  // A click-to-fly in orbit view re-arms CameraDirector's flight without
  // switching `view` away from "orbit" (CameraDirector.tsx's own focus-only
  // effect) -- flying, then landing, still in orbit, is exactly what a
  // successful flyTo(store.focus) looks like from the outside.
  await expect.poll(async () => canvas.getAttribute("data-camera-flying"), { timeout: 5_000 }).toBe("true");
  await expect.poll(async () => canvas.getAttribute("data-camera-flying"), { timeout: 5_000 }).toBe("false");
  await expect(canvas).toHaveAttribute("data-camera-view", "orbit");
});

// A manual orbit-drag, not auto-rotate: this lane's own machine runs ten
// lanes at once, and auto-rotate's ~0.35deg/s (GlobeScene.tsx's own
// autoRotateSpeed) needs several real seconds AND a load-dependent frame
// rate to cross even one 3-degree quantum -- flaky by construction on a
// shared box. A drag crosses tens of degrees in one gesture, so the
// PUBLISH_MS=2000ms throttle (not frame-rate luck) is what the wait below
// is actually timing.
async function dragOrbit(page: Page, canvas: ReturnType<Page["locator"]>) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  // The search controls can cover the canvas centre. Start on its exposed
  // lower disc, as W10D's native orbit gestures do, and prove the hit target.
  const explore = await page.locator("[data-explore-bar]").boundingBox();
  if (!explore) throw new Error("exploration controls have no bounding box");
  const cy = Math.max(box.y + box.height / 2, explore.y + explore.height + 8);
  await page.mouse.move(cx, cy);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: cx, y: cy })).toBe("CANVAS");
  await page.mouse.down();
  await page.mouse.move(cx + 220, cy, { steps: 12 });
  await page.mouse.up();
}

test("turning sharing off stops publishing (break-once: this fails if the sharing gate is removed)", async ({ page }) => {
  test.slow(); // waits out PUBLISH_MS's own throttle window twice, for real
  await setExplorers(page, {}); // no peers needed -- this test only watches THIS tab's own publish count
  const canvas = await openGlobe(page); // reducedMotion default (true): no ambient auto-rotate noise, dragOrbit drives every view change deliberately

  await expect.poll(async () => canvas.getAttribute("data-camera-view")).toBe("orbit");
  await expect
    .poll(async () => page.evaluate(() => typeof window.__GLOBE_TOGETHER_SET_SHARING__ === "function"), { timeout: 10_000 })
    .toBe(true);

  const seam = page.locator("[data-together-layer]");
  // The very first reading publishes unconditionally (together.ts's own
  // shouldPublish: `if (!last) return true`).
  await expect.poll(async () => Number(await seam.getAttribute("data-together-publish-count")), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

  // A real, large view change -- crosses the 3-degree quantum by a wide
  // margin -- proves the throttle+threshold gate is actually live while
  // sharing is still on, not merely that a page just loaded.
  await dragOrbit(page, canvas);
  const afterFirstDrag = Number(await seam.getAttribute("data-together-publish-count"));
  await expect
    .poll(async () => Number(await seam.getAttribute("data-together-publish-count")), { timeout: 10_000 })
    .toBeGreaterThan(afterFirstDrag);

  await page.evaluate(() => window.__GLOBE_TOGETHER_SET_SHARING__?.(false));
  const afterOff = Number(await seam.getAttribute("data-together-publish-count"));

  // The same large drag again -- would unquestionably cross the quantum and
  // publish again if the sharing gate were removed -- but sharing is off.
  await dragOrbit(page, canvas);
  await page.waitForTimeout(2_500); // more than one PUBLISH_MS window
  const stillOff = Number(await seam.getAttribute("data-together-publish-count"));
  expect(stillOff, "publish count kept climbing after sharing was turned off").toBe(afterOff);
});
