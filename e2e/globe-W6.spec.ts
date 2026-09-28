import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { fleet } from "../src/data/store.ts";
import { buildAppRing } from "../src/world/globe/layers/reachApps.ts";

/**
 * /globe, LANE W6 (the owner's own data on the globe: per-app reach ring,
 * CI family ring, now playing, lichess). Reuses `live/signals.json`, the
 * committed fixture reality-footer.spec.ts / globe-L4.spec.ts already prove
 * matches signals-handler.ts's real shape, plus this lane's own spotify
 * fixtures (no other lane or spec had one). Every /api/* route this spec
 * depends on is fixed or explicitly left unmocked (the 404-draws-nothing
 * case), never live network (G10).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const SIGNALS_MIXED = fixture("live/signals.json"); // 4 pass, paymentslab-kmp fails; lichess offline
const SPOTIFY_PLAYING = fixture("live/reach-spotify-playing.json");
const SPOTIFY_EMPTY = fixture("live/reach-spotify-empty.json");

async function mockReachFeeds(page: Page, signals: unknown, spotify: unknown) {
  await page.route("**/api/signals", (route) => route.fulfill({ json: signals }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: spotify }));
}

/** ReachLayer.tsx's own `window.__REACH_DEBUG__` e2e seam -- see
 *  reachDebug.ts's own comment on why this is a plain global rather than a
 *  DOM node (HazardLayer.tsx's precedent for a lazily-loaded layer: an
 *  `<Html>`-based seam there measurably regressed the "Globe" chunk's own
 *  budget). */
type ReachDebug = {
  appCount: number;
  appProbeX: number | null;
  appProbeY: number | null;
  ciSegments: { slug: string; status: string }[];
  spotifyPlaying: boolean;
  lichessOnline: boolean;
  status: { state: string; detail?: string };
};

function readDebug(page: Page) {
  return page.evaluate(() => (window as unknown as { __REACH_DEBUG__?: ReachDebug }).__REACH_DEBUG__);
}

test("the app ring, CI ring and now-playing glyph render from live fixtures; health reports the real counts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockReachFeeds(page, SIGNALS_MIXED, SPOTIFY_PLAYING);
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.appCount ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
  const debug = await readDebug(page);

  // Every live app in the white-label fleet gets a column -- not storeApps
  // (his own 3 named apps), see reachApps.test.ts's own sum-relationship
  // guard for why the ring is scoped to `fleet`.
  expect(debug?.appCount).toBe(fleet.length);

  expect(debug?.ciSegments).toHaveLength(5);
  const bySlug = Object.fromEntries((debug?.ciSegments ?? []).map((s) => [s.slug, s.status]));
  expect(bySlug).toEqual({
    doori: "pass",
    gaddi: "pass",
    "paymentslab-kmp": "fail",
    "kmp-toolkit": "pass",
    "kmp-build-logic": "pass",
  });

  expect(debug?.spotifyPlaying).toBe(true);
  expect(debug?.lichessOnline).toBe(false); // the fixture's lichess is { online: false, playing: false }

  expect(debug?.status.state).toBe("live");
  expect(debug?.status.detail).toContain(`${fleet.length} apps on the ring`);
  expect(debug?.status.detail).toContain("CI 4/5 passing");
  expect(debug?.status.detail).toContain("now playing");
  expect(debug?.status.detail).not.toContain("lichess online");
});

test("clicking the biggest-install app column selects it, with the install-band row in the inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // freezes auto-rotate so the probe's screen coords hold still between read and click
  await mockReachFeeds(page, SIGNALS_MIXED, SPOTIFY_EMPTY);
  await page.goto("/globe");
  await waitForHydration(page);

  // `?.appProbeX` on an as-yet-undefined debug object is `undefined`, which
  // is NOT `null` -- polling `.not.toBeNull()` alone would pass on the very
  // first (empty) tick. `typeof ... === "number"` waits for a real value.
  await expect.poll(async () => typeof (await readDebug(page))?.appProbeX, { timeout: 30_000 }).toBe("number");
  const debug = await readDebug(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");

  await page.mouse.click(canvasBox.x + debug!.appProbeX!, canvasBox.y + debug!.appProbeY!);

  // The ring's own ordering (reachApps.ts's buildAppRing, "ordered by
  // installs") puts the biggest-floor app at index 0 -- exactly where the
  // probe is aimed. Computed from the real fleet, not hardcoded, so this
  // keeps holding if store.ts's data ever changes.
  const top = buildAppRing(fleet)[0];

  const panel = page.locator("[data-globe-inspector]");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator("h2")).toHaveText(top.name);
  await expect(panel.getByText("install band")).toBeVisible();
  await expect(panel.locator("dd", { hasText: top.installs })).toBeVisible();
  await expect(panel).toContainText("Snapshot");
  await expect(panel).toContainText("store.ts");
  await expect(panel).toContainText("Play Store listing snapshot");
});

test("every feed unreachable draws no CI segments or presence glyphs; the app ring and an honest status still hold", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Deliberately NOT mocking /api/signals or /api/spotify: vite preview's
  // own 404 for every /api/* route (living-earth-lanes.md's own house rule)
  // is the real failure path this test proves degrades to nothing drawn for
  // the live parts, never a stale value dressed as live -- while the app
  // ring (committed store.ts data, never fetched) keeps rendering.
  await page.goto("/globe");
  await waitForHydration(page);

  await expect.poll(async () => (await readDebug(page))?.status.state, { timeout: 30_000 }).toBe("snapshot");
  const debug = await readDebug(page);

  expect(debug?.appCount).toBe(fleet.length);
  expect(debug?.ciSegments).toEqual([]);
  expect(debug?.spotifyPlaying).toBe(false);
  expect(debug?.lichessOnline).toBe(false);
  expect(debug?.status.detail).toContain("CI family unreachable");
  expect(debug?.status.detail).toContain(`${fleet.length} apps on the ring`);
});
