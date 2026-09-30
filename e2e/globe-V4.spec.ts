import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { localTime } from "../src/world/globe/exploreMath.ts";
import { buildWindField, sampleWind } from "../src/world/globe/layers/windField.ts";
import { windLabel } from "../src/world/globe/ui/hoverReadout.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 7 LANE V4 (hover readout) -- e2e. Fixed clock, every feed routed to a
 * committed fixture (G10). Content assertions go through the `__V4_HOVER__`
 * seam (the W11 pattern -- CountryLayer.tsx's own `__W11_COUNTRY__`): it
 * feeds a lat/lon straight to the same code path a real hover runs, so the
 * assertions don't depend on reverse-engineering the camera's exact screen
 * projection. The "0 network requests" case instead drives real
 * `page.mouse.move` calls over the canvas, since that assertion cares about
 * request counts, not which lat/lon a given pixel happens to land on.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const windFixture = JSON.parse(readFileSync(join(FIXTURES, "wind", "wind-2026-09-28.json"), "utf8"));
// The default `/globe` base imagery (globeStore.ts's default `imagery.base`)
// fetches real WMS GetMap + WMTS tiles from gibs.earthdata.nasa.gov whether
// or not anyone ever hovers -- e2e/globe-W1.spec.ts's own fixtures, reused
// here (read-only) rather than duplicated, so this file's "zero requests"
// count isn't measuring live external network flakiness that has nothing to
// do with hovering.
const GIBS_TILE_JPG = readFileSync(join(FIXTURES, "wmts", "tile-base.jpg"));
const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));

// Mumbai -- safely inside India's coarse Natural Earth polygon, and far from
// any border a 110m simplification could round differently.
const MUMBAI = { lat: 19.076, lon: 72.8777 };
const NOW = new Date("2026-09-28T12:00:00+05:30");

const NEAR_QUAKE = { id: "near", properties: { mag: 5.5, place: "near Mumbai fixture", time: NOW.getTime(), url: "" }, geometry: { type: "Point", coordinates: [MUMBAI.lon + 0.1, MUMBAI.lat + 0.1, 10] } };
// New York -- thousands of km from Mumbai, well past the 300km cutoff.
const FAR_QUAKE = { id: "far", properties: { mag: 6.1, place: "far NYC fixture", time: NOW.getTime(), url: "" }, geometry: { type: "Point", coordinates: [-74.006, 40.7128, 10] } };

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(() => { window.__W11_TEST__ = true; });
  // Playwright dispatches to the MOST RECENTLY registered matching route
  // first, so the specific overrides go last -- a catch-all registered
  // after `**/api/wind` would otherwise win and 503 it too.
  await page.routeWebSocket(/^wss?:\/\//, socket => socket.close());
  await page.route("https://**", route => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/wind", (route) => route.fulfill({ json: windFixture }));
  await page.route("https://earthquake.usgs.gov/**", (route) => route.fulfill({ json: { type: "FeatureCollection", features: [NEAR_QUAKE, FAR_QUAKE] } }));
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => route.fulfill({ contentType: "image/jpeg", body: GIBS_DAY_JPG }));
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => route.fulfill({ contentType: "image/jpeg", body: GIBS_TILE_JPG }));
  // LANE P10C settled-hover fetches (HoverReadout.tsx's tide/CAPE rows):
  // neither host matches the `**/api/**` catch-all above (they are external
  // NOAA/Open-Meteo hosts, not this app's own /api/ routes), so without
  // these two mocks a slow settled hover in CI would reach the real internet.
  await page.route("https://api.tidesandcurrents.noaa.gov/**", (route) => route.fulfill({ json: { stations: [] } }));
  await page.route("https://api.open-meteo.com/**", (route) => {
    const at = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString().slice(0, 16);
    return route.fulfill({ json: { hourly: { time: [at], cape: [500] } } });
  });
  // LANE S3's marine/air-quality/flood rows share HoverReadout's ONE
  // hoverFetchGate with tide/cape (pollCell's own comment: "one shared
  // timestamp gate across all three domains"). These three tick on every
  // hover frame regardless of settling, so leaving them unmocked would have
  // a real, unmocked fetch hold that shared gate for however long the real
  // network takes - the file's own G10 header ("no live network for a
  // Playwright run") already promised this, this just closes the gap now
  // that a settled hover exercises the same shared gate these do.
  await page.route("https://marine-api.open-meteo.com/**", (route) => route.fulfill({ json: { current: {} } }));
  await page.route("https://air-quality-api.open-meteo.com/**", (route) => route.fulfill({ json: { current: {} } }));
  await page.route("https://flood-api.open-meteo.com/**", (route) => route.fulfill({ json: { daily: { river_discharge: [] } } }));
  await page.addInitScript(() => localStorage.setItem("cv-siddharth:globe-intro-seen", "1"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__V4_HOVER__);
}

