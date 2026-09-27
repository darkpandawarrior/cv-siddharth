import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import { landOf } from "../src/world/v2/worldModel.ts";
import { bridgeBinding } from "../src/world/v2/landmarkBindings.ts";
import { sunPosition } from "../src/lib/sky.ts";
import { repoStats } from "../src/data/repoStats.ts";
import { providers } from "../src/data/providers.ts";

/**
 * P3-01a's own e2e spec (landmarks-foundation-and-apps): the nine
 * architecture landmarks mounted by `LandmarksApps.tsx` inside
 * `/playground?world=v2`, mocked at the fixed 12:27 IST clock - the same
 * fixture/mock shape `e2e/world-v2.spec.ts` (P2-19) already uses, so both
 * specs read the SAME `/api/*` shape.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");
const NOON_IST = "2026-09-24T12:27:00+05:30";

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: { at: NOON_IST, lichess: { online: false, playing: false }, devto: [], ci: {}, downloads: {} } }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page): Promise<void> {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NOON_IST));
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
}

const canvas = (page: Page) => page.locator("[data-world='v2'] canvas");

test.describe("LandmarksApps (P3-01a, preview only)", () => {
  test("data-voussoirs equals projectStats.foundation.conventionPlugins, via WorldModel", async ({ page }) => {
    const expected = bridgeBinding(landOf(ledger));
    await gotoWorldV2(page);
    await expect(canvas(page)).toHaveAttribute("data-voussoirs", String(expected.voussoirs));
    // Root-fact cross-check against the committed data file directly, as
    // the acceptance line states it: bridge voussoirs are exactly the
    // foundation's own conventionPlugins count.
    await expect(canvas(page)).toHaveAttribute("data-voussoirs", String(ledger.projectStats.foundation.conventionPlugins));
  });

  test("data-inlay-tiles: unmeasured today, with the reason recorded (repoStats.testFiles not reachable through WorldModel yet)", async ({ page }) => {
    await gotoWorldV2(page);
    // What the acceptance line asks for is `repoStats.testFiles` on the
    // canvas; what this lane can actually deliver through the
    // WorldModel-only fence (landmarkBindings.ts's own doc, streamFence
    // rule 3) is an honest "unmeasured" until a lane that owns
    // ledger.ts/grammar.ts adds a `portfolio:testFiles` G14 facet. This
    // test pins TODAY's real, honest behaviour rather than silently
    // asserting the blocked number.
    await expect(canvas(page)).toHaveAttribute("data-inlay-tiles", "unmeasured");
    expect(repoStats.testFiles).toBeGreaterThan(0); // sanity: the real number does exist somewhere
  });

  test("data-yantra-az equals sunPosition(fixed clock).azimuthDeg within 0.5 degree", async ({ page }) => {
    const expected = sunPosition(new Date(NOON_IST));
    await gotoWorldV2(page);
    const raw = await canvas(page).getAttribute("data-yantra-az");
    expect(raw).not.toBeNull();
    expect(Math.abs(Number(raw) - expected.azimuthDeg)).toBeLessThanOrEqual(0.5);
    await expect(canvas(page)).toHaveAttribute("data-yantra-sun-up", String(expected.altitudeDeg > 0));
  });

  test("data-bells-<archetype>: read from the one WorldModel-sanctioned source (G14), flagged where it drifts from providers.ts", async ({ page }) => {
    await gotoWorldV2(page);
    const rendered = {
      native: Number(await canvas(page).getAttribute("data-bells-native")),
      hosted: Number(await canvas(page).getAttribute("data-bells-hosted")),
      mobileMoney: Number(await canvas(page).getAttribute("data-bells-mobile-money")),
      internal: Number(await canvas(page).getAttribute("data-bells-internal")),
      stub: Number(await canvas(page).getAttribute("data-bells-stub")),
    };
    // The WorldModel-sanctioned source (grammar.ts's G14, already merged,
    // outside this lane's owns) - this is what the app can honestly render
    // without reaching past the streamFence.
    const gatewaysProjectStats = ledger.projectStats["paymentslab-kmp"];
    expect(rendered.native).toBe(gatewaysProjectStats.gatewaysNative);
    expect(rendered.hosted).toBe(gatewaysProjectStats.gatewaysHosted);
    expect(rendered.mobileMoney).toBe(gatewaysProjectStats.gatewaysMobileMoney);
    expect(rendered.internal).toBe(gatewaysProjectStats.gatewaysInternal);
    expect(rendered.stub).toBe(gatewaysProjectStats.gatewaysStub);

    // The acceptance line's own literal ask: equal providers.ts's per-file
    // archetype count. Recorded (not asserted) as a known external
    // blocker - see this lane's own report.
    const byArchetype = new Map<string, number>();
    for (const p of providers) byArchetype.set(p.archetype, (byArchetype.get(p.archetype) ?? 0) + 1);
    const providersMatch =
      rendered.native === (byArchetype.get("native-sdk") ?? 0) &&
      rendered.hosted === (byArchetype.get("hosted-webview") ?? 0) &&
      rendered.mobileMoney === (byArchetype.get("mobile-money") ?? 0) &&
      rendered.internal === (byArchetype.get("internal") ?? 0) &&
      rendered.stub === (byArchetype.get("stub") ?? 0);
    test.info().annotations.push({
      type: "known-blocker",
      description: `bells vs providers.ts match=${providersMatch} (rendered ${JSON.stringify(rendered)} vs providers.ts ${JSON.stringify(Object.fromEntries(byArchetype))}); see this lane's report`,
    });
  });

  test("baori innermost sensor starts un-fired, before any level is entered this session", async ({ page }) => {
    // The gate-ORDER mechanic itself (levels 1-3 must be entered in the
    // documented order before the innermost sensor arms) is a pure function
    // of `useTouched()`'s own list and is exercised directly, deterministically
    // and for every ordering, in landmarkBindings.test.ts's own
    // `baoriInnermostReady` suite - a WebGL mesh has no DOM node Playwright
    // can click without a fragile pixel-coordinate raycast, so this e2e
    // spec pins only the rendered, end-to-end starting state: nothing is
    // touched on a fresh preview build, so the sensor reads false.
    await gotoWorldV2(page);
    await expect(canvas(page)).toHaveAttribute("data-baori-innermost-ready", "false");
  });

  test("landmark-facet based landmarks (bridge, doori, gaddi, paymentslab-kmp) are reachable through the existing accessible landmark list", async ({ page }) => {
    await gotoWorldV2(page);
    const names = await page.locator('[aria-label="Landmarks in this world"] button').allTextContents();
    for (const expected of ["Bridge", "Doori", "Gaddi", "Paymentslab Kmp"]) {
      expect(names.some((n) => n.trim() === expected)).toBe(true);
    }
  });
});

test.describe("LandmarksApps - visual capture (verifier)", () => {
  const SCRATCH_DIR =
    "/private/tmp/claude-501/-Users-darkpandawarrior-Repos/341200d5-5e29-43e9-96c5-0adfcdd173b3/scratchpad/lanes/P3-01a";

  test("captures /playground?world=v2 at 1440x900 and 390x844", async ({ page }) => {
    await gotoWorldV2(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: join(SCRATCH_DIR, "world-landmarks-1440x900.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: join(SCRATCH_DIR, "world-landmarks-390x844.png") });
  });
});
