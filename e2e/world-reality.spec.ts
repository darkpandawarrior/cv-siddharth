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
  await page.goto("/playground");
  await waitForHydration(page);
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
    await page.getByRole("link", { name: "The Playground" }).click();
    await expect(page).toHaveURL(/\/playground$/);
    await waitForHydration(page);
    await expect(page.locator(".playground-world canvas")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Reality" }).click();
    await expect(page.locator("[data-reality-you]")).toContainText("doori");
  });
});

test.describe("reduced motion and low-tier rain rendering", () => {
  /**
   * KNOWN EXTERNAL BLOCKER (out of P1-05's ownership — reported, not
   * silently worked around). `src/Playground.tsx` (owned by P3-07 then
   * P4-00 per master-plan.md#M22 handoff H2, never P1-05) sets
   * `wantsWorld = worldCapable && ...` where `worldCapable` is
   * `hasWebGL() && !matchMedia("(prefers-reduced-motion: reduce)").matches`
   * — a reduced-motion visitor is routed to the static `CorridorPlate` +
   * `RoomGrid` branch and the drivable `<World>` (this lane's Hud/Rain
   * tree) never mounts at all, so `[data-reality-rain]` cannot appear in
   * the DOM. `Rain.tsx`'s own `rainMode()` (this lane, verified correct:
   * tier is checked before reducedMotion, `motion-reduced` is returned
   * whenever `reducedMotion` is true and `precipMmH>0`) is the right
   * answer to a question this route cannot currently ask it. This test
   * stays written to reality-spec.md §7 R4's literal acceptance line so the
   * gap is visible the moment Playground.tsx's gate changes, rather than
   * silently dropped.
   */
  test("reduced motion marks rain motion-reduced, with no rain mesh mounted", async ({ page }) => {
    await mockLiveRoutes(page, WEATHER_WET);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoPlayground(page, NIGHT);
    await expect(page.locator("[data-reality-rain]")).toHaveAttribute("data-reality-rain", "motion-reduced", { timeout: 15_000 });
  });

  /**
   * KNOWN ENVIRONMENT LIMITATION (out of P1-05's ownership). `deviceTier.ts`
   * (an already-merged, different lane) computes tier 3 from a wall-clock
   * benchmark against `THROTTLE_BUDGET_MS = 180`. Measured directly against
   * this same build (`localhost` preview, headless Chromium, CDP
   * `Emulation.setCPUThrottlingRate`): the benchmark scales linearly with
   * the CDP rate (rate 1 -> ~2ms, rate 6 -> ~12.6ms, rate 20 -> ~46.5ms on
   * this machine) and does not cross 180ms until roughly rate ~90 — so
   * reality-spec.md §7 R4's literal "rate 6" does not reach tier 3 on fast
   * host hardware, only on a machine slow enough that 6x already clears
   * 180ms (the doc's own "4x CPU-throttled device ... clears it" example).
   * `rainMode(precipMmH, reducedMotion, tier)` (this lane) checks
   * `tier === 3` first and is unit-provably correct; recalibrating
   * `THROTTLE_BUDGET_MS` is deviceTier.ts's call, not this lane's.
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