test("hovering a point in India shows country, solar time, wind and the nearest quake", async ({ page }) => {
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);

  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();
  await expect(chip.locator("[data-hover-country]")).toHaveText("India");
  await expect(chip.locator("[data-hover-time]")).toHaveText(localTime(NOW, MUMBAI.lon));

  const field = buildWindField(windFixture.grid, windFixture.u, windFixture.v);
  const w = sampleWind(field, MUMBAI.lat, MUMBAI.lon);
  const { speed, compass } = windLabel(w.u, w.v);
  const expectedWind = compass === "calm" ? "Calm" : `${speed.toFixed(1)} m/s toward ${compass}`;
  await expect(chip.locator("[data-hover-wind]")).toHaveText(expectedWind);

  // NEAR_QUAKE sits ~15.7km from Mumbai (0.1deg lat+lon at this latitude);
  // FAR_QUAKE (New York) is outside the 300km cutoff and must not win.
  await expect(chip.locator("[data-hover-quake]")).toHaveText(/^M5\.5 · \d+ km away$/);

  await page.evaluate(() => window.__V4_HOVER__!.leave());
  await expect(chip).toHaveCount(0);
});

// The globe scene lazy-loads ~20 sibling layers (satellites, wind, hazards,
// sky, tiles, ...), each its own code-split chunk plus its own first
// live-signal tick, none of it caused by hovering, and (measured directly:
// a bare request log over this exact flow, before this filter existed)
// still landing after "canvas visible" and "hover seam present" -- under
// real machine contention this can run long enough that
// `page.waitForLoadState("networkidle")` never finds a clean 500ms gap
// either (tried first; see a11y.spec.ts's own note on the same trap for a
// different reason). HoverReadout's actual contract (its own file-level
// comment) is that it only ever READS data another mounted layer already
// fetched -- the one regression this assertion exists to catch is a hover
// handler that calls `fetch` itself (a reverse-geocode, a weather lookup),
// which would show up as a same-origin non-asset request or a new external
// host, neither of which any known lazy layer's mount-time chunk or first
// poll can produce.
const MOUNT_TIME_NOISE = [
  /^https?:\/\/localhost(:\d+)?\/assets\//, // code-split layer chunks
  /^https?:\/\/localhost(:\d+)?\/sky\//, // star/moon static binaries
  /^https?:\/\/localhost(:\d+)?\/api\//, // openGlobe's own `**/api/**` catch-all
  /^https:\/\/earthquake\.usgs\.gov\//, // HazardLayer's own quake poll
  /^https:\/\/eonet\.gsfc\.nasa\.gov\//,
  /^https:\/\/www\.gdacs\.org\//,
  /^https:\/\/services\.swpc\.noaa\.gov\//,
  /^https:\/\/ll\.thespacedevs\.com\//,
  /^https:\/\/gibs\.earthdata\.nasa\.gov\//, // base-imagery WMS/WMTS, mocked above -- EarthImagery/TileLayer's own mount cost, not HoverReadout's
  /^https:\/\/api\.tidesandcurrents\.noaa\.gov\/mdapi\//, // HoverReadout's loadStations(): one mount-time singleton fetch, not per-hover
  /^https:\/\/mapservices\.weather\.noaa\.gov\//, // HazardLayer's own NHC hurricane-cone poll (feedUrls.ts) - mount/interval cost, not HoverReadout's
];

