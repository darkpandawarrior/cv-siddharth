import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

type FakeExplorer = { lat: number; lon: number; zoom: "orbit" | "region" | "close"; mode: "orbit" | "ground" | "follow" | "street" };

async function setExplorers(page: Page, explorers: Record<string, FakeExplorer>) {
  await page.addInitScript((e) => {
    (window as unknown as { __GLOBE_TOGETHER_TEST__: unknown }).__GLOBE_TOGETHER_TEST__ = e;
  }, explorers);
}

const TWO_EXPLORERS: Record<string, FakeExplorer> = {
  "peer-mumbai": { lat: 21, lon: 72, zoom: "region", mode: "orbit" },
  "peer-buenos-aires": { lat: -33, lon: -60, zoom: "close", mode: "orbit" },
};

async function openGlobeW15(page: Page, { reducedMotion = true }: { reducedMotion?: boolean } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  return canvas;
}

async function dragOrbit(page: Page, canvas: ReturnType<Page["locator"]>) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const cx = box.x + box.width / 2;
  // The search controls can cover the canvas centre. Start on its exposed
  // lower disc, as W10D's native orbit gestures do, and prove the hit target.
  const explore = await page.locator("[data-explore-bar]").boundingBox();
  if (!explore) throw new Error("exploration controls have no bounding box");
  const cy = Math.max(box.y + box.height / 2, explore.y + explore.height + 8);
  await page.mouse.move(cx, cy);
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: cx, y: cy })).toBe("CANVAS");
  await page.mouse.down();
  await page.mouse.move(cx + 220, cy, { steps: 12 });
  await page.mouse.up();
}


// PROBE ONLY (branch probe/e2e-ci-flakes-20261002, never merged): records what
// the CI runner actually sees for the three specs that fail there 3/3.
test("PROBE V6 idle live region", async ({ page }) => {
  test.setTimeout(150_000);
  await openGlobe(page);
  await page.evaluate(() => {
    const t = document.querySelector("[data-scene-summary-live]")!;
    const w = window as unknown as { __log: string[]; __frames: number };
    w.__frames = 0;
    const count = () => { w.__frames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
    w.__log = [`t=${performance.now().toFixed(0)} start text=${JSON.stringify(t.textContent)} n=${document.querySelectorAll("[data-scene-summary-live]").length} autorotate=${document.querySelector("[data-autorotate]")?.getAttribute("data-autorotate")}`];
    new MutationObserver((rs) => { for (const r of rs) w.__log.push(`t=${performance.now().toFixed(0)} frames=${w.__frames} ${r.type} +${r.addedNodes.length}/-${r.removedNodes.length} old=${JSON.stringify(r.oldValue)} now=${JSON.stringify(t.textContent)}`); })
      .observe(t, { characterData: true, characterDataOldValue: true, subtree: true, childList: true });
  });
  await page.waitForTimeout(60_000);
  const out = await page.evaluate(() => { const w = window as unknown as { __log: string[]; __frames: number }; return [...w.__log, `end frames=${w.__frames} (60s)`].join("\n"); });
  console.log("PROBE-V6\n" + out);
});

test("PROBE W15 reticle readings after pause and drag", async ({ page }) => {
  test.setTimeout(150_000);
  await setExplorers(page, TWO_EXPLORERS);
  const canvas = await openGlobeW15(page, { reducedMotion: false });
  await page.keyboard.press("6");
  const seam = page.locator("[data-together-layer]");
  await expect.poll(async () => seam.getAttribute("data-together-first-x"), { timeout: 30_000 }).not.toBeNull();
  await page.getByRole("button", { name: "Pause the globe's ambient rotation" }).click();
  await dragOrbit(page, canvas);
  const out = await page.evaluate(() => new Promise<string>((resolve) => {
    const el = document.querySelector("[data-together-layer]") as HTMLElement;
    const c = document.querySelector("[data-globe-root] canvas") as HTMLElement;
    const runs: string[] = []; let last = ""; let n = 0; let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      const cur = `${el.dataset.togetherFirstX},${el.dataset.togetherFirstY} fly=${c.getAttribute("data-camera-flying")}`;
      if (cur === last) n++; else { if (last) runs.push(`${last} x${n}`); last = cur; n = 1; }
      if (performance.now() - t0 > 20_000) { runs.push(`${last} x${n}`); resolve(`frames=${frames} in 20s; distinct=${runs.length}\n` + runs.slice(0, 40).join("\n") + (runs.length > 80 ? "\n..." : "") + "\n" + runs.slice(-40).join("\n")); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  console.log("PROBE-W15\n" + out);
});
