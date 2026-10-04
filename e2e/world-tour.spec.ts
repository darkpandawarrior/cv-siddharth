import { readFileSync } from "node:fs";
import { test, expect } from "./lib/test.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";
import { encodePath, PATH_SHARE_PARAM } from "../src/lib/pathShare.ts";

const NOW = new Date("2026-09-24T12:27:00+05:30");
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const responses: Record<string, unknown> = {
  weather: fixture("weather-2026-09-24.json"),
  "github-activity": fixture("activity.json"),
  ops: fixture("ops.json"),
  aircraft: fixture("aircraft.json"),
  tle: fixture("tle.json"),
  signals: fixture("live/signals-nulls.json"),
  spotify: { connected: false, isPlaying: false, recent: [] },
  whereami: { country: null },
};

test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 2);
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => {
    const name = new URL(route.request().url()).pathname.slice("/api/".length);
    return route.fulfill({ json: responses[name] ?? { connected: false } });
  });
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
});

test("shared path replays stops in order and drops unknown ids", async ({ page }) => {
  const ids = ["stutter", "unknown-id", "doori", "portfolio", "doori"];
  await page.goto(`/playground?${PATH_SHARE_PARAM}=${encodePath(ids)}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter the valley" }).click();
  const tour = page.getByRole("region", { name: "Guided tour" });
  const expected = ids.filter((id) => id !== "unknown-id");
  const seen: string[] = [];
  for (const [index, id] of expected.entries()) {
    await expect(tour).toHaveAttribute("data-tour-stop", id);
    await expect(tour).toHaveAttribute("data-tour-index", String(index));
    seen.push((await tour.getAttribute("data-tour-stop"))!);
    if (index < expected.length - 1) await tour.press("ArrowRight");
  }
  expect(seen).toEqual(expected);
  await expect(tour.getByRole("button", { name: "Next stop" })).toBeDisabled();
  await tour.press("ArrowLeft");
  await expect(tour).toHaveAttribute("data-tour-stop", "portfolio");
  await expect(tour).not.toContainText("unknown-id");
  await expect(page.getByRole("button", { name: /^Copy your path/ })).toBeVisible();
});

test("reduced motion holds each default stop until a keyboard step", async ({ page }) => {
  await page.goto("/playground", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter the valley" }).click();
  const tour = page.getByRole("region", { name: "Guided tour" });
  await tour.getByRole("button", { name: "Guided", exact: true }).click();
  await expect(tour).toHaveAttribute("data-tour-stop", "bridge");
  await expect(tour).toHaveAttribute("data-tour-playing", "false");
  await expect(tour.getByRole("button", { name: "Play tour" })).toBeDisabled();
  await page.clock.setSystemTime(NOW);
  await page.clock.pauseAt(new Date(NOW.getTime() + 1000));
  await page.clock.fastForward(240_000);
  await expect(tour).toHaveAttribute("data-tour-stop", "bridge");
  for (const id of ["doori", "paymentslab-kmp", "deepmal-niche", "pr-stone", "portfolio", "stutter"]) {
    await tour.press("ArrowRight");
    await expect(tour).toHaveAttribute("data-tour-stop", id);
  }
  await tour.press("ArrowLeft");
  await expect(tour).toHaveAttribute("data-tour-stop", "portfolio");
  await tour.press("Enter");
  await expect(tour).toHaveAttribute("data-tour-stop", "stutter");
  await tour.getByRole("button", { name: "Exit tour" }).click();
  await expect(tour).toHaveAttribute("data-tour-stop", "");
});
