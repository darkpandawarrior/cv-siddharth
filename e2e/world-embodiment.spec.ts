import { readFileSync } from "node:fs";
import { test, expect } from "./lib/test.ts";
import { forceDeviceTier } from "./lib/deviceTier.ts";

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const responses: Record<string, unknown> = {
  weather: fixture("weather-2026-09-24.json"), "github-activity": fixture("activity.json"),
  ops: fixture("ops.json"), aircraft: fixture("aircraft.json"), tle: fixture("tle.json"),
  signals: fixture("live/signals-nulls.json"), spotify: { connected: false, isPlaying: false, recent: [] },
  whereami: { country: null },
};

test.beforeEach(async ({ page }) => {
  await forceDeviceTier(page, 2);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.fulfill({ json: responses[new URL(route.request().url()).pathname.slice(5)] ?? { connected: false } }));
  // Capability UI is a DOM sibling of Canvas. Keep this probe off SwiftShader.
  await page.route("**/world/terrain/**", (route) => route.abort());
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
});

for (const supported of [false, true]) {
  test(`VR button is ${supported ? "present" : "absent"} when immersive-vr support is ${supported}`, async ({ page }) => {
    await page.addInitScript((value) => Object.defineProperty(navigator, "xr", {
      configurable: true, value: { isSessionSupported: async (mode: string) => mode === "immersive-vr" && value },
    }), supported);
    await page.goto("/playground", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Enter the valley" }).click();
    await expect(page.getByRole("region", { name: "Walk and VR" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Walk and VR" })).toHaveAttribute("data-vr-supported", String(supported));
    const button = page.getByRole("button", { name: "Enter VR", exact: true });
    if (supported) await expect(button).toBeVisible();
    else await expect(button).toHaveCount(0);
  });
}
