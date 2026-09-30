import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE W3 (street level: vector map, 3D buildings, street photos), wave 2.
 *
 * The real OpenFreeMap vector tiles are PBF binary and not worth mocking
 * shape-for-shape (this lane's own brief allows the fallback: mock the style
 * minimally and assert on this lane's own DOM, not on map pixels). The style
 * fetch is routed to a bare `{version:8, sources:{}, layers:[]}` document —
 * enough for MapLibre to reach its own "load" event (camera/projection math
 * needs no tile data) without requesting a single external tile, sprite or
 * glyph. Panoramax's search API is routed to a committed, trimmed REAL
 * response (e2e/fixtures/street/panoramax-pune.json — two genuine 360
 * captures from Pune, Nov 2022, CC-BY-SA-4.0, author "Devdatta").
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "street");
const puneFixture = JSON.parse(readFileSync(join(FIXTURES, "panoramax-pune.json"), "utf8"));
const emptyFixture = JSON.parse(readFileSync(join(FIXTURES, "panoramax-empty.json"), "utf8"));

const MIN_STYLE = { version: 8, name: "e2e-min-style", sources: {}, layers: [] };
const LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

async function withStreetFixtures(page: Page, photos: unknown) {
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    if (route.request().url() === LIBERTY_STYLE_URL) return route.fulfill({ json: MIN_STYLE });
    return route.fulfill({ status: 404, body: "not mocked" });
  });
  await page.route("https://api.panoramax.xyz/api/search**", (route) => route.fulfill({ json: photos }));
}

async function openStreetView(page: Page, lat: number, lon: number, photos: unknown = emptyFixture) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withStreetFixtures(page, photos);
  // This worktree has no trigger lane (Inspector "Street level here" /
  // LayerPanel "Street level at Pune") wired up — the seam this lane's own
  // brief specifies (task 9), same "read on mount" shape as Inspector.tsx's
  // own __GLOBE_TEST_SELECT__.
  await page.addInitScript(
    ({ lat, lon }) => {
      (window as unknown as { __GLOBE_TEST_STREET__: { lat: number; lon: number } }).__GLOBE_TEST_STREET__ = { lat, lon };
    },
    { lat, lon },
  );
  await page.goto("/globe");
  await waitForHydration(page);
  const streetView = page.locator("[data-street-view]");
  await expect(streetView).toBeVisible({ timeout: 15_000 });
  return streetView;
}

test("the street surface appears over the canvas at the seeded focus", async ({ page }) => {
  const streetView = await openStreetView(page, 18.5195, 73.8412, puneFixture);
  await expect(streetView).toHaveAttribute("aria-label", "Street level");
  await expect(page.locator("[data-street-map]")).toBeVisible();
  await expect(streetView).toContainText("18.5195");
  await expect(streetView).toContainText("© OpenMapTiles");
});

test("photo markers load from the fixture, and clicking one opens the viewer with author and licence", async ({ page }) => {
  const streetView = await openStreetView(page, 18.5195, 73.8412, puneFixture);
  await expect(page.locator("[data-street-status]")).toContainText("2 street photos");
  await expect(streetView).toContainText("Photos: Panoramax contributors");

  await expect
    .poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_STREET_MAP__))
    .toBe("object");

  const [lon0, lat0] = puneFixture.features[0].geometry.coordinates;
  const point = await page.evaluate(
    ([lon0, lat0]) => {
      const map = window.__GLOBE_TEST_STREET_MAP__!;
      return map.project([lon0, lat0]);
    },
    [lon0, lat0],
  );
  const mapBox = (await page.locator("[data-street-map]").boundingBox())!;
  await page.mouse.click(mapBox.x + point.x, mapBox.y + point.y);

  const viewer = page.locator("[data-street-photo-viewer]");
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText("Devdatta");
  await expect(viewer).toContainText("CC-BY-SA-4.0");
  await expect(viewer).toContainText("9 Nov 2022");
  await expect(viewer.locator("[data-street-panorama]")).toBeVisible(); // field_of_view 360 -> the three.js sphere, not a flat <img>

  // Closing the viewer alone leaves the street surface itself open.
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(streetView).toBeVisible();
});

test("no photos in the bbox says so plainly instead of showing nothing unexplained", async ({ page }) => {
  await openStreetView(page, 0, 0, emptyFixture);
  await expect(page.locator("[data-street-status]")).toContainText("No streets here");
});

// Break it once: a failed Panoramax search must show a plain failure message,
// never a silently empty or stale photo list dressed up as "no photos".
test("a failed photo search reports failure rather than an empty result", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    if (route.request().url() === LIBERTY_STYLE_URL) return route.fulfill({ json: MIN_STYLE });
    return route.fulfill({ status: 404, body: "not mocked" });
  });
  await page.route("https://api.panoramax.xyz/api/search**", (route) => route.fulfill({ status: 500, body: "boom" }));
  await page.addInitScript(() => {
    (window as unknown as { __GLOBE_TEST_STREET__: { lat: number; lon: number } }).__GLOBE_TEST_STREET__ = { lat: 18.5195, lon: 73.8412 };
  });
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-street-view]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-street-status]")).toContainText("Street photo search failed");
});

test("Back to globe closes the street surface and destroys the map", async ({ page }) => {
  const streetView = await openStreetView(page, 18.5195, 73.8412, puneFixture);
  await expect(page.locator("[data-street-map] canvas")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Back to globe" }).click();
  await expect(streetView).toHaveCount(0);
  await expect(page.locator("[data-street-map] canvas")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_STREET_MAP__)).toBe("undefined");
});

test("Esc also closes the street surface and destroys the map", async ({ page }) => {
  const streetView = await openStreetView(page, 18.5195, 73.8412, puneFixture);
  await expect(page.locator("[data-street-map] canvas")).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press("Escape");
  await expect(streetView).toHaveCount(0);
  await expect(page.locator("[data-street-map] canvas")).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => typeof window.__GLOBE_TEST_STREET_MAP__)).toBe("undefined");
});

test("the Pune-only 'Walk the valley' link appears at Pune and not elsewhere", async ({ page }) => {
  const puneView = await openStreetView(page, 18.5204, 73.8567, emptyFixture);
  await expect(puneView.getByRole("link", { name: "Walk the valley" })).toBeVisible();
  await expect(puneView.getByRole("link", { name: "Walk the valley" })).toHaveAttribute("href", "/playground");
});

test("the 'Walk the valley' link is absent away from Pune", async ({ page }) => {
  const parisView = await openStreetView(page, 48.8566, 2.3522, emptyFixture);
  await expect(parisView.getByRole("link", { name: "Walk the valley" })).toHaveCount(0);
  await expect(parisView).toContainText("2.3522");
});
