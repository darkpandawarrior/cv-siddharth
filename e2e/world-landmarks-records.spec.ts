import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import { recordBindings } from "../src/world/v2/recordBindings.ts";

/**
 * P3-01f's own e2e spec: `LandmarksRecords.tsx`'s hidden DOM mirror at
 * `/playground?world=v2`, mocked against the same G10 fixtures
 * `e2e/world-v2.spec.ts` (P2-19) uses, at the same fixed 12:27 IST clock —
 * nothing here hits a real network. Deliberately its own file, its own
 * `data-landmarks-records` root: this layer's mirror is additive to
 * `GrammarInstancesDom`'s existing one, never a replacement of it (see
 * recordBindings.ts's own docblock for why `pr-stone`/`niche-lamp` stay
 * unclaimed there).
 */

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
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator("[data-landmarks-records]")).toHaveCount(1, { timeout: 15_000 });
}

test.describe("LandmarksRecords (P3-01f, world-v2 preview only)", () => {
  test("deepmal: lit/total equal fleetStats.live and live+delisted", async ({ page }) => {
    await gotoWorldV2(page);
    const mirror = page.locator("[data-deepmal-lit]").first();
    await expect(mirror).toHaveAttribute("data-deepmal-lit", String(ledger.fleet.stats.live));
    await expect(mirror).toHaveAttribute("data-deepmal-total", String(ledger.fleet.stats.live + ledger.fleet.stats.delisted));
  });

  test("stepping stones: career-ops/openMF/submerged counts match the real ledger", async ({ page }) => {
    const { steppingStones } = recordBindings(ledger);
    await gotoWorldV2(page);
    const mirror = page.locator("[data-stones-career-ops]").first();
    await expect(mirror).toHaveAttribute("data-stones-career-ops", String(steppingStones.countsByOrg["career-ops-hq"] ?? 0));
    await expect(mirror).toHaveAttribute("data-stones-openmf", String(steppingStones.countsByOrg.openMF ?? 0));
    await expect(mirror).toHaveAttribute("data-stones-submerged", String(steppingStones.submergedCount));
  });

  test("employer ghats: hover-only, never clickable — no data-opens on any ghat mirror node", async ({ page }) => {
    const { employerGhats } = recordBindings(ledger);
    await gotoWorldV2(page);
    const ghats = page.locator("[data-employer-ghat]");
    await expect(ghats).toHaveCount(employerGhats.length);
    const count = await ghats.count();
    for (let i = 0; i < count; i++) {
      expect(await ghats.nth(i).getAttribute("data-opens")).toBeNull();
    }
  });

  test("hero stones: every case study opens something, and carries its own register count", async ({ page }) => {
    const { heroStones } = recordBindings(ledger);
    await gotoWorldV2(page);
    const stones = page.locator("[data-hero-stone]");
    await expect(stones).toHaveCount(heroStones.length);
    for (const stone of heroStones) {
      const node = page.locator(`[data-hero-stone='${stone.slug}']`);
      await expect(node).toHaveAttribute("data-opens", stone.opens.kind);
      await expect(node).toHaveAttribute("data-registers", String(stone.registers));
    }
  });
});
