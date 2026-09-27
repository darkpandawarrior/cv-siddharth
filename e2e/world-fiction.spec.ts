import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import { anthology } from "../src/data/anthology.ts";

/**
 * This lane's own e2e spec (P3-01e: kites, fireflies, the fenced
 * observatory). Reuses e2e/world-v2.spec.ts's own fixture set and
 * `gotoWorldV2` shape (that file owns no exported helper, so this is a
 * self-contained copy, the same posture that file already takes on its own
 * fixtures), every /api/* WorldV2 can reach is routed here too; nothing in
 * this file hits a live network (G10).
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
}

test.describe("Kites (P3-01e: lesson + archive kites)", () => {
  test("data-kites equals writing.lessons.length + writing.archive.length", async ({ page }) => {
    const expected = ledger.writing.lessons.length + ledger.writing.archive.length;
    await gotoWorldV2(page);
    await expect(page.locator("[data-kites]")).toHaveAttribute("data-kites", String(expected));
    await expect(page.locator("[data-kite-rule='lesson-kite']")).toHaveCount(ledger.writing.lessons.length);
    await expect(page.locator("[data-kite-rule='archive-kite']")).toHaveCount(ledger.writing.archive.length);
  });

  test("every kite mirror carries a real title, never an empty one", async ({ page }) => {
    await gotoWorldV2(page);
    const titles = await page.locator("[data-kite-rule='lesson-kite'], [data-kite-rule='archive-kite']").evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-title")),
    );
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) expect(title).toBeTruthy();
  });
});

test.describe("Fireflies (P3-01e: the weeb corpus, never a visitor)", () => {
  test("data-fireflies equals weeb titles minus 'To Watch' (computed in this test, never a literal)", async ({ page }) => {
    const byWatch = ledger.weeb.anime.byWatch as Record<string, number>;
    const byRead = ledger.weeb.manga.byRead as Record<string, number>;
    const expected =
      Object.entries(byWatch)
        .filter(([status]) => status !== "To Watch")
        .reduce((n, [, count]) => n + count, 0) + Object.values(byRead).reduce((n, count) => n + count, 0);

    await gotoWorldV2(page);
    await expect(page.locator("[data-fireflies]")).toHaveAttribute("data-fireflies", String(expected));
  });
});

test.describe("Tara Kund observatory (P3-01e: fenced fiction, world-v2-spec.md §5.19)", () => {
  test("the sensor is a hard-coded door to /anthology, never a Destination", async ({ page }) => {
    await gotoWorldV2(page);
    // Focus + Enter, not a raw mouse click: an `sr-only` element is a real,
    // tiny DOM node (never `display: none`), and LandmarkList.tsx's own
    // "keyboard only" test (world-v2.spec.ts) already establishes that this
    // is how this codebase drives a hidden, always-in-the-DOM button.
    const sensor = page.locator('[data-observatory-sensor="tara-kund"]');
    await expect(sensor).toHaveCount(1);
    await sensor.focus();
    await expect(sensor).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/anthology$/);
  });

  test("carries one tier per anthology.seasons.length, never a literal 4", async ({ page }) => {
    await gotoWorldV2(page);
    const observatory = page.locator("[data-observatory='tara-kund']");
    await expect(observatory).toHaveCount(1);
    await expect(observatory).toHaveAttribute("data-tiers", String(anthology.seasons.length));
  });

  test("LandmarkPanelV2 never shows the observatory, and its accessible landmark list never names it", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator('[data-landmark*="tara-kund" i]')).toHaveCount(0);
    await expect(page.locator('[data-landmark*="observatory" i]')).toHaveCount(0);
    const landmarkButtons = page.locator('[aria-label="Landmarks in this world"] button');
    const labels = await landmarkButtons.allTextContents();
    for (const label of labels) expect(label.toLowerCase()).not.toContain("tara kund");
  });
});