test("50 pointer moves over the globe trigger zero network requests", async ({ page }) => {
  await openGlobe(page);
  // Warm up the one-time country index fetch (same-origin, not `/api/**` or
  // `https://`, so untouched by this file's own routes) before the count
  // starts, matching the plan's "zero requests per hover" -- the initial
  // load is a mount-time cost, not a per-move one.
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  await expect(page.locator("[data-hover-readout]")).toBeVisible();

  const requests: string[] = [];
  page.on("request", (req) => { requests.push(req.url()); });
  const canvas = page.locator("[data-globe-root] canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  // Dispatch all 50 real inputs without paying a software-rendered frame
  // round trip between each one. Await every dispatch before checking.
  await Promise.all(Array.from({ length: 50 }, (_, i) =>
    page.mouse.move(box.x + box.width / 2 + (i % 20) - 10, box.y + box.height / 2 + (i % 14) - 7)));
  const hoverCaused = requests.filter((u) => !MOUNT_TIME_NOISE.some((p) => p.test(u)));
  expect(hoverCaused, `hovering triggered network requests:\n${hoverCaused.join("\n")}`).toEqual([]);
});

test("the chip hides while dragging (the button-held guard), then reappears on release", async ({ page }) => {
  await openGlobe(page);
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  const chip = page.locator("[data-hover-readout]");
  await expect(chip).toBeVisible();

  const canvas = page.locator("[data-globe-root] canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy); // a real drag: surfaceHover's own guard, broken by an actual orbit drag
  await expect(chip).toHaveCount(0);
  await page.mouse.up();

  // Guard restored: a fresh hover (not a drag) shows the chip again.
  await page.evaluate((p) => window.__V4_HOVER__!.move(p), MUMBAI);
  await expect(chip).toBeVisible();
});

// LANE P10C widened the "zero requests" contract above: it added
// settled-hover fetches (tide/CAPE, HoverReadout.tsx's own comment) on top
// of the always-zero wind/quake reads. The real contract is now two-sided:
// a MOVING pointer never fetches (asserted above and again here, with real
// mouse moves rather than the synthetic seam so surfaceHover's own path is
// exercised), and a SETTLED pointer fetches at most once per cell inside
// its cache window, never once per animation-frame tick even though `tick`
// keeps re-scheduling itself every frame while hovering (its own comment).
test("a settled hover fetches CAPE once; a moving hover fetches nothing", async ({ page }) => {
  // Unlike this file's other tests (all driven through the __V4_HOVER__
  // seam, immune to camera movement), this one drives a REAL mouse
  // position over the canvas - auto-rotate would keep drifting the
  // raycast under a genuinely still cursor, so the "settled" cell would
  // never actually settle. reducedMotion freezes it, same as every other
  // globe spec that holds a real screen position steady.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGlobe(page);
  const capeRequests: string[] = [];
  page.on("request", (req) => { if (/^https:\/\/api\.open-meteo\.com\//.test(req.url())) capeRequests.push(req.url()); });

  // Real mouse moves throughout (never the __V4_HOVER__ seam): surfaceHover
  // tracks the real pointer every frame, and mixing a synthetic seam call
  // into a test that also drives real moves fights that per-frame raycast
  // for control of `hoverPoint.current` - one path or the other, not both.
  const canvas = page.locator("[data-globe-root] canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");
  const cy = box.y + box.height / 2 - 40;
  // Continuously moving: every step lands in a different 0.5deg cell
  // (hoverCellKey), so `settled.since` keeps resetting and the 600ms
  // settle floor is never reached.
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 15, cy);
  }
  expect(capeRequests, "moving the pointer must never itself trigger a CAPE request").toEqual([]);

  // Settle: one last move, then hold still past the 600ms floor. This
  // file freezes the clock (openGlobe's own setFixedTime, up top) so
  // `Date.now()` inside HoverReadout's tick() never advances on its own -
  // a real wall-clock wait here would poll forever. Nudging the frozen
  // clock forward (still a real value HoverReadout reads on its next real
  // rAF tick) is what actually satisfies the 600ms settle floor.
  // The frozen clock (openGlobe's own setFixedTime) means Date.now() inside
  // HoverReadout never advances on its own, so pollCell's shared
  // hoverFetchGate has to be nudged forward by hand. Marine/air-quality/
  // flood all queue on the SAME gate ahead of tide/cape in source order
  // (pollCell's own "one shared timestamp gate" comment) and none of them
  // had a cache entry yet for this cell (the moving phase above visited
  // ten different cells, never staying long enough for any domain to
  // finish queueing), so each needs its own turn at the gate before CAPE
  // gets one - repeatedly bumping the clock inside the poll, rather than
  // one big jump, lets each domain's pollCell call claim and release the
  // gate in its own tick instead of all landing on the same frozen instant.
  const settleX = box.x + box.width / 2 + 9 * 15;
  await page.mouse.move(settleX, cy);
  let bump = 0;
  await expect.poll(async () => {
    bump += 1600;
    await page.clock.setFixedTime(new Date(NOW.getTime() + bump));
    return capeRequests.length;
  }, { timeout: 15_000, intervals: [200] }).toBe(1);

  // Stay settled well past another 1.5s gate window: the per-cell cache,
  // not the gate, is what keeps this at one -- a naive "refetch every gate
  // window" bug would show up here as a second request.
  await page.clock.setFixedTime(new Date(NOW.getTime() + bump + 1700));
  await page.waitForTimeout(500);
  expect(capeRequests.length, "the same settled cell must not refetch inside its cache window").toBe(1);
});
