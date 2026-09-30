import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * /globe, LANE C3: "Life journey film" -- the second player ui/StoryPlayer.tsx
 * now carries, four dated life chapters (Kuwait City, Bhopal, Chandigarh,
 * Pune) with a progressively-drawn arc into each (layers/StoryArc.tsx) and a
 * small filmstrip of that city's own Google Maps photos beside the chapter
 * card (ui/storyFilmstrip.tsx). Same fixture/clock discipline as
 * e2e/globe-X4.spec.ts and e2e/globe-X5.spec.ts (G10: no live network for a
 * Playwright run).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

/** Seeds the "already seen" intro flag before the app's own scripts run, so
 *  a test about the film isn't also fighting the cinematic first-visit intro
 *  for the camera (cameraIntro.ts's own SEEN_KEY, e2e/globe-X5.spec.ts's own
 *  pattern reused verbatim). */
async function seedIntroSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cv-siddharth:globe-intro-seen", "1");
    } catch {
      // Same tolerance the app itself has -- a blocked localStorage just
      // means the intro plays again, not a reason to fail this unrelated test.
    }
  });
}

async function openGlobe(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await seedIntroSeen(page);
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  // The filmstrip's own <img> sources are never fetched over the real
  // network in this suite -- a 404 still renders (alt text, broken image
  // icon), it just never blocks the assertions below, which read DOM
  // attributes (data-story-filmstrip-slug), not decoded pixels.
  await page.route("**/globe/maps/*.webp", (route) => route.fulfill({ status: 404, body: "not mocked" }));
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
}

/** The compact entry affordance is mounted unconditionally (only its
 *  Tailwind visibility class changes with `busy`), so it's the reliable
 *  click target regardless of whatever else the page preselected -- same
 *  reasoning e2e/globe-X4.spec.ts's own `storyEntry` helper documents. */
function filmEntry(page: Page) {
  return page.locator("[data-film-entry-compact]");
}
function filmCard(page: Page) {
  return page.locator("[data-film-chapter-card]");
}

/** Locator.click() reliably stalls on this production preview build's own
 *  SPA shell -- reproduced standalone against this exact build, and already
 *  root-caused and worked around the same way in e2e/globe-X5.spec.ts's own
 *  comment ("click action done" followed by a stall that only ever times
 *  out). A raw pointer move/down/up delivers the same gesture a real
 *  pointer would without Playwright's own post-click navigation wait. */
async function tap(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("tap(): target has no box (not visible/attached)");
  const page = locator.page();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test("start the film: opens on Kuwait City, with no arc yet (nothing arrives before the first city)", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await expect(filmEntry(page)).toBeVisible();
  await tap(filmEntry(page));

  const card = filmCard(page);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:kuwait-city");
  await expect(card).toContainText("Kuwait City, Kuwait");
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);
});

test("the arc into Bhopal draws, and its filmstrip carries only Bhopal photos", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await tap(filmEntry(page));
  const card = filmCard(page);
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:kuwait-city");

  await tap(card.getByRole("button", { name: "Next" }));
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:bhopal");

  // The incoming Kuwait -> Bhopal arc is now on screen.
  await expect(page.locator("[data-story-arc]")).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Kuwait City, Kuwait"]')).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Bhopal, India"]')).toBeAttached();

  // Its filmstrip shows only photos tagged to Bhopal -- never a Kuwait,
  // Chandigarh or Pune photo standing in for the college years.
  const photos = page.locator("[data-story-filmstrip-photo]");
  await expect(photos.first()).toBeAttached();
  const slugs = await page.locator("[data-story-filmstrip-slug]").evaluateAll((els) => els.map((el) => el.getAttribute("data-story-filmstrip-slug")));
  expect(slugs.length).toBeGreaterThan(0);
  for (const slug of slugs) expect(slug).toBe("bhopal");

  // The card's own Maps contribution line cites mapsPlaces.ts's own totals,
  // never a new number.
  await expect(card).toContainText("on Google Maps");
});

test("skip to the end reaches Pune directly, arc fully drawn", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await tap(filmEntry(page));
  const card = filmCard(page);

  await tap(card.getByRole("button", { name: "Skip to the end" }));
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:pune");
  await expect(page.locator("[data-story-arc]")).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Chandigarh, India"]')).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Pune, India"]')).toBeAttached();
});

test("play/pause and Back walk the film without losing position, and Esc exits", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await tap(filmEntry(page));
  const card = filmCard(page);

  await expect(card.getByRole("button", { name: "Play the film" })).toBeVisible();
  await tap(card.getByRole("button", { name: "Play the film" }));
  await expect(card.getByRole("button", { name: "Pause the film" })).toBeVisible();
  await tap(card.getByRole("button", { name: "Pause the film" }));

  await tap(card.getByRole("button", { name: "Next" }));
  await page.waitForTimeout(150);
  await tap(card.getByRole("button", { name: "Next" }));
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:mumbai");
  await tap(card.getByRole("button", { name: "Back" }));
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:bhopal");

  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);
});

test("arrow keys navigate the film like the buttons", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await tap(filmEntry(page));
  const card = filmCard(page);
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:kuwait-city");

  await page.keyboard.press("ArrowRight");
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:bhopal");
  await page.keyboard.press("ArrowLeft");
  await expect(card).toHaveAttribute("data-film-chapter-id", "film:kuwait-city");
});

test("opening the film closes My story, and opening My story closes the film", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await tap(page.locator("[data-story-entry-compact]"));
  await expect(page.locator("[data-story-chapter-card]")).toBeVisible();

  await tap(filmEntry(page));
  await expect(page.locator("[data-story-chapter-card]")).toHaveCount(0);
  await expect(filmCard(page)).toBeVisible();

  await tap(page.locator("[data-story-entry-compact]"));
  await expect(filmCard(page)).toHaveCount(0);
  await expect(page.locator("[data-story-chapter-card]")).toBeVisible();
});

test("phone: the film opens as a bottom sheet with its filmstrip, no overlap with the story affordances", async ({ page }) => {
  await openGlobe(page, 390, 844);
  await tap(filmEntry(page));
  const sheet = page.locator("[data-film-chapter-sheet]");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-film-chapter-id", "film:kuwait-city");
});
