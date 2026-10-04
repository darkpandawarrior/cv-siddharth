import { readFileSync } from "node:fs";
import { test, expect } from "./lib/test.ts";
import type { Page } from "@playwright/test";
import { skipSoftwareRenderer } from "./lib/gpu.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import { landOf } from "../src/world/v2/worldModel.ts";
import { replayMonths } from "../src/world/v2/timelapse.ts";

const NOW = new Date("2026-10-04T12:27:00+05:30");
const months = replayMonths(NOW);
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const responses: Record<string, unknown> = {
  weather: fixture("weather-2026-09-24.json"),
  "github-activity": fixture("activity.json"),
  ops: fixture("ops.json"),
  aircraft: fixture("aircraft.json"),
  tle: fixture("tle.json"),
  signals: { at: NOW.toISOString(), lichess: null, devto: [], ci: {}, downloads: {} },
  spotify: { connected: false, isPlaying: false, recent: [] },
  whereami: { country: null },
};

test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 2);
  await page.clock.setFixedTime(NOW);
  await page.route("**/api/**", (route) => {
    const name = new URL(route.request().url()).pathname.slice("/api/".length);
    return route.fulfill({ json: responses[name] ?? { connected: false } });
  });
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
});

async function freezeReplayClock(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Replay from 2017" })).toBeVisible();
  await page.clock.setSystemTime(NOW);
  await page.clock.pauseAt(new Date(NOW.getTime() + 1000));
  await page.clock.setFixedTime(NOW);
}

test("replays ledger records, pauses, changes speed and returns to now", { tag: "@gpu" }, async ({ page }) => {
  await skipSoftwareRenderer(page);
  await page.goto("/playground", { waitUntil: "domcontentloaded" });
  await freezeReplayClock(page);
  await page.getByRole("button", { name: "Replay from 2017" }).click();
  const replay = page.getByRole("region", { name: "Replay ledger" });
  await replay.getByRole("slider", { name: "Replay month" }).fill(String(months.indexOf("2023-04")));
  await expect(replay.getByRole("heading")).toHaveText("REPLAY 2023-04, not live");
  await expect(replay).toHaveAttribute("data-replay-playing", "false");
  await replay.getByText("Records at this month").click();
  await expect(replay.locator("[data-replay-feature]")).toHaveCount(landOf(ledger, "2023-04").length);
  await replay.getByRole("combobox", { name: "Replay speed" }).selectOption("2");
  await replay.getByRole("button", { name: "Play replay" }).click();
  await page.clock.fastForward(100);
  await expect(replay.getByRole("heading")).toHaveText("REPLAY 2023-05, not live");
  await replay.getByRole("button", { name: "Pause replay" }).click();
  await expect(replay).toHaveAttribute("data-replay-playing", "false");
  await replay.getByRole("slider", { name: "Replay month" }).fill(String(months.indexOf(ledger.generatedAt.slice(0, 7))));
  const undated = replay.locator('[data-cadence="undated"]');
  await expect(undated).toHaveCount(landOf(ledger).filter((feature) => feature.date === null).length);
  for (const text of await undated.allTextContents()) expect(text).toContain("undated");
  await replay.getByRole("button", { name: "Back to now" }).click();
  await expect(replay).toHaveAttribute("data-replay-month", "");
  await expect(replay.getByRole("button", { name: "Replay from 2017" })).toBeVisible();
});

test("reduced motion never auto-advances and arrow keys step one month", { tag: "@gpu" }, async ({ page }) => {
  await skipSoftwareRenderer(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/playground", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter the valley" }).click();
  await freezeReplayClock(page);
  await page.getByRole("button", { name: "Replay from 2017" }).click();
  const replay = page.getByRole("region", { name: "Replay ledger" });
  const slider = replay.getByRole("slider", { name: "Replay month" });
  await slider.fill(String(months.indexOf("2023-04")));
  await expect(replay.getByRole("button", { name: "Play replay" })).toBeDisabled();
  await page.clock.fastForward(800);
  await expect(replay).toHaveAttribute("data-replay-month", "2023-04");
  await slider.press("ArrowRight");
  await expect(replay.getByRole("heading")).toHaveText("REPLAY 2023-05, not live");
  await slider.press("ArrowLeft");
  await expect(replay.getByRole("heading")).toHaveText("REPLAY 2023-04, not live");
  await expect(replay).toHaveAttribute("data-replay-playing", "false");
  await replay.getByRole("button", { name: "Back to now" }).click();
  await expect(replay).toHaveAttribute("data-replay-month", "");
});
