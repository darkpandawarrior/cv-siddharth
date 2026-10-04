import { forceDeviceTier } from "./lib/deviceTier.ts";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import { landOf } from "../src/world/v2/worldModel.ts";

/**
 * P2-19's own e2e spec (sangam-assembly): the WorldV2 hub at
 * `/playground?world=v2`, mocked against G10's fixtures at the fixed 12:27
 * IST clock. Every /api/* WorldV2 (via useNowModel.ts) can reach is routed
 * here — nothing in this file hits a real network.
 */

test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");
const SIGNALS = {
  at: "2026-09-24T06:57:00Z",
  lichess: { online: true, playing: false },
  devto: [{ url: "https://dev.to/x/lesson-one", reactions: 40, comments: 2, publishedAt: "2026-05-01T00:00:00Z" }],
  ci: {
    doori: { state: "pass", newestAt: "2026-09-24T06:00:00Z", failing: [] },
    gaddi: { state: "pass", newestAt: "2026-09-24T06:00:00Z", failing: [] },
    "paymentslab-kmp": { state: "pass", newestAt: "2026-09-24T06:00:00Z", failing: [] },
    "kmp-toolkit": { state: "none", newestAt: null, failing: [] },
    "kmp-build-logic": { state: "none", newestAt: null, failing: [] },
  },
  downloads: {
    doori: { tag: "v1.0.0", apk: 120 },
    gaddi: { tag: "v1.0.0", apk: 40 },
    "paymentslab-kmp": { tag: "v1.0.0", apk: 15 },
  },
};

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
  // Pre-dismiss OnboardingV2's first-run card (its own SEEN_KEY) rather than
  // clicking through it per test — same reasoning, and same fix, as
  // e2e/world-reality.spec.ts's gotoPlayground for v1's Nav.tsx Onboarding:
  // it is a `z-20` overlay centred on the whole viewport, so left undismissed
  // it visually sits on top of the Reality ledger (also centred) and would
  // intercept the ledger row hover/click below.
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  // Scoped to WorldV2's own root: the site's global chrome (the anomaly
  // rail's 2D canvas, mounted on every route per playground-world.spec.ts's
  // own stubNoWebGL comment) is present here too, so an unscoped
  // `page.locator("canvas")` legitimately finds more than one.
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
}

