import { test, expect, waitForHydration } from "./lib/test.ts";
import { photonFixture, reverseFixture, weatherFixture } from "./fixtures/explore/exploreFixtures.ts";
import type { Page } from "@playwright/test";

/**
 * LANE X2 ("ONE BOX"): ExploreBar.tsx's single top-centre input now carries
 * place search AND Ask the globe. Same route-mock discipline as
 * e2e/globe-W11.spec.ts (this file's predecessor for the search half): a
 * broad https abort registered FIRST so later, more specific `page.route`
 * calls (registered after, so tried first - Playwright routes are LIFO)
 * override it per case, and every same-origin /api/* call gets a generic
 * 503 unless a test overrides /api/chat itself.
 */
async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-28T12:00:00Z"));
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.getByRole("combobox", { name: "Search places or ask the globe" })).toBeVisible({ timeout: 30_000 });
}

function box(page: Page) {
  return page.getByRole("combobox", { name: "Search places or ask the globe" });
}

const options = (page: Page) => page.locator("[data-explore-bar]").getByRole("option");

test("a deterministic command runs instantly, with no network call", async ({ page }) => {
  await openGlobe(page);
  let chatCalled = false;
  await page.route("**/api/chat", (route) => { chatCalled = true; route.abort(); });

  const input = box(page);
  await input.fill("show quakes above 5");
  await expect(options(page).first()).toContainText("Run:");
  await input.press("Enter");

  const answer = page.locator("[data-onebox-answer]");
  await expect(answer).toContainText("showed hazards");
  await expect(answer).toContainText("filter updated");
  expect(chatCalled).toBe(false); // deterministic path never reaches the LLM
  await expect(input).toHaveValue(""); // a run clears the box, ready for the next command
});

test("a place flies: selecting a search result moves the camera and fills the inspector", async ({ page }) => {
  await openGlobe(page);
  await page.route("https://photon.komoot.io/api/**", (route) => route.fulfill({ json: photonFixture }));
  await page.route("https://api.bigdatacloud.net/**", (route) => route.fulfill({ json: reverseFixture }));
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ json: weatherFixture }));

  const input = box(page);
  await input.fill("Paris"); // not a command - the top row falls back to "Ask the globe", the place is its own row below it
  // Both the fallback "Ask the globe" row and the real place row echo the
  // raw query text ("Paris"), so the match narrows on the place row's own
  // country line to stay unambiguous - see Place's `country`/`type` line.
  const placeOption = page.getByRole("option").filter({ hasText: "France" });
  await expect(placeOption).toBeVisible();
  await placeOption.click();

  const inspector = page.getByRole("region", { name: "Selection details" });
  await expect(inspector.getByRole("heading")).toHaveText("Paris");
  await expect(inspector).toContainText("France");
});

test("a mocked LLM answer narrates and applies its actions", async ({ page }) => {
  await openGlobe(page);
  await page.route("**/api/chat", async (route) => {
    // A mocked but non-instant reply, so the thinking state has a real
    // window to paint and be asserted - 150ms round-tripped fast enough
    // under a loaded CI/dev box that the "Thinking…" check below sometimes
    // polled after the answer had already replaced it (a real race in the
    // TEST, not the feature: the DOM after resolution already showed the
    // correct narrated answer). 800ms gives comfortable headroom while
    // staying far under askLLM.ts's own 12s timeout.
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({ json: { actions: [{ type: "filter", quakeMinMag: 4.5 }], narrate: "Showing quakes above magnitude 4.5." } });
  });

  const input = box(page);
  await input.fill("what's happening with the earthquakes lately");
  await expect(options(page).first()).toContainText("Ask the globe");
  await input.press("Enter");
  await expect(page.locator("[data-onebox-thinking]")).toBeVisible();

  const answer = page.locator("[data-onebox-answer]");
  await expect(answer).toContainText("Showing quakes above magnitude 4.5.");
  await expect(answer).toContainText("filter updated");
  // A bare filter isn't in the cheap-undo set (layer toggles, time offset
  // only - see ui/oneBox.ts's buildUndo) - no Undo button to click.
  await expect(answer.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("invalid LLM JSON shows a friendly message, not an error", async ({ page }) => {
  await openGlobe(page);
  await page.route("**/api/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "not valid json" }));

  const input = box(page);
  await input.fill("what's happening with the earthquakes lately");
  await input.press("Enter");

  const answer = page.locator("[data-onebox-answer]");
  await expect(answer).toContainText('Try "fly to Tokyo"');
  await expect(answer.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("LLM asks are rate limited to one per 3 seconds, and say why", async ({ page }) => {
  await openGlobe(page);
  await page.route("**/api/chat", (route) => route.fulfill({ json: { actions: [], narrate: "First answer." } }));

  const input = box(page);
  await input.fill("what's happening with the earthquakes lately");
  await input.press("Enter");
  await expect(page.locator("[data-onebox-answer]")).toContainText("First answer.");

  await input.fill("what about the storms");
  await input.press("Enter");
  await expect(page.locator('[data-explore-bar] [role="status"]')).toContainText("limited to one question every 3 seconds");
});

test("keyboard: / focuses the box, Esc clears it, and Cmd/Ctrl-K only steals focus from inside the globe", async ({ page }) => {
  await openGlobe(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Away from the globe: Cmd/Ctrl-K still opens the SITE's own global palette
  // (CommandPalette.tsx) - the brief's hard requirement not to break it.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // "/" focuses the box from anywhere.
  await page.keyboard.press("/");
  const input = box(page);
  await expect(input).toBeFocused();
  await input.fill("Tokyo");
  await expect(input).toHaveValue("Tokyo");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("");

  // Focus is now INSIDE the globe root (the box itself) - Cmd/Ctrl-K
  // refocuses the box instead of opening the site palette.
  await input.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(input).toBeFocused();
});
