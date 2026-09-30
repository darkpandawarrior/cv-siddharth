import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

test.use({ serviceWorkers: 'block' });

/**
 * WAVE 7 LANE V6 (non-visual scene summary). Fixed clock, every /api/* route
 * mocked (G10, same discipline as e2e/globe.spec.ts) — this spec never
 * depends on a live network. `2026-09-24T12:27:00+05:30` is `06:57:00Z`, so
 * the daily VIIRS base's own `lagDays: 1` date is `2026-09-23` (the same
 * clock and arithmetic e2e/globe-U1.spec.ts already uses).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

// Every external producer is isolated, including imagery and the newer hazard
// feeds. The summary assertions must not depend on live response timing.
async function withApiFixtures(page: Page) {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const png = route.request().url().includes(".png");
    return route.fulfill({ path: join(FIXTURES, "gibs", png ? "gibs-seaice.png" : "gibs-day.jpg"), contentType: png ? "image/png" : "image/jpeg" });
  });
  await page.routeWebSocket(/^wss?:\/\//, (socket) => socket.close());
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

async function openGlobe(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(700);
  return canvas;
}

/** Runs a MutationObserver over `selector` for the duration of `run`, and
 *  returns how many mutation records landed — the one seam every acceptance
 *  line below needs (idle silence, exactly-one update). */
async function countMutations(page: Page, selector: string, run: () => Promise<void>): Promise<number> {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) throw new Error(`countMutations: no element for ${sel}`);
    (window as unknown as { __v6Mutations: number }).__v6Mutations = 0;
    const obs = new MutationObserver((records) => {
      (window as unknown as { __v6Mutations: number }).__v6Mutations += records.length;
    });
    obs.observe(target, { characterData: true, subtree: true, childList: true });
    (window as unknown as { __v6Obs: MutationObserver }).__v6Obs = obs;
  }, selector);
  await run();
  return page.evaluate(() => {
    (window as unknown as { __v6Obs: MutationObserver }).__v6Obs.disconnect();
    return (window as unknown as { __v6Mutations: number }).__v6Mutations;
  });
}

test("the scene summary names the current GIBS base and its date", async ({ page }) => {
  await openGlobe(page);
  const summary = page.locator("[data-scene-summary]");
  // sr-only, never visible — but present and readable, which is the point.
  await expect(summary).toBeAttached();
  await expect(summary).toContainText("VIIRS true colour");
  await expect(summary).toContainText("2026-09-23");
});

test("the scene summary has headings for Imagery, Live layers, Hazards, Sky and Selection", async ({ page }) => {
  await openGlobe(page);
  const summary = page.locator("[data-scene-summary]");
  for (const heading of ["Imagery", "Live layers", "Hazards", "Sky", "Selection"]) {
    await expect(summary.getByRole("heading", { name: heading, level: 3 })).toBeAttached();
  }
});

test("turning satellites on updates the scene summary exactly once", async ({ page }) => {
  // Same headroom as the idle test below: this repo's own worktree fleet
  // runs many lanes' preview servers and browsers at once (playwright.config.ts's
  // own comment block on worker contention), and openGlobe's canvas wait
  // alone can eat most of a 30s budget under that load with nothing wrong
  // in the page itself.
  test.setTimeout(60_000);
  await openGlobe(page);
  const panel = page.locator("[data-globe-layer-panel]");
  await expect(panel).toBeVisible();
  const toggle = panel.getByRole("button", { name: "Satellites" });
  // Satellites is ON by default (globeStore.ts) — turn it off first so the
  // observed action below is a real off-to-on transition, not a no-op.
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  const before = await page.locator("[data-scene-summary]").innerText();
  const mutations = await countMutations(page, "[data-scene-summary]", async () => {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(200); // let React's commit settle before disconnecting
  });
  const after = await page.locator("[data-scene-summary]").innerText();

  expect(after, "the summary text never changed").not.toBe(before);
  expect(mutations, "the summary should rewrite exactly once, not per render/frame").toBe(1);
});

test("60s idle with auto-rotate gives 0 MutationObserver hits on the live region", async ({ page }) => {
  test.setTimeout(90_000);
  await openGlobe(page);
  // GlobeHud's own data-autorotate seam (e2e/globe.spec.ts's acceptance
  // line): confirms this run is actually exercising the idle/orbiting path,
  // not a reduced-motion or tier-3 branch where nothing would move anyway.
  await expect(page.locator("[data-autorotate]").first()).toHaveAttribute("data-autorotate", "on");

  const mutations = await countMutations(page, "[data-scene-summary-live]", async () => {
    await page.waitForTimeout(60_000);
  });
  expect(mutations, "the polite live region only announces selection changes, never idle rotation").toBe(0);
});

test("/globe has no axe violations with the scene summary mounted", async ({ page }) => {
  await openGlobe(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact !== "minor");
  const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`).join("\n\n");
  expect(bad, report).toEqual([]);
});
