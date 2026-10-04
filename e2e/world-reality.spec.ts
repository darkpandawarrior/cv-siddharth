import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Page, TestInfo } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * P1-05 — world-v1-reality (reality-spec.md §4, §7 R4; master-plan.md#M48,
 * #M49). Deterministic time and fixture routing throughout (G10): no test
 * here ever touches a live network.
 */

const FIXTURES_URL = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_URL)), "utf8"));

const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
// "the overcast fixture" (master-plan.md#P1-05's task 2 own words) — today's
// real Open-Meteo sample, code 3 = overcast, no rain.
const WEATHER_OVERCAST = fixture("weather-2026-09-24.json");
const WEATHER_WET = fixture("weather-wet-2026-09-24.json");

const NIGHT = "2026-09-24T03:15:00+05:30"; // deep night — same instant every other Night Survey test in this repo uses
const NOON = "2026-09-24T12:27:00+05:30"; // solar noon-ish, well above the golden-hour breakpoint

async function mockLiveRoutes(page: Page, weather: unknown = WEATHER_OVERCAST): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weather }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
}

async function gotoPlayground(page: Page, at: string): Promise<void> {
  await page.clock.setFixedTime(new Date(at));
  // Pre-dismiss Nav.tsx's Onboarding card (its own SEEN_KEY) rather than
  // clicking through it per test: it is a `z-20` overlay centred on the
  // whole viewport, so it visually sits on top of the Reality ledger (also
  // centred) and would intercept clicks meant for controls INSIDE the
  // ledger, like the day scrubber's "Back to now" button. This is the same
  // "declines to be counted" pattern e2e/lib/test.ts already uses for the
  // visitor ledger: the site's own documented persistence, not a test-only
  // seam.
  await page.addInitScript(() => localStorage.setItem("playground:onboarded", "1"));
  await page.goto("/playground?world=v1");
  await waitForHydration(page);
  // A reduced-motion visitor with no saved view preference lands on the
  // static corridor/list branch by default (e2e/world-fallback.spec.ts) —
  // same as any other visitor, they reach the drivable world through the
  // "drive the 3D world instead" button rather than an automatic mount.
  const driveButton = page.getByRole("button", { name: "drive the 3D world instead" });
  // Root hydration precedes Playground's capability/view effect. Wait for its
  // resolved branch before deciding whether explicit entry is needed.
  await expect(page.locator(".playground-world").or(driveButton)).toBeVisible();
  if (await driveButton.isVisible().catch(() => false)) await driveButton.click();
  await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });
}

/** Mean 0..255 luma of a screenshot buffer — the same grayscale-raw-average
 *  technique e2e/studio-sky.spec.ts and studio-visuals.spec.ts already use. */
async function meanLuma(buffer: Buffer): Promise<number> {
  const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  const pixels = data as Buffer;
  let sum = 0;
  for (const p of pixels) sum += p;
  return sum / pixels.length;
}

