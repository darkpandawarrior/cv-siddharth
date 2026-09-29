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

test("start the story: opens on the earliest chapter, Kuwait City", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await expect(storyEntry(page)).toBeVisible();
  await storyEntry(page).click();

  const card = chapterCard(page);
  await expect(card).toBeVisible();
  // buildStory() sorts chronologically and inserts the life-places chapters
  // first (storyModel.ts, lane T1) so a same-year tie (Kuwait's departure and
  // NIT Bhopal's start both read 2017) resolves stably to Kuwait first — the
  // owner's own account of where he grew up predates every claim about where
  // he studied or worked. "reach the Kuwait chapter" is the story's own
  // opening chapter, chapter 1 of N, not a later one this test navigates to.
  await expect(card).toHaveAttribute("data-story-chapter-id", "life:kuwait-city");
  await expect(card).toContainText("Grew up in Kuwait and finished school here");
  // The Kuwait chapter itself carries no arc — the Kuwait->Bhopal journey is
  // drawn on the NEXT chapter it leads into (education), not this one.
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);
});

test("the life path draws one arc per transition; role chapters never carry one", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await storyEntry(page).click();
  const card = chapterCard(page);
  await expect(card).toHaveAttribute("data-story-chapter-id", "life:kuwait-city");
  await expect(page.locator("[data-story-arc]")).toHaveCount(0);

  const nextBtn = card.getByRole("button", { name: "Next" });
  // storyModel.ts (lane T1) puts the arcs on the life path itself, one per
  // transition, never on a role chapter: Kuwait City -> Bhopal lands on the
  // education chapter (the destination of that move), Bhopal -> Chandigarh
  // on the Chandigarh life chapter, Chandigarh -> Pune on the Pune life
  // chapter. buildStory()'s real chronological order interleaves
  // role:John Deere India (May 2020) between education and life:chandigarh
  // (chapters sort by date, and John Deere predates the 2021 Chandigarh
  // move), so this walk checks it there, in its real position, rather than
  // searching forward for it after the fact -- Next only ever moves
  // forward, and by life:pune the walk has already passed it.
  const path: Array<{ id: string; from?: string; to?: string }> = [
    { id: "education", from: "Kuwait City, Kuwait", to: "Bhopal, India" },
    { id: "role:John Deere India" }, // role chapter: no arc of its own
    { id: "life:chandigarh", from: "Bhopal, India", to: "Chandigarh, India" },
    { id: "life:pune", from: "Chandigarh, India", to: "Pune, India" },
  ];
  for (const { id, from, to } of path) {
    for (let i = 0; i < 40; i++) {
      const current = await card.getAttribute("data-story-chapter-id");
      if (current === id) break;
      await nextBtn.click();
    }
    await expect(card).toHaveAttribute("data-story-chapter-id", id);
    if (from && to) {
      await expect(page.locator("[data-story-arc]")).toBeAttached();
      await expect(page.locator(`[data-story-arc-label="${from}"]`)).toBeAttached();
      await expect(page.locator(`[data-story-arc-label="${to}"]`)).toBeAttached();
    } else {
      await expect(page.locator("[data-story-arc]")).toHaveCount(0);
    }
  }
});

test("exit restores a layer the story forced back on", async ({ page }) => {
  await openGlobe(page, 1440, 900);

  const markersToggle = page.locator("[data-globe-layer-panel]").getByRole("button", { name: "Pune markers" });
  await expect(markersToggle).toHaveAttribute("aria-pressed", "true");
  await markersToggle.click();
  await expect(markersToggle).toHaveAttribute("aria-pressed", "false");

  await storyEntry(page).click();
  const card = chapterCard(page);
  await expect(card).toHaveAttribute("data-story-chapter-id", "life:kuwait-city");
  // The opening place chapter explicitly emphasises markers. This proves
  // restoration without walking unrelated chapters to find a reach event.
  await expect(markersToggle).toHaveAttribute("aria-pressed", "true");

  await card.getByRole("button", { name: "Exit my story" }).click();
  await expect(card).toHaveCount(0);
  await expect(markersToggle).toHaveAttribute("aria-pressed", "false");
});

test("Esc exits the story", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await storyEntry(page).click();
  await expect(chapterCard(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chapterCard(page)).toHaveCount(0);
  // enter() clears the desktop preselect (select(null)), so `busy` is false
  // post-exit and the component correctly swaps to the full left-column
  // pill instead of the compact fallback it opened from. Both buttons stay
  // mounted (only a Tailwind visibility class differs), so a plain OR
  // locator resolves to 2 elements and trips Playwright's strict mode --
  // the :visible pseudo-class narrows it to whichever one actually renders.
  await expect(page.locator("[data-story-entry]:visible, [data-story-entry-compact]:visible")).toBeVisible();
});
