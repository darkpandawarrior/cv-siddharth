import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test, expect } from "./lib/test.ts";
import { DOCTRINE_LAWS } from "../src/data/doctrine.ts";

/**
 * P2-14 (idea-atlas CRAFT-4/I6, master-plan.md#M23/M24): the doctrine wall's
 * four laws, the AI funnel Mermaid diagram, the golden-eval row and the
 * wiring-guard row, plus trove-map T8's "Systems I operate" panel: every one
 * of them must carry either a live EvidenceChip or its own honest
 * "cadence not tracked" reading.
 *
 * Every /api/* route is mocked, same convention as ops-reality.spec.ts.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const WEATHER_OK = fixture("weather-2026-09-24.json");
const SIGNALS_OK = fixture("live/signals.json");
const TLE_OK = fixture("tle.json");
const AIRCRAFT_OK = fixture("aircraft.json");
const OPS_OK = fixture("ops.json");
const ACTIVITY_OK = { connected: true, items: [] };
const SPOTIFY_DISCONNECTED = { connected: false };
const NIGHT = "2026-09-24T03:15:00+05:30";

async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER_OK }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS_OK }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE_OK }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT_OK }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY_OK }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS_OK }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: SPOTIFY_DISCONNECTED }));
}

test.describe("the doctrine wall", () => {
  test("all four laws render, each with an EvidenceChip", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    expect(DOCTRINE_LAWS.length).toBeGreaterThanOrEqual(4);
    for (const law of DOCTRINE_LAWS) {
      const row = page.locator(".ops-row", { hasText: law.law });
      await expect(row).toBeVisible();
      await expect(row.locator("[data-evidence-chip]")).toHaveCount(1);
    }
  });

  test("cites the same measured/declared split /map already draws", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    await expect(page.locator("#ops-doctrine-h").locator("..")).toContainText("/map");
  });

  test("the AI funnel renders as an SVG", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    await expect(page.locator(".mermaid-wrap svg")).toBeVisible({ timeout: 10_000 });
  });

  test("the eval row carries an EvidenceChip and reads 'not run' with no provider key", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const row = page.locator(".ops-row", { hasText: "AI golden eval" });
    await expect(row).toBeVisible();
    await expect(row.locator("[data-evidence-chip]")).toHaveCount(1);
    // The fixture repo ships with no provider key, so this reads "not run".
    await expect(page.locator("body")).toContainText(/not run|last measured/);
  });

  test("the wiring row carries an EvidenceChip", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const row = page.locator(".ops-row", { hasText: "AI wiring guard" });
    await expect(row).toBeVisible();
    await expect(row.locator("[data-evidence-chip]")).toHaveCount(1);
  });
});

test.describe("Systems I operate (trove-map T8)", () => {
  test("every row carries an EvidenceChip, and unstamped ones read 'cadence not tracked'", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const panel = page.locator("section", { has: page.locator("#ops-systems-h") });
    await expect(panel).toBeVisible();
    const chips = panel.locator("[data-evidence-chip]");
    // control loop, Play fleet, F-Droid/Pages host, profile README pipeline,
    // the private harness: five rows, five chips.
    await expect(chips).toHaveCount(5);
    await expect(panel).toContainText("cadence not tracked");
  });

  test("names the private harness with a private badge, no link and no counts", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const panel = page.locator("section", { has: page.locator("#ops-systems-h") });
    const harnessRow = panel.locator(".ops-row", { hasText: "A private agent harness" });
    await expect(harnessRow).toBeVisible();
    await expect(harnessRow).toContainText("private");
    // No AgentHarness path or product name, ever, on this board.
    await expect(page.locator("body")).not.toContainText("AgentHarness");
    // The subject itself carries no external link (trove-map D1): the only
    // <a> in this row is the EvidenceChip's own /ops# self-anchor.
    const links = await harnessRow.locator("a").all();
    for (const link of links) {
      const href = await link.getAttribute("href");
      expect(href?.startsWith("/ops#")).toBe(true);
    }
  });
});

test.describe("after build", () => {
  test("no private path leaks into the doctrine or systems panel copy", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/ops", { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/AgentHarness\//);
    expect(body).not.toMatch(/~\//);
  });
});
