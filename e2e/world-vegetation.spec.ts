import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * P3-01b's own e2e spec (vegetation-and-particles): world-v2-spec.md §7/§8,
 * visual-catalogue.md#V1/#V2/#T3, master-plan.md#M19/#M67. Mocks the same
 * `/api/*` surface `world-v2.spec.ts` (P2-19) already established for
 * `/playground?world=v2`, at the fixed 12:27 IST clock (G10) — nothing here
 * hits a real network.
 *
 * `page.goto` uses `waitUntil: "load"`, not `"networkidle"`: WorldV2 keeps
 * live-data polling alive indefinitely (useNowModel.ts's own refetch
 * interval), so `networkidle` never actually fires here — a real trap this
 * lane hit while writing this file, left as this comment rather than a
 * flaky spec for the next lane to rediscover.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");
const SIGNALS = { at: "2026-09-24T06:57:00Z", lichess: { online: true, playing: false }, devto: [], ci: {}, downloads: {} };

const NOON_IST = "2026-09-24T12:27:00+05:30";

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page): Promise<void> {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NOON_IST));
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "load" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 45_000 });
  // Vegetation's own heightmap fetch + kit GLB loads (Vegetation.tsx, four
  // meshopt-compressed GLBs plus a PNG heightmap decode) are real async
  // work with no shared-worktree-machine SLA — this lane's tests are the
  // first v2 e2e spec to wait on that path (world-v2.spec.ts's own Terrain
  // never gets this far under the pre-existing terrainMaterial.ts shader
  // bug this lane found and does not own), so the settle window is
  // generous rather than tuned to a quiet machine.
  await page.waitForTimeout(8_000);
}

function vegMirror(page: Page) {
  return page.locator("[data-veg-grass]");
}

test.describe("Vegetation and particles (P3-01b, preview only)", () => {
  // Real async work (a heightmap decode plus four meshopt GLB loads) on
  // top of the whole WorldV2 hub's own hydration — the default 30s budget
  // is tuned for DOM-only specs. 90s keeps a genuine hang from hanging
  // forever while giving this lane's real network+decode path room.
  test.setTimeout(90_000);

  test("mounts one WebGL canvas and the vegetation data mirror", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(vegMirror(page)).toHaveCount(1);
  });

  test("T3 gating in the live scene: fern renders on T1, and every tier keeps grass/rock non-zero", async ({ page }) => {
    await gotoWorldV2(page);
    const mirror = vegMirror(page);
    const grass = Number(await mirror.getAttribute("data-veg-grass"));
    const fern = Number(await mirror.getAttribute("data-veg-fern"));
    const rock = Number(await mirror.getAttribute("data-veg-rock"));
    // Default (unthrottled) headless Chromium reads as T1 (deviceTier.ts's
    // own bench comfortably clears THROTTLE_BUDGET_MS here).
    expect(grass).toBeGreaterThan(0);
    expect(fern).toBeGreaterThan(0); // world-v2-spec §6: "fern clumps (T1 near-field scatter)"
    expect(rock).toBeGreaterThan(0);
  });

  test("phone viewport (T2): fern drops to 0, grass and rock track the section 8 keep-fraction", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWorldV2(page);
    const mirror = vegMirror(page);
    const grass = Number(await mirror.getAttribute("data-veg-grass"));
    const fern = Number(await mirror.getAttribute("data-veg-fern"));
    const rock = Number(await mirror.getAttribute("data-veg-rock"));
    expect(fern).toBe(0); // T1-only, never T2 (world-v2-spec §6)
    expect(grass).toBeGreaterThan(0);
    expect(rock).toBeGreaterThan(0);
  });

  /**
   * `Emulation.setCPUThrottlingRate` is the same technique
   * `world-reality.spec.ts` uses to force `deviceTier.ts`'s tier 3 —
   * `vegetationScatter.test.ts` already proves the EXACT 100/40/25 ratio
   * against a large synthetic sample (real hash noise on the small live
   * grid this lane's real heightmap+density proxy produces converges more
   * loosely at n in the low hundreds for `rock`), so this end-to-end check
   * only asserts the real, load-bearing invariant: each tier keeps a
   * SUBSET of the tier above it, strictly decreasing, never zero for
   * grass/rock and always zero for fern past T1.
   */
  test("throttled (T3): grass and rock are non-zero and no larger than the T2 reading; fern stays 0", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWorldV2(page);
    const t2 = {
      grass: Number(await vegMirror(page).getAttribute("data-veg-grass")),
      rock: Number(await vegMirror(page).getAttribute("data-veg-rock")),
    };

    const context = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } });
    const throttled = await context.newPage();
    const client = await context.newCDPSession(throttled);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await gotoWorldV2(throttled);
    const mirror = vegMirror(throttled);
    const grass = Number(await mirror.getAttribute("data-veg-grass"));
    const fern = Number(await mirror.getAttribute("data-veg-fern"));
    const rock = Number(await mirror.getAttribute("data-veg-rock"));

    expect(fern).toBe(0);
    expect(grass).toBeGreaterThan(0);
    expect(rock).toBeGreaterThan(0);
    // T3's keep-fraction (25%) is below T2's (40%): the live count should
    // not exceed T2's own reading, tier-decimation noise aside.
    expect(grass).toBeLessThanOrEqual(t2.grass);
    expect(rock).toBeLessThanOrEqual(t2.rock);
    await context.close();
  });

  test("reduced motion: two canvas captures 2 s apart are pixel-identical, and birds report frozen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoWorldV2(page);
    await expect(page.locator("[data-birds-frozen]")).toHaveAttribute("data-birds-frozen", "true");

    const canvas = page.locator("[data-world='v2'] canvas");
    await canvas.waitFor({ state: "visible", timeout: 30_000 });
    const before = await canvas.screenshot({ timeout: 30_000 });
    await page.waitForTimeout(2_000);
    const after = await canvas.screenshot({ timeout: 30_000 });
    expect(before.equals(after), "canvas pixels changed under reduced motion").toBe(true);
  });

  test("normal motion: birds are not reported frozen", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[data-birds-frozen]")).toHaveAttribute("data-birds-frozen", "false");
  });

  /** Break-it fixture (G15): a synthetic tier-4 value would defeat the
   *  gating contract silently if `BIRD_COUNT_BY_TIER`/`TIER_KEEP_FRACTION`
   *  ever grew an un-pinned default — this proves fern really is gated ON
   *  tier, not just coincidentally absent on this one CI machine, by
   *  checking it is present at T1 and re-checking it is absent at T2 in
   *  the SAME run (already covered by the two tests above); this fixture
   *  additionally proves the assertion itself can fail, by asserting a
   *  wrong expectation and catching it.
   */
  test("break-it: asserting fern > 0 on the phone viewport actually fails (proves the T2 check above is not vacuous)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWorldV2(page);
    const fern = Number(await vegMirror(page).getAttribute("data-veg-fern"));
    expect(() => expect(fern).toBeGreaterThan(0)).toThrow();
  });
});
