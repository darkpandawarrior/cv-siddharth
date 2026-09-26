import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * P2-15 (idea-atlas REC-3, CRAFT-6, CRAFT-7, SKY-5's /lab row): the
 * Confidence Console's daypart caption, and the two new instruments labs.ts
 * registers.
 *
 * The gap this comment used to describe (LabBench.tsx's hand-written
 * `tab === "..."` switch had no line for "guard-lab"/"routing-lab", so
 * labs.ts's pill buttons mounted no pane) is closed: LabBench.tsx now
 * imports GuardLab/RoutingLab and renders them for those two tab keys.
 */

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: { connected: false } }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false } }));
  await page.route("**/api/weather", (route) => route.fulfill({ json: { connected: false, weather: null, air: null, river: null, season: null, rain6hMm: null } }));
}

const NIGHT = "2026-09-24T03:15:00+05:30"; // matches the fixed clocks the other reality specs share
const GOLDEN = "2026-09-24T18:30:00+05:30"; // Pune's golden hour, per master-plan.md G10's fixture times

test.describe("labs.ts registers guard-lab and routing-lab (I9)", () => {
  test("both tabs render as pill buttons with an EvidenceChip or the fallback text", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/lab");
    await waitForHydration(page);

    for (const label of ["Guard Lab", "Routing Lab"]) {
      const card = page.locator("[data-lab-card]", { hasText: label });
      await expect(card).toHaveCount(1);
      const hasChip = (await card.locator("[data-evidence-chip]").count()) > 0;
      const text = await card.innerText();
      expect(hasChip || text.includes("cadence not tracked"), `"${label}" card has neither`).toBe(true);
    }
  });

  test("/lab#guard-lab renders the Guard Lab instrument", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/lab");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Guard Lab" }).click();
    await expect(page.getByLabel(/untrusted text to fence/i)).toBeVisible({ timeout: 10_000 });
  });

  test("/lab#routing-lab renders the Routing Lab instrument", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/lab");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Routing Lab" }).click();
    await expect(page.getByRole("img", { name: /captain, workers, mechanical/i })).toBeVisible({ timeout: 10_000 });
    // The toggle exists and the caption changes when it flips: the actual
    // behaviour CRAFT-7 asks for ("overload the captain with volume and the
    // run is rate-limited"), not just that the canvas painted.
    const toggle = page.getByRole("checkbox", { name: "the captain rows" });
    await expect(toggle).toBeVisible();
    await toggle.check();
    await expect(page.getByText("every task queues for the captain's one slot", { exact: false })).toBeVisible();
  });
});

test.describe("SignalLab's daypart caption (SKY-5): real facts about Pune, never a claim about the sim", () => {
  test("says only true things: contains 'Pune' and never 'segment'", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(GOLDEN));
    await page.goto("/lab");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Signal Lab" }).click();

    const caption = page.locator("[data-signal-daypart]");
    await expect(caption).toBeVisible({ timeout: 10_000 });
    const text = await caption.innerText();
    expect(text).toContain("Pune");
    expect(text.toLowerCase()).not.toContain("segment");
  });

  test("the tint changes between night and golden hour, without touching the pipeline's own numbers", async ({ page }) => {
    await mockLiveRoutes(page);

    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/lab");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Signal Lab" }).click();
    const nightCaption = await page.locator("[data-signal-daypart]").innerText();
    const nightEngine = await page.getByText(/^engine$/).locator("..").innerText();
    expect(nightCaption.toLowerCase()).toContain("night");

    await page.clock.setFixedTime(new Date(GOLDEN));
    // Re-navigate rather than waiting on the minute-boundary tick: useNow()
    // only advances on a real clock tick, and page.clock.setFixedTime alone
    // does not fire one.
    await page.goto("/lab");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Signal Lab" }).click();
    const goldenCaption = await page.locator("[data-signal-daypart]").innerText();
    const goldenEngine = await page.getByText(/^engine$/).locator("..").innerText();

    expect(goldenCaption.toLowerCase()).not.toContain("night");
    // Same seed, same pipeline: the headline distance is unaffected by the
    // sun, only the caption is (never claims the sim changed with the sun).
    expect(goldenEngine).toBe(nightEngine);
  });
});
