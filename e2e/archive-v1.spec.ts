// ponytail: archive(world-v1) until 2027-04-04; removal recipe in ARCHIVE.md#world-v1
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { skipSoftwareRenderer } from "./lib/gpu.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const apiFixtures: Record<string, unknown> = {
  weather: fixture("weather-2026-09-24.json"),
  "github-activity": fixture("activity.json"), ops: fixture("ops.json"),
  aircraft: fixture("aircraft.json"), tle: fixture("tle.json"), signals: fixture("live/signals.json"),
  spotify: { connected: false, isPlaying: false, recent: [] }, whereami: { country: null },
};
const v1Chunk = /\/World-[^/]+\.js(?:\?|$)/;

test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, "viewport");
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.route("**/api/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    return name in apiFixtures ? route.fulfill({ json: apiFixtures[name] }) : route.fulfill({ status: 503, json: { error: "fixture unavailable" } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("playground:onboarded", "1");
    localStorage.setItem("playground:v2:onboarded", "1");
  });
});

async function archived(page: Page) {
  await expect(page).toHaveURL(/\/playground\?world=v1/);
  await expect(page.locator('[data-world="v1"]').first()).toBeVisible();
  await expect(page.locator('[data-archive-plaque="world-v1"]')).toContainText("Archived 2026-10-04. This was the first world; the Sangam replaced it.");
  await expect(page.getByRole("link", { name: "Back to the Sangam" })).toHaveAttribute("href", "/playground");
}

async function world(page: Page, url = "/playground") {
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.locator('[data-world="v2"]')).toBeVisible();
  await expect(page.getByRole("list", { name: "Landmarks in this world" })).toBeAttached();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test("quiet URL", async ({ page }) => {
  await page.goto("/playground?world=v1");
  await archived(page);
});

test("terminal aliases stay hidden from help", async ({ page }) => {
  for (const command of ["git checkout v1", "cd ~/world/v1"]) {
    await page.goto("/terminal");
    await waitForHydration(page);
    const input = page.locator("input").last();
    await input.fill("help");
    await input.press("Enter");
    await expect(page.getByText("list the commands", { exact: false })).toBeVisible();
    await expect(page.getByText("git checkout v1", { exact: false })).toHaveCount(0);
    await expect(page.getByText("cd ~/world/v1", { exact: false })).toHaveCount(0);
    await input.fill(command);
    await input.press("Enter");
    await archived(page);
  }
});

test("exact palette query", async ({ page }) => {
  await page.goto("/terminal");
  await waitForHydration(page);
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox", { name: "Command palette search" });
  await search.fill("night");
  await expect(page.getByRole("option", { name: "Night Survey (archived)" })).toHaveCount(0);
  await search.fill("night survey");
  await page.getByRole("option", { name: "Night Survey (archived)" }).click();
  await archived(page);
});

test("Konami sequence inside the world", { tag: "@gpu" }, async ({ page }) => {
  await skipSoftwareRenderer(page);
  await world(page);
  for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"]) await page.keyboard.press(key);
  await archived(page);
});

test("source-spring upstream hold", { tag: "@gpu" }, async ({ page }) => {
  await skipSoftwareRenderer(page);
  await world(page, "/playground?at=source-spring");
  await expect(page.locator("canvas[data-hodi-at='source-spring']")).toBeVisible();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(3000);
  await page.keyboard.up("ArrowDown");
  await archived(page);
});

test("v1 chunk loads only after a hidden entrance", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/terminal");
  await waitForHydration(page);
  expect(requests.filter((url) => v1Chunk.test(url))).toEqual([]);
  const v2Response = page.waitForResponse((response) => /\/WorldV2-[^/]+\.js(?:\?|$)/.test(response.url()) && response.ok());
  await page.goto("/playground");
  await waitForHydration(page);
  await expect(page.locator('[data-world="v2"]')).toBeVisible();
  await v2Response;
  expect(requests.filter((url) => v1Chunk.test(url))).toEqual([]);
  await expect(page.locator('a[href*="world=v1"]')).toHaveCount(0);
  await page.goto("/playground?world=v1");
  await archived(page);
  await expect.poll(() => requests.filter((url) => v1Chunk.test(url)).length).toBeGreaterThan(0);
});
