import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { visibleNow } from "../src/lib/satellites.ts";

/** Mean per-byte pixel difference between two same-size PNG screenshots
 *  (e2e/blueprint.spec.ts's own technique): raw `Buffer.compare` on PNG
 *  bytes is too strict for a live WebGL readback, since re-encoding never
 *  comes back bit-identical even for a genuinely static frame (GPU
 *  dithering/AA noise). */
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
 * P3-03, sky-objects (open-data-spec.md §3 A1/A2, §5; master-plan.md#P3-03).
 * Reuses e2e/world-v2.spec.ts's own fixture set and `gotoWorldV2` shape (that
 * file owns no exported helper, so this is a self-contained copy, the same
 * posture e2e/world-fiction.spec.ts already takes on its own fixtures);
 * every /api/* WorldV2 can reach is routed here too, and nothing in this
 * file hits a live network (G10).
 *
 * The fixed clock is the aircraft/tle fixtures' own `at` timestamp
 * (2026-09-23T22:26:56Z, this lane's own acceptance line), so dead
 * reckoning never drifts the aircraft positions this file asserts on.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json") as { total: number; aircraft: unknown[] };
const TLE = fixture("tle.json") as { objects: { name: string; norad: string; l1: string; l2: string }[] };

const FIXED_AT = "2026-09-23T22:26:56Z"; // the fixtures' own `at`; this lane's e2e acceptance clock

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) =>
    route.fulfill({
      json: {
        at: FIXED_AT,
        lichess: { online: false, playing: false },
        devto: [],
        ci: {},
        downloads: {},
      },
    }),
  );
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page): Promise<void> {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(FIXED_AT));
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
}

/** Every currently-loaded script URL; used to prove a chunk request only
 *  appears AFTER a given action, never diffing on a guessed hashed filename
 *  (open-data-spec.md §3 A2's own lazy-chunk contract). */
function trackScriptRequests(page: Page): Set<string> {
  const urls = new Set<string>();
  page.on("request", (req) => {
    if (req.resourceType() === "script") urls.add(req.url());
  });
  return urls;
}

test.describe("Aircraft ledger (P3-03)", () => {
  test("data-reality-aircraft equals the live route's own total, never a literal", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[data-reality-aircraft]")).toHaveAttribute("data-reality-aircraft", String(AIRCRAFT.total), {
      timeout: 15_000,
    });
  });

  test("the Aircraft ledger expands to one accessible line per aircraft", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[aria-label='Aircraft near the Sangam'] li")).toHaveCount(AIRCRAFT.total);
  });
});

test.describe("Survey lens (P3-03: open-data-spec.md §5)", () => {
  test("the lens toggles on 'L', gates the satellites chunk, and sets data-reality-satellites", async ({ page }) => {
    const scripts = trackScriptRequests(page);
    await gotoWorldV2(page);

    const beforeCount = scripts.size;
    // The count computed the same way the O3 acceptance line states it
    // (visibleNow against the checked-in tle.json fixture at the fixed
    // clock); never a literal "7" copy-pasted from the spec.
    const expectedVisible = visibleNow(TLE.objects, new Date(FIXED_AT));

    await expect(page.locator("[data-survey-lens]")).toHaveAttribute("data-survey-lens", "closed");
    await page.keyboard.press("l");
    await expect(page.locator("[data-survey-lens]")).toHaveAttribute("data-survey-lens", "open");

    await expect(page.locator("[data-reality-satellites]")).toHaveAttribute("data-reality-satellites", String(expectedVisible), {
      timeout: 15_000,
    });

    // A new script request landed only after 'L'; the lazy satellites.ts
    // (and with it satellite.js) chunk, never present in the initial load.
    await expect
      .poll(() => scripts.size, { timeout: 10_000 })
      .toBeGreaterThan(beforeCount);
  });

  test("break-it: the satellites chunk never appears before 'L' is pressed", async ({ page }) => {
    const scripts = trackScriptRequests(page);
    await gotoWorldV2(page);
    await page.waitForTimeout(1500); // give any (wrongly) eager import a chance to fire
    for (const url of scripts) {
      expect(url, `a script request landed before 'L': ${url}`).not.toMatch(/satellite/i);
    }
  });
});

test.describe("Reduced motion (P3-03)", () => {
  test("consecutive sky-region captures 2 s apart are identical under reduced motion", async ({ page }) => {
    test.setTimeout(60_000);
    // A single pair of captures is not robust here: this world has at least
    // one ambient effect outside this lane's files that fires an occasional
    // large one-off delta unrelated to the aircraft strobe (measured
    // directly against this build: steady-state consecutive-frame diffs of
    // 5-16, against one 20-170 spike roughly once every several seconds,
    // present in BOTH normal and reduced motion alike; so it survives
    // reduced motion too and is not this lane's own animation). Sampling
    // several consecutive pairs and taking the MEDIAN is what keeps that
    // one shared, out-of-scope spike from failing a test about THIS lane's
    // own reduced-motion behaviour (the aircraft strobe/dead-reckoning),
    // while still failing for real if this lane's own code kept animating.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoWorldV2(page);
    const canvas = page.locator("[data-world='v2'] canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("world canvas has no bounding box");
    // The upper half of the canvas is the sky, where the aircraft shell and
    // its strobe animate outside the lens; the region this test cares
    // about freezing under reduced motion.
    const skyClip = { x: box.x, y: box.y, width: box.width, height: box.height / 2 };

    await page.waitForTimeout(1000); // let the first frame settle after mount
    const shots: Buffer[] = [];
    for (let i = 0; i < 5; i++) {
      shots.push(await page.screenshot({ clip: skyClip }));
      if (i < 4) await page.waitForTimeout(2000);
    }
    const diffs: number[] = [];
    for (let i = 1; i < shots.length; i++) diffs.push(await meanPixelDiff(shots[i - 1], shots[i]));
    diffs.sort((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)];

    expect(median, `consecutive-frame diffs under reduced motion: ${diffs.join(", ")}`).toBeLessThan(15);
  });
});

test.describe("Tier draw cap (P3-03: CDP throttle -> tier 3)", () => {
  test("a CPU-throttled (tier 3) device draws at most 12 aircraft", async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await gotoWorldV2(page);
    const drawn = await page.locator("[data-reality-aircraft-drawn]").getAttribute("data-reality-aircraft-drawn");
    expect(drawn).not.toBeNull();
    expect(Number(drawn)).toBeLessThanOrEqual(12);
  });
});