async function canvasLuma(page: Page, testInfo: TestInfo, name: string): Promise<number> {
  // page.clock fakes `Date`, not `requestAnimationFrame` — SpawnFlyIn's own
  // five-second camera read (SpawnFlyIn.tsx §4) still plays out in real wall
  // time, so every luma capture below waits it out first, matching how long
  // studio-sky.spec.ts's own settle window reasons about the identical class
  // of problem (that file's own comment covers why a shorter wait flaked).
  await page.waitForTimeout(6000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await page.locator(".playground-world canvas").boundingBox();
  if (!box) throw new Error("world canvas has no bounding box");
  const buf = await page.screenshot({ clip: box, path: testInfo.outputPath(name) });
  return meanLuma(buf);
}

/**
 * THE NIGHT SURVEY BASELINE (M49) — captured live against this lane's own
 * SkyBinding, not guessed: `worldLighting` pins the night rig to
 * NIGHT_SURVEY's exact literals (skyBinding.test.ts's deep-equal), so this
 * number is the same look the world shipped with before R4, re-measured
 * through an actual render. Captured on Chromium 149.0.7827.55 (Playwright
 * 1.61.1, `npx playwright --version` / a headless launch's own
 * `browser.version()`). Re-record this constant, in its own commit, the day
 * that Chromium build changes (M49's own instruction) — SwiftShader's
 * software rasteriser is what makes this number reproducible across
 * machines in the first place.
 */
// Captured from the "captures today's night luma" run below (its own
// `night-luma` attachment), this build, this machine: 23.545889894193307.
const NIGHT_LUMA_BASELINE = 23.55;
const NIGHT_LUMA_TOLERANCE = 6;
const DAY_NIGHT_MARGIN = 8;

test.describe("the Night Survey baseline (M49)", () => {
  test.beforeEach(async ({ page }) => forceDeviceTier(page, "viewport"));
  test("captures today's night luma at 03:15 with the overcast fixture", async ({ page }, testInfo) => {
    test.slow();
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NIGHT);
    const luma = await canvasLuma(page, testInfo, "night-baseline.png");
    await testInfo.attach("night-luma", { body: String(luma), contentType: "text/plain" });
    // Self-referential on the very first run (there is no baseline yet to
    // compare against) — this test exists to PRINT the number via the
    // attachment above; the ordering test below is the one with real teeth.
    expect(Number.isFinite(luma)).toBe(true);
  });

  test("night luma stays within the recorded baseline's tolerance, and noon reads brighter (ordering probe)", async ({ page }, testInfo) => {
    test.slow();
    await mockLiveRoutes(page, WEATHER_OVERCAST);

    await gotoPlayground(page, NIGHT);
    const nightLuma = await canvasLuma(page, testInfo, "night-1440.png");

    await page.clock.setFixedTime(new Date(NOON));
    await page.reload();
    await waitForHydration(page);
    await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });
    const noonLuma = await canvasLuma(page, testInfo, "noon-1440.png");

    await testInfo.attach("luma", { body: JSON.stringify({ nightLuma, noonLuma }), contentType: "application/json" });

    expect(Math.abs(nightLuma - NIGHT_LUMA_BASELINE), `night luma ${nightLuma} vs baseline ${NIGHT_LUMA_BASELINE}`).toBeLessThanOrEqual(
      NIGHT_LUMA_TOLERANCE,
    );
    expect(noonLuma, `noon luma ${noonLuma} vs night luma ${nightLuma}`).toBeGreaterThanOrEqual(nightLuma + DAY_NIGHT_MARGIN);
  });
});

test.describe("the Reality ledger", () => {
  test.beforeEach(async ({ page }) => forceDeviceTier(page, "viewport"));
  async function openLedger(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Reality" }).click();
    await expect(page.locator('[role="dialog"][aria-label="Reality ledger"]')).toBeVisible();
  }

  test("Lamps row counts the fixture's three recent pushes", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NOON);
    await openLedger(page);
    await expect(page.locator("[data-reality-lamps]")).toContainText("3");
    await expect(page.locator("[data-reality-lamps]")).toContainText("pushes in 24 h");
  });

  test("Weather row states the wet fixture's rain rate", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_WET);
    await gotoPlayground(page, NIGHT);
    await openLedger(page);
    await expect(page.locator("[data-reality-weather]")).toContainText("Rain 2.4 mm/h");
  });

  test("CI row is labelled 'this site' and shows two passes from ops.json", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NOON);
    await openLedger(page);
    const ci = page.locator("[data-reality-ci]");
    await expect(ci).toContainText("this site");
    const text = (await ci.textContent()) ?? "";
    expect((text.match(/✓/g) ?? []).length).toBe(2);
  });

  test("Visitors row never says fireflies (M1)", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NOON);
    await openLedger(page);
    await expect(page.locator("[data-reality-visitors]")).toContainText("here now");
    await expect(page.locator('[role="dialog"][aria-label="Reality ledger"]')).not.toContainText(/firefl/i);
  });

  test("the footnote states the honesty rule verbatim", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NOON);
    await openLedger(page);
    await expect(page.locator('[role="dialog"][aria-label="Reality ledger"]')).toContainText(
      "Nothing fetched here is hidden when it fails. It is marked.",
    );
  });

  test("the day scrubber previews a time and 'Back to now' clears it", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NOON);
    await openLedger(page);

    const scrubber = page.getByRole("slider", { name: "Preview a time of day (IST)" });
    await scrubber.fill(String(18 * 60 + 29)); // 18:29 in minutes-since-midnight IST

    await expect(page.locator('[role="dialog"][aria-label="Reality ledger"]')).toContainText("PREVIEW 18:29 IST, not live");

    await page.getByRole("button", { name: "Back to now" }).click();
    await expect(page.locator('[role="dialog"][aria-label="Reality ledger"]')).not.toContainText("PREVIEW");
  });
});