test.describe("WorldV2 hub (Sangam)", () => {
  test("renders data-world='v2' and mounts exactly one WebGL canvas", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[data-world='v2']")).toHaveCount(1);
  });

  test("pr-stone: instance count equals landOf(ledger)'s real pr-stone feature count", async ({ page }) => {
    // The real number, not `upstreamMergedPRs` restated: G6's cairn design
    // (grammar.ts) folds every uncounted PR for an org into ONE aggregate
    // "cairn" feature rather than one instance per PR, so the rendered
    // instance count is `itemised + (1 if a cairn exists)` per org, summed
    // across every upstream org in the real openSource data — exactly what
    // `landOf` (the same function `worldModel()` calls) produces. Deriving
    // the expectation from that real pathway, rather than from a formula
    // re-guessed here, is what keeps this assertion honest if the curated
    // data or the org set ever changes.
    const expected = landOf(ledger).filter((f) => f.rule === "pr-stone").length;
    await gotoWorldV2(page);
    const stones = page.locator("[data-rule='pr-stone']");
    await expect(stones).toHaveCount(expected);
  });

  test("hovering the PR-stone ledger row sets data-highlighted on its bound instances", async ({ page }) => {
    await gotoWorldV2(page);
    const row = page.locator("[data-ledger-row='pr-stone']");
    // The ledger opens on the `R` key (LedgerPanel/HudV2's own toggle).
    await page.keyboard.press("r");
    await expect(row).toBeVisible();
    await row.hover();
    const stones = page.locator("[data-rule='pr-stone']");
    await expect(stones.first()).toHaveAttribute("data-highlighted", "true");
    await page.mouse.move(0, 0);
    await expect(stones.first()).toHaveAttribute("data-highlighted", "false");
  });

  test("the river ledger row carries the 'modelled' cadence", async ({ page }) => {
    await gotoWorldV2(page);
    await page.keyboard.press("r");
    const row = page.locator("[data-ledger-row='river']");
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-cadence", "modelled");
    await expect(row).toContainText(/modelled/i);
  });

  test("the LAND section's relief row mentions SRTM", async ({ page }) => {
    await gotoWorldV2(page);
    await page.keyboard.press("r");
    await expect(page.locator("[data-ledger-row='relief-srtm']")).toContainText(/SRTM/);
  });

  test("keyboard only: Tab reaches a button for every landmark, Enter opens its panel", async ({ page }) => {
    await gotoWorldV2(page);
    const landmarkButtons = page.locator('[aria-label="Landmarks in this world"] button');
    const count = await landmarkButtons.count();
    expect(count).toBeGreaterThan(0);

    await landmarkButtons.first().focus();
    await expect(landmarkButtons.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-landmark]")).toBeVisible();
  });

  test("ships a real <h1> and a dismissable first-run card, same contract as v1", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NOON_IST));
    // Deliberately NOT gotoWorldV2 here — this test wants the truly first-run
    // state gotoWorldV2's own pre-dismiss (above) skips for every other test.
    await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
    await waitForHydration(page);
    await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });

    await expect(page.locator("h1")).toHaveCount(1);

    const card = page.getByRole("button", { name: "Got it" });
    await expect(card).toBeVisible();
    await card.click();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("playground:v2:onboarded"))).toBe("1");

    // Reload: a visitor who has already seen it doesn't see it again.
    await page.reload({ waitUntil: "networkidle" });
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: "Got it" })).toHaveCount(0);
  });

  test("a production build keeps world=v1 reachable and defaults to v2", async () => {
    // A genuinely separate, scratch production build (VITE_VERCEL_ENV set),
    // never touching the shared preview `dist/` the rest of this file's
    // webServer serves from — that server keeps running unaffected by this
    // build, and this scratch one is torn down at the end regardless of
    // outcome. Declared slow: a real `vite build`, the same "the cost is
    // real, so it is declared" pattern this suite already uses
    // (e2e/playground-world.spec.ts's List-view test).
    //
    // Verified by calling the built SSR entry's own `fetch` directly
    // (dist/server/server.js's `default.fetch(request)`, TanStack Start's
    // own server handler shape) rather than spinning up a second preview
    // HTTP server: this route server-renders, so the gate is provable from
    // the SSR HTML string alone, and this avoids a second `vite preview`
    // process (which does not resolve this app's SSR routes under a
    // non-default `--outDir` — only the client static assets).
    test.slow();
    const outDir = "dist-prod-check-p2-19";
    const absOutDir = join(ROOT, outDir);
    if (existsSync(absOutDir)) rmSync(absOutDir, { recursive: true, force: true });

    try {
      execSync(`npx vite build --outDir ${outDir} --mode production`, {
        cwd: ROOT,
        env: { ...process.env, VITE_VERCEL_ENV: "production" },
        stdio: "pipe",
        timeout: 300_000,
      });

      const serverEntry = pathToFileURL(join(absOutDir, "server", "server.js")).href;
      const mod = (await import(serverEntry)) as { default: { fetch(req: Request): Promise<Response> } };
      const response = await mod.default.fetch(new Request("http://localhost/playground?world=v1"));
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain('data-world="v1"');
      expect(html).not.toContain('data-world="v2"');
      const defaultResponse = await mod.default.fetch(new Request("http://localhost/playground"));
      const defaultHtml = await defaultResponse.text();
      expect(defaultResponse.status).toBe(200);
      expect(defaultHtml).toContain('data-world="v2"');
      expect(defaultHtml).not.toContain('data-world="v1"');
      expect(defaultHtml).toContain("01-golden-spawn");

    } finally {
      rmSync(absOutDir, { recursive: true, force: true });
    }
  });
});

// A "WorldV2 hub — visual capture (verifier)" describe block used to sit
// here: two assertion-free tests that only called page.screenshot() into a
// hardcoded path under a since-deleted Claude agent session's /private/tmp
// scratch directory (.../claude-501/.../scratchpad/lanes/P2-19). It was dev
// scratch tooling from lane P2-19, never meant to ship, and it failed CI's
// "End-to-end tests" step on every run with ENOENT once that directory
// stopped existing. Removed rather than repointed: it verified nothing
// (no expect() calls), so there was nothing here worth keeping alive.
