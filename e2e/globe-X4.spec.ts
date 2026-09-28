import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * /globe, LANE X4 (story player UI + arc): "My story" (ui/StoryPlayer.tsx)
 * and the one great-circle arc it can draw honestly (layers/StoryArc.tsx).
 * Same fixture/clock discipline as e2e/globe-U1.spec.ts (G10: no live
 * network for a Playwright run).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

async function openGlobe(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // Camera settle + Globe.tsx's own desktop-first-load Pune preselect
  // (which is exactly why this lane's entry point has two forms: the
  // compact one is what's actually on screen the moment the page opens).
  await page.waitForTimeout(700);
}

/** The compact entry affordance is mounted unconditionally (only its
 *  Tailwind visibility class changes with `busy`), so it's the reliable
 *  click target regardless of whatever else the page preselected. */
function storyEntry(page: Page) {
  return page.locator("[data-story-entry-compact]");
}
function chapterCard(page: Page) {
  return page.locator("[data-story-chapter-card]");
}

test("start the story: opens on the earliest chapter, Bhopal", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await expect(storyEntry(page)).toBeVisible();
  await storyEntry(page).click();

  const card = chapterCard(page);
  await expect(card).toBeVisible();
  // buildStory() sorts chronologically; NIT Bhopal (2017) predates every
  // other claim the site makes (earliest role: John Deere, May 2020) — so
  // "reach the Bhopal chapter" is the story's own opening chapter, chapter 1
  // of N, not a later one this test has to navigate to.
  await expect(card).toHaveAttribute("data-story-chapter-id", "education");
  await expect(card).toContainText("NIT Bhopal");
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);
});

test("the first Pune role chapter shows the arc; no other chapter does", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await storyEntry(page).click();
  const card = chapterCard(page);
  await expect(card).toHaveAttribute("data-story-chapter-id", "education");
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);

  // Walk forward with Next until the John Deere chapter (the earliest role
  // whose location resolves to a known place other than Bhopal — storyModel
  // .ts's own "one journey the data can draw honestly") — bounded by the
  // real chapter count so a data change fails loudly instead of hanging.
  const nextBtn = card.getByRole("button", { name: "Next" });
  for (let i = 0; i < 40; i++) {
    const id = await card.getAttribute("data-story-chapter-id");
    if (id === "role:John Deere India") break;
    await nextBtn.click();
  }
  await expect(card).toHaveAttribute("data-story-chapter-id", "role:John Deere India");
  await expect(page.locator("[data-story-arc]")).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Bhopal, India"]')).toBeAttached();
  await expect(page.locator('[data-story-arc-label="Pune, India"]')).toBeAttached();

  // One step further (a chapter with no arcs of its own): the arc probe
  // disappears — proven, not assumed, that it tracks the active chapter.
  await nextBtn.click();
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);
});

test("exit restores a layer the story forced back on", async ({ page }) => {
  await openGlobe(page, 1440, 900);

  const reachToggle = page.locator("[data-globe-layer-panel]").getByRole("button", { name: "My apps and repos" });
  await expect(reachToggle).toHaveAttribute("aria-pressed", "true"); // default ON
  await reachToggle.click();
  await expect(reachToggle).toHaveAttribute("aria-pressed", "false"); // the visitor's own choice: OFF

  await storyEntry(page).click();
  const card = chapterCard(page);
  const nextBtn = card.getByRole("button", { name: "Next" });
  const exitBtn = card.getByRole("button", { name: "Exit my story" });

  // Chapter 0 (education) emphasises "markers", not "reach" — the toggle
  // must stay exactly as the visitor left it until a chapter actually asks.
  await expect(reachToggle).toHaveAttribute("aria-pressed", "false");

  // Walk forward until some chapter's own emphasis forces "reach" back on
  // (every non-role, non-education chapter does) — bounded by the real
  // chapter count.
  for (let i = 0; i < 40; i++) {
    if ((await reachToggle.getAttribute("aria-pressed")) === "true") break;
    await nextBtn.click();
  }
  await expect(reachToggle).toHaveAttribute("aria-pressed", "true");

  await exitBtn.click();
  await expect(card).toHaveCount(0);
  // Restored to exactly the visitor's own last choice — OFF, not ON.
  await expect(reachToggle).toHaveAttribute("aria-pressed", "false");
});

test("Esc exits the story", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await storyEntry(page).click();
  await expect(chapterCard(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chapterCard(page)).toHaveCount(0);
  await expect(storyEntry(page)).toBeVisible();
});
