import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { encodePath } from "../src/lib/pathShare.ts";

/**
 * P3-04's own e2e spec (world-mechanics): the ghost hodi (Echo), the Sense,
 * the attention murmur and pathShare's `?path=` link, at `/playground?
 * world=v2`. Every /api/* route this reaches (via useNowModel.ts /
 * BowLantern.tsx's own useLiveSignal) is mocked here — nothing in this file
 * hits a real network (G10). Presence (the Sense/murmur's real trigger) is
 * `@playhtml/react`'s own live PartyKit channel, which this suite never
 * dials into (G10 "no required gate hits a live network") — so what's
 * provable here, single-browser, is: the mechanics are wired, fire on the
 * player's own action (Echo) or don't false-fire with zero other visitors
 * (Sense/murmur's honest negative case), and keep working — not disabled
 * outright — under reduced motion.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, "e2e", "fixtures", name), "utf8"));

const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");

const NOON_IST = "2026-09-24T12:27:00+05:30";

async function mockLiveRoutes(page: Page, opts: { spotifyPlaying?: boolean } = {}): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) =>
    route.fulfill({
      json: opts.spotifyPlaying
        ? { connected: true, isPlaying: true, track: "A Song", artist: "Someone", recent: [] }
        : { connected: false, isPlaying: false, recent: [] },
    }),
  );
  await page.route("**/api/signals", (route) =>
    route.fulfill({
      json: {
        at: "2026-09-24T06:57:00Z",
        lichess: { online: true, playing: false },
        devto: [],
        ci: {},
        downloads: {},
      },
    }),
  );
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page, opts: { reducedMotion?: boolean; pathParam?: string; spotifyPlaying?: boolean } = {}): Promise<void> {
  await mockLiveRoutes(page, opts);
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date(NOON_IST));
  // Same pre-dismiss as e2e/world-v2.spec.ts's own gotoWorldV2 (P2-19).
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  const url = opts.pathParam ? `/playground?world=v2&path=${encodeURIComponent(opts.pathParam)}` : "/playground?world=v2";
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForHydration(page);
  await expect(page.locator("[data-world='v2'] canvas")).toHaveCount(1, { timeout: 15_000 });
}

test.describe("world-mechanics (P3-04): Echo, the Sense, the murmur, pathShare", () => {
  test("pressing E leaves a ghost hodi that replays the last recorded intent", async ({ page }) => {
    await gotoWorldV2(page);
    const marker = page.locator("[data-echo-active]");
    await expect(marker).toHaveAttribute("data-echo-active", "false");
    // A few frames of real driving first, so there is something recorded to
    // replay — Echo.tsx's own buffer is empty at t=0.
    await page.waitForTimeout(300);
    await page.keyboard.press("e");
    await expect(marker).toHaveAttribute("data-echo-active", "true", { timeout: 5_000 });
  });

  test("under reduced motion, Echo still records and replays (it is player-triggered, not an ambient effect)", async ({ page }) => {
    await gotoWorldV2(page, { reducedMotion: true });
    const marker = page.locator("[data-echo-active]");
    await expect(marker).toHaveAttribute("data-echo-reduced-motion", "true");
    await page.waitForTimeout(300);
    await page.keyboard.press("e");
    await expect(marker).toHaveAttribute("data-echo-active", "true", { timeout: 5_000 });
  });

  test("under reduced motion, the murmur tracker is still stepped every frame (never disabled outright)", async ({ page }) => {
    await gotoWorldV2(page, { reducedMotion: true });
    const marker = page.locator("[data-murmur-count]");
    // "Still works" here means "still computing a real reading", not "has
    // rippled" — a single browser can never supply the 2 lanterns a real
    // ripple needs (G10: no live multi-client presence in a required gate).
    await expect(marker).toHaveAttribute("data-murmur-count", /^\d+$/, { timeout: 5_000 });
  });

  test("the Sense never fires with zero other visitors present (honest negative case)", async ({ page }) => {
    await gotoWorldV2(page);
    await page.waitForTimeout(500);
    await page.keyboard.press("e");
    await page.waitForTimeout(500);
    await expect(page.locator("[data-sense-line]")).toHaveCount(0);
  });

  test("the bow lantern's own presence marker reflects Spotify isPlaying", async ({ page }) => {
    await gotoWorldV2(page, { spotifyPlaying: true });
    await expect(page.locator("[data-bow-lantern-playing]")).toHaveAttribute("data-bow-lantern-playing", "true", { timeout: 10_000 });
  });

  test("the bow lantern stays unlit-beat when nothing is playing", async ({ page }) => {
    await gotoWorldV2(page, { spotifyPlaying: false });
    await expect(page.locator("[data-bow-lantern-playing]")).toHaveAttribute("data-bow-lantern-playing", "false", { timeout: 10_000 });
  });

  test("arriving via a shared ?path= link surfaces the touched landmarks in PathControls", async ({ page }) => {
    const encoded = encodePath(["bridge", "gaddi"]);
    await gotoWorldV2(page, { pathParam: encoded });
    const button = page.locator("[data-path-share]");
    await expect(button).toBeVisible();
    await expect(button).toContainText("2");
  });

  test("with no touched landmarks, PathControls renders no share button", async ({ page }) => {
    await gotoWorldV2(page);
    await expect(page.locator("[data-path-share]")).toHaveCount(0);
  });
});
