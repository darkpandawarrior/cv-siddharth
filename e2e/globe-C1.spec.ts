import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE C1 ("Share a view"): the address-bar URL state, the Share button,
 * and the postcard PNG export. Fixed clock, every /api/* route mocked
 * (G10, same discipline as e2e/globe.spec.ts) -- this spec never depends on
 * a live network, and the intro-seen flag is seeded so a share link's own
 * fly-in is the only camera animation in play (globe-X5.spec.ts's own
 * `seedIntroSeen` pattern, restated per this lane's file ownership).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));
const GIBS_DAY_JPG = readFileSync(join(FIXTURES, "gibs", "gibs-day.jpg"));
const TILE_BASE_JPG = readFileSync(join(FIXTURES, "wmts", "tile-base.jpg"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  // This lane's own postcard/share surface doesn't touch imagery at all, but
  // the default earth style renders real GIBS tiles regardless -- routed to
  // committed fixtures (same images globe-V1.spec.ts already uses) so this
  // spec never depends on a live NASA/EOX network or gets caught behind
  // another lane's rate limit on this shared machine (measured: unmocked,
  // the postcard capture hung well past 30s under concurrent tile traffic).
  await page.route("https://gibs.earthdata.nasa.gov/wms/**", (route) => route.fulfill({ contentType: "image/jpeg", body: GIBS_DAY_JPG }));
  await page.route("https://gibs.earthdata.nasa.gov/wmts/**", (route) => route.fulfill({ contentType: "image/jpeg", body: TILE_BASE_JPG }));
  await page.route("https://tiles.maps.eox.at/**", (route) => route.fulfill({ contentType: "image/jpeg", body: TILE_BASE_JPG }));
}

async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has -- a blocked localStorage just
      // means the intro plays again, not a reason to fail this spec.
    }
  });
}

test.describe("share link round trip", () => {
  test("opening a link with view/layers/time in the query restores exactly that state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" }); // no scenic fly-in to wait out -- only the end state matters here
    await withApiFixtures(page);
    await seedIntroSeen(page);
    await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));

    // markers stays on (it's on by default too -- confirms the explicit
    // path, not just an unchanged default), countries flips ON (default
    // off) and satellites is left OUT of `ly` so it must flip OFF (default
    // on) -- two real state changes, not one.
    const qs = new URLSearchParams({
      lat: "13.0827",
      lon: "80.2707",
      alt: "30",
      view: "ground",
      t: "-120",
      ly: "markers,countries",
    }).toString();
    await page.goto(`/globe?${qs}`);
    await waitForHydration(page);

    const canvas = page.locator("[data-globe-root] canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 15_000 }).toBe("ground");

    // Layer panel is open by default at this width (globeStore's own
    // matchMedia default, >= 1280).
    await expect(page.getByRole("button", { name: "Pune markers" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Countries" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Satellites" })).toHaveAttribute("aria-pressed", "false");

    // A nonzero time offset shows TimeScrubber's own "not live" badge.
    await expect(page.locator("[data-globe-not-live]").first()).toBeVisible({ timeout: 15_000 });

    // The address bar itself still carries the (possibly re-normalised)
    // query -- the debounced writer never blanks it out on load.
    await expect.poll(() => new URL(page.url()).searchParams.get("view"), { timeout: 5_000 }).toBe("ground");
  });

  test("a malformed link is ignored: the app loads at its ordinary defaults", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withApiFixtures(page);
    await seedIntroSeen(page);
    await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));

    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    const qs = [
      "lat=not-a-number",
      "lon=Infinity",
      "alt=-9999999",
      "view=<script>alert(1)</script>",
      "t=NaN",
      "ly=hack,'; DROP TABLE",
      "base=" + encodeURIComponent("<img src=x onerror=alert(1)>"),
      "sel=" + "%00".repeat(20),
    ].join("&");
    await page.goto(`/globe?${qs}`);
    await waitForHydration(page);

    const canvas = page.locator("[data-globe-root] canvas").first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    // Every field above was garbage, so the store's own defaults hold:
    // orbit view, no "not live" badge (offset stayed 0).
    await expect.poll(async () => canvas.getAttribute("data-camera-view"), { timeout: 15_000 }).toBe("orbit");
    await expect(page.locator("[data-globe-not-live]")).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("share button", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("Copy link shows 'Link copied' and puts a real /globe URL on the clipboard", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withApiFixtures(page);
    await seedIntroSeen(page);
    await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
    await page.goto("/globe");
    await waitForHydration(page);
    await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });

    const shareButton = page.locator("[data-share-button]");
    await expect(shareButton).toBeVisible({ timeout: 15_000 });
    await shareButton.click();
    await page.locator("[data-share-copy]").click();

    await expect(page.locator("[data-share-status]")).toHaveText("Link copied", { timeout: 5_000 });
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("/globe?");
    expect(clipboardText).toContain("view=");
  });
});

test.describe("postcard export", () => {
  test("Download postcard produces a non-empty PNG", async ({ page }) => {
    // capturePostcard's own canvas.toBlob readback is a real GPU pixel
    // read, not React work -- measured on this shared machine under
    // software-rendered WebGL (swiftshader) plus concurrent build load, that
    // readback alone can take tens of seconds ("GPU stall due to ReadPixels"
    // in the browser's own driver log). A generous budget here is honest
    // about that cost, not a mask for a hang: the default 30s test timeout
    // is tuned for DOM/network waits, not a raw pixel-readback path.
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withApiFixtures(page);
    await seedIntroSeen(page);
    await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
    await page.goto("/globe");
    await waitForHydration(page);
    await expect(page.locator("[data-globe-root] canvas").first()).toBeVisible({ timeout: 30_000 });

    await page.locator("[data-share-button]").click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.locator("[data-postcard-download]").click()]);

    expect(download.suggestedFilename()).toMatch(/^siddharth-globe-.*\.png$/);
    const streamPath = await download.path();
    expect(streamPath).toBeTruthy();
    const bytes = readFileSync(streamPath!);
    expect(bytes.length).toBeGreaterThan(0);
    // PNG magic bytes -- a real image, not an empty or truncated file.
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await expect(page.locator("[data-share-status]")).toHaveText("Postcard saved", { timeout: 5_000 });
  });
});