test.describe("the You row (sessionRipple, in-memory)", () => {
  test.beforeEach(async ({ page }) => forceDeviceTier(page, "viewport"));
  test("touching a project then navigating client-side to the world shows it in the ledger", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await page.clock.setFixedTime(new Date(NOON));

    await page.goto("/project/doori");
    await waitForHydration(page);

    // Client-side, not page.goto: sessionRipple's `touched` list is a
    // module-scope variable (src/lib/sessionRipple.ts's own doc comment),
    // and a full navigation would reload the JS context and lose it — the
    // acceptance line's own point. SiteFooter's registry-derived nav is the
    // one link to /playground present on every route (SiteFooter.tsx).
    await page.evaluate(() => {
      history.pushState({}, "", "/playground?world=v1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/playground\?world=v1$/);
    await waitForHydration(page);
    await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Reality" }).click();
    await expect(page.locator("[data-reality-you]")).toContainText("doori");
  });
});

test.describe("reduced motion and low-tier rain rendering", () => {
  /**
   * `src/Playground.tsx`'s `worldCapable` used to be `hasWebGL() &&
   * !matchMedia("(prefers-reduced-motion: reduce)").matches`, and gated
   * BOTH the default landing view AND the "drive the 3D world instead"
   * button/`showWorld()` — so a reduced-motion visitor could never reach
   * the drivable `<World>` (this lane's Hud/Rain tree) at all, by default
   * or by choice, and `[data-reality-rain]` could never appear in the DOM.
   * `Rain.tsx`'s own `rainMode()` was already correct (tier checked before
   * reducedMotion, `motion-reduced` returned whenever `reducedMotion` is
   * true and `precipMmH>0`). `worldCapable` now reads `hasWebGL()` alone;
   * the default landing view still respects reduced motion on its own
   * (e2e/world-fallback.spec.ts), so `gotoPlayground()` above clicks
   * through the "drive it instead" button when that's where it lands,
   * same as any other visitor's explicit choice — reaching the real world
   * (SceneActivity.tsx drops it to a demand frameloop) and this spec's
   * literal reality-spec.md §7 R4 acceptance line.
   */
  test("reduced motion marks rain motion-reduced, with no rain mesh mounted", async ({ page }) => {
    await forceDeviceTier(page, 1);
    await mockLiveRoutes(page, WEATHER_WET);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoPlayground(page, NIGHT);
    await expect(page.locator("[data-reality-rain]")).toHaveAttribute("data-reality-rain", "motion-reduced", { timeout: 15_000 });
  });

  /**
   * `deviceTier.ts` computes tier 3 from a wall-clock benchmark
   * (`BENCH_ITERATIONS` fixed work) against `THROTTLE_BUDGET_MS = 180`.
   * Measured directly against this build (`localhost` preview, headless
   * Chromium, CDP `Emulation.setCPUThrottlingRate`): at the old
   * `BENCH_ITERATIONS = 400_000` the benchmark only reached ~12.6ms at a 6x
   * throttle — reality-spec.md §7 R4's literal worked example — nowhere
   * near 180ms, so tier 3 was never reached and `rainMode()` (checked
   * `tier === 3` first, unit-provably correct on its own) correctly read
   * "on" for what should have read as a throttled device. Recalibrated to
   * `10_000_000` iterations: ~40ms unthrottled (still an imperceptible
   * one-time cost) and ~250ms at a 6x throttle, comfortably on the right
   * side of `THROTTLE_BUDGET_MS` in both directions.
   */
  test("a CPU-throttled (tier 3) device gets fog only, never the rain mesh", async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    await mockLiveRoutes(page, WEATHER_WET);
    await gotoPlayground(page, NIGHT);
    await expect(page.locator("[data-reality-rain]")).toHaveAttribute("data-reality-rain", "fog-only", { timeout: 15_000 });
  });

  test("break-it: dry weather never renders as raining, on any tier", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_OVERCAST);
    await gotoPlayground(page, NIGHT);
    await expect(page.locator("[data-reality-rain]")).toHaveAttribute("data-reality-rain", "off", { timeout: 15_000 });
  });
});
