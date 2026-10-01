import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * WAVE 7 LANE 8 (eclipse paths on the time machine). Fixed clock, every
 * /api/* the base page touches routed to a fixture (G10) -- this lane's own
 * layer makes no network call at all, astronomy-engine runs entirely
 * client-side, so nothing here needs a new fixture.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

async function openGlobe(page: Page, fixedTime: Date) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(fixedTime);
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

test.describe("eclipse paths layer", () => {
  test("off by default; turning it on reports the next eclipse and a real path", async ({ page }) => {
    // A week before the 2027-08-02 greatest eclipse: not live time inside the
    // eclipse, so this also proves the layer finds an UPCOMING eclipse
    // without needing to already be inside one.
    await openGlobe(page, new Date("2027-07-26T12:00:00Z"));

    const toggle = page.getByRole("button", { name: "Eclipse paths" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    const seam = page.locator("[data-eclipse-layer]");
    await expect(seam).toBeAttached({ timeout: 15_000 });
    await expect(seam).toHaveAttribute("data-eclipse-kind", "total", { timeout: 15_000 });
    await expect(seam).toHaveAttribute("data-eclipse-peak", /2027-08-02T10:06/);
    // Not inside the eclipse a week out.
    await expect(seam).toHaveAttribute("data-eclipse-live", "false");
    // A real stepped path, not a single point (umbraTrack.test.ts covers the
    // exact geometry; this only proves the layer actually built and mounted
    // it instead of silently rendering nothing).
    await expect
      .poll(async () => Number((await seam.getAttribute("data-eclipse-track-count")) ?? "0"), { timeout: 15_000 })
      .toBeGreaterThan(10);
  });

  test("shows a live umbra position exactly at the greatest-eclipse instant", async ({ page }) => {
    // NASA GSFC's published greatest-eclipse instant for 2027-08-02
    // (eclipse.test.ts's own fixture, same source).
    await openGlobe(page, new Date("2027-08-02T10:06:37.700Z"));
    await page.getByRole("button", { name: "Eclipse paths" }).click();

    const seam = page.locator("[data-eclipse-layer]");
    await expect(seam).toHaveAttribute("data-eclipse-live", "true", { timeout: 15_000 });
    const lat = Number(await seam.getAttribute("data-eclipse-live-lat"));
    const lon = Number(await seam.getAttribute("data-eclipse-live-lon"));
    // NASA GSFC: 25deg30.3'N, 033deg11.0'E -- within a couple of degrees is
    // enough here (the tight 0.5 deg bound is eclipse.test.ts's job); this
    // only proves the live disc reads the real computed point, not a stub.
    expect(Math.abs(lat - 25.5)).toBeLessThan(2);
    expect(Math.abs(lon - 33.18)).toBeLessThan(2);
  });
});

test.describe("time scrubber: Next eclipse jump", () => {
  test("loads astronomy-engine lazily and jumps the simulated clock to the greatest eclipse", async ({ page }) => {
    await openGlobe(page, new Date("2026-09-29T12:00:00Z"));

    // The chunk is not fetched until the button is actually clicked (this
    // lane's own "import it ONLY from lazy chunks" rule) -- checked by real
    // requests, same technique as spine-payload.spec.ts's own FloatingChat
    // check, not network-idle timing (a flake magnet).
    const eclipseChunkUrls: string[] = [];
    page.on("request", (r) => {
      if (/[Ee]clipse-/.test(r.url())) eclipseChunkUrls.push(r.url());
    });
    await page.waitForTimeout(500);
    expect(eclipseChunkUrls, `eclipse chunk requested before the jump was clicked:\n${eclipseChunkUrls.join("\n")}`).toEqual([]);

    // Keyboard, not a mouse click: measured (this lane's own report) that
    // ExploreBar's reserved centre band (Globe.tsx, not owned by this lane)
    // already overlaps this row's rightmost ~45px even with the eclipse
    // button removed entirely (x 531.5 vs the row's own x 574.5) -- a real,
    // pre-existing composition gap this lane's one small icon button did not
    // create. Focusing and pressing Enter proves the button is keyboard-
    // reachable (a house requirement either way) without depending on a
    // mouse hit-test this lane cannot fix from inside TimeScrubber.tsx alone.
    const jumpButton = page.getByRole("button", { name: "Next eclipse" });
    await expect(jumpButton).toBeVisible();
    await jumpButton.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => eclipseChunkUrls.length, { timeout: 15_000 }).toBeGreaterThan(0);

    // The scrubber's own not-live badge and UTC clock readout prove the jump
    // actually moved simulated time to the next eclipse's greatest instant
    // (2027-02-06T15:59:32.957Z, computed with nextGlobalEclipses from
    // 2026-09-29T12:00:00Z),
    // not just fetched the chunk.
    await expect(page.locator("[data-globe-not-live]")).toBeVisible({ timeout: 15_000 });
    const scrubber = page.locator("[data-globe-time-scrubber]");
    await expect(scrubber).toContainText("15:59 UTC", { timeout: 15_000 });
  });
});
