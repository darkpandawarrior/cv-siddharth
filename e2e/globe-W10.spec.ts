import { readFileSync } from "node:fs";
import { test, expect, waitForHydration } from "./lib/test.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/gibs/${name}`, import.meta.url));

test("clouds borrow the live imagery textures, including a delayed base", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-09-24T07:00:00Z"));
  await page.route("https://gibs.earthdata.nasa.gov/**", async (route) => {
    const url = route.request().url();
    const name = url.includes("ASTER_GDEM") ? "gibs-relief.jpg" : url.includes("Sea_Ice") ? "gibs-seaice.png" : url.includes("Black_Marble") ? "gibs-night.jpg" : url.includes("BlueMarble") ? "gibs-base.jpg" : "gibs-day.jpg";
    if (name === "gibs-base.jpg") await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ contentType: name.endsWith("png") ? "image/png" : "image/jpeg", body: fixture(name) });
  });
  const errors: string[] = [];
  page.on("console", (msg) => { if (/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test(msg.text())) errors.push(msg.text()); });
  await page.goto("/globe");
  await waitForHydration(page);
  await expect(page.locator("[data-earth-status]")).toHaveAttribute("data-earth-status", "live", { timeout: 30_000 });
  await expect(page.locator("[data-cloud-shell]")).toHaveAttribute("data-cloud-shell", "ready", { timeout: 30_000 });
  expect(errors).toEqual([]);
});
