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

// /globe mounts every layer together (GlobeScene.tsx), and HazardLayer.tsx's
// own external feeds (quakes, EONET, GDACS...) are real internet calls, not
// same-origin /api/* -- so mocking only this lane's two routes still leaves
// this spec hitting live network for those, breaking G10 (measured: a real
// EONET flood glyph's hit target can sit right over Pune and swallow every
// click meant for the reach-app ring underneath it). Abort them all so this
// lane's own layer is the only thing rendered at Pune -- same URL list
// globe-L7.spec.ts's own abortAllHazardFeeds uses, that lane's file not
// imported here per the worktree's ownership split.
const EXTERNAL_HAZARD_URLS = [
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  "https://eonet.gsfc.nasa.gov/api/v3/events**",
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH",
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  "https://ll.thespacedevs.com/2.2.0/launch/upcoming/**",
];

async function mockReachFeeds(page: Page, signals: unknown, spotify: unknown) {
  await page.route("**/api/signals", (route) => route.fulfill({ json: signals }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: spotify }));
  for (const url of EXTERNAL_HAZARD_URLS) await page.route(url, (route) => route.abort());
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

/** Clicks near `(cx, cy)`, nearest offsets first, stopping the moment
 *  `matches()` is true. Biased vertical over horizontal on purpose:
 *  reachAppRing.tsx's own shared hit cylinder sits at EXACTLY the ring's
 *  radius (a click radially off it resolves to a different angle around the
 *  ring, i.e. a NEIGHBOURING app, per that file's own comment on why a
 *  padded radius broke this), so any residual pixel drift between reading
 *  the probe and the actual click (camera settle, a frame of damping under
 *  this worker's real load) is only ever forgiving along the column's own
 *  HEIGHT -- straight up or down from the probe pixel, never sideways. A
 *  small sideways nudge is still tried last, in case the drift itself has a
 *  sideways component, but the bulk of the search stays on the axis that can
 *  actually still be this column at a different height. */
async function clickSpiral(page: Page, cx: number, cy: number, matches: () => Promise<boolean>): Promise<boolean> {
  if (await matches()) return true;
  for (let dy = 2; dy <= 24; dy += 2) {
    for (const sy of [-1, 1]) {
      await page.mouse.click(cx, cy + sy * dy);
      if (await matches()) return true;
    }
  }
  for (let dx = 1; dx <= 3; dx++) {
    for (const sx of [-1, 1]) {
      for (let dy = -6; dy <= 6; dy += 3) {
        await page.mouse.click(cx + sx * dx, cy + dy);
        if (await matches()) return true;
      }
    }
  }
  return false;
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
  // clickSpiral trades click count for reliability against the ring's own
  // raycasting margin (see its call site) -- worth more than the 30s default.
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // freezes auto-rotate so the probe's screen coords hold still between read and click
  // No `ci` block: this test is only about the app ring's own click wire,
  // and FamilyCiRing.tsx's ring shares Pune with this one at a LARGER
  // radius (CI_RING_RADIUS 0.85 vs APP_RING_RADIUS 0.55) -- with segments
  // present, a ray aimed at the app column's own centre can resolve to the
  // CI ring's nearer geometry instead (measured: consistently "doori", the
  // first CI segment, this lane's own report). buildReachStatus's "snapshot"
  // branch (ci null) is already covered by the third test below.
  await mockReachFeeds(page, { ...SIGNALS_MIXED, ci: undefined }, SPOTIFY_EMPTY);
  await page.goto("/globe");
  await waitForHydration(page);

  // `?.appProbeX` on an as-yet-undefined debug object is `undefined`, which
  // is NOT `null` -- polling `.not.toBeNull()` alone would pass on the very
  // first (empty) tick. `typeof ... === "number"` waits for a real value.
  await expect.poll(async () => typeof (await readDebug(page))?.appProbeX, { timeout: 30_000 }).toBe("number");

  // Under real machine load the polled value above can still be mid-flight
  // (OrbitControls' own damping tick, or the camera's mount-time re-frame in
  // SceneRig.tsx settling a frame late) -- poll until two reads 100ms apart
  // agree to sub-pixel precision, so the pixel we click is the one the ring
  // is actually drawn at, not a transient one from a frame ago.
  let debug = await readDebug(page);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(100);
        const next = await readDebug(page);
        const same = Math.abs((next?.appProbeX ?? NaN) - (debug?.appProbeX ?? NaN)) < 0.01 && Math.abs((next?.appProbeY ?? NaN) - (debug?.appProbeY ?? NaN)) < 0.01;
        debug = next;
        return same;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const canvas = page.locator("[data-globe-root] canvas").first();
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");

  // The ring's own ordering (reachApps.ts's buildAppRing, "ordered by
  // installs") puts the biggest-floor app at index 0 -- exactly where the
  // probe is aimed. Computed from the real fleet, not hardcoded, so this
  // keeps holding if store.ts's data ever changes.
  const top = buildAppRing(fleet)[0];
  const panel = page.locator("[data-globe-inspector]");

  // A single click at the exact computed pixel was measured to miss the
  // ring's own raycastable geometry by anywhere from nothing to ~40px in
  // this headless/SwiftShader environment (this lane's own report; the
  // computed pixel itself checks out against the hit mesh's own
  // `matrixWorld`, so this is downstream of that, not a coordinate bug
  // here) -- a small spiral around it is the same margin a visitor's own
  // imprecise tap gets on a ring this dense, and a fast DOM read (not a
  // Playwright locator, which auto-waits the full default timeout on every
  // non-winning click) keeps the whole search sub-10s in practice.
  const selected = await clickSpiral(
    page,
    canvasBox.x + debug!.appProbeX!,
    canvasBox.y + debug!.appProbeY!,
    async () => (await page.evaluate(() => document.querySelector("[data-globe-inspector] h2")?.textContent ?? null)) === top.name,
  );
  expect(selected, `no click within the spiral around the probe selected "${top.name}"`).toBe(true);
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
