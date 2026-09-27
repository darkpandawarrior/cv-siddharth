#!/usr/bin/env node
// The Sangam look-dev tool (master-plan.md#M35 amended, #M69): renders the
// LIVE world-v2 scene at the same six poses P1-13's concept paintings cover
// (golden spawn, night survey, monsoon fixture, Diwali date, bridge
// close-up, amphitheatre districts), every live source pinned to a fixture
// so the frame is reproducible. A human (or the G11 verifier) reads each
// PNG beside its concept target in heavy/world/concept/ — the target is
// the look, never asserted in pixels, so these captures are NEVER
// committed and NEVER shipped.
//
// Run against a running preview server:
//   npm run build && npm run preview -- --port 4311 &
//   node scripts/capture-world-plate.mjs --out <dir> [--base http://localhost:4311]
//
// ponytail: "bridge close-up" and "amphitheatre districts" have no camera-
// pose API to target — v2 ships no position telemetry outside this lane's
// own ownership (unlike v1's minimap, world-v2 has no `data-hodi-pose`
// attribute a script could poll), and world-driving.spec.ts's own doc
// comment already establishes that a wall-clock throttle hold on
// software-rendered WebGL covers an unpredictable distance. So these two
// are a best-effort: hold the throttle (and, for the amphitheatre, the
// rudder) for a generous fixed window from the same golden spawn, then
// shoot whatever frame that produced. Upgrade to a real drive-to-target
// poll the day a lane threads a pose readout onto <canvas data-*> for v2.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(root, "e2e", "fixtures");
const fixture = (relPath) => JSON.parse(readFileSync(join(FIXTURES, relPath), "utf8"));

/** Supports both `--flag value` and `--flag=value`. */
function argValue(flag, fallback) {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const outArg = argValue("--out", undefined);
if (!outArg) {
  console.error("[capture-world-plate] --out <dir> is required");
  process.exit(1);
}
const outDir = resolve(outArg);
const base = argValue("--base", `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 4173}`);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const WEATHER_CLEAR = fixture("weather-2026-09-24.json");
const WEATHER_WET = fixture("weather-wet-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");
const SIGNALS = fixture("live/signals.json");
const WHEREAMI = fixture("whereami-IN.json");

async function mockLiveRoutes(page, weather) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weather }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: WHEREAMI }));
}

/** Same pattern e2e/world-v2-night.spec.ts's `gotoWorldV2` uses, minus the
 *  test-only `expect` calls this plain script cannot import. */
async function enterWorldV2(browser, { at, weather }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => console.log(`[page:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));
  await mockLiveRoutes(page, weather);
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  // "load", not "networkidle": playhtml's shared-presence layer (src/lib/csp.ts)
  // holds a real websocket open to api.playhtml.fun, which a sandboxed/offline
  // run never finishes connecting to, so "networkidle" never arrives. The
  // explicit canvas wait below is the real readiness signal.
  await page.goto(`${base}/playground?world=v2`, { waitUntil: "load" });
  // page.locator(...).waitFor({state:"visible"}) measured flaky/hanging here:
  // the canvas's own data-live-* attributes churn every frame, which seems
  // to restart Playwright's actionability wait. waitForFunction checks only
  // the one fact this script needs (a laid-out canvas exists) and is not
  // sensitive to attribute churn.
  await page.waitForFunction(
    () => {
      const c = document.querySelector("[data-world='v2'] canvas");
      return !!c && c.getBoundingClientRect().width > 0;
    },
    { timeout: 30_000 },
  );
  // Let the spawn fly-in (3.2 s, world-v2-spec §4) and shader warm-up settle.
  await page.waitForTimeout(4_500);
  return page;
}

/** Holds throttle (and optionally rudder) for `ms`, then releases — the
 *  same key set world-driving.spec.ts drives with (input.ts's W/S/A/D). */
async function holdDrive(page, { steer = null, ms }) {
  const keys = steer ? ["w", steer] : ["w"];
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys.reverse()) await page.keyboard.up(k);
  await page.waitForTimeout(500); // let the last frame's motion settle before the shot
}

const FRAMES = [
  { id: "01-golden-spawn", at: "2026-09-24T06:40:00+05:30", weather: WEATHER_CLEAR },
  { id: "02-night-survey", at: "2026-09-24T03:15:00+05:30", weather: WEATHER_CLEAR },
  { id: "03-monsoon", at: "2026-09-24T12:27:00+05:30", weather: WEATHER_WET },
  { id: "04-diwali", at: "2026-11-08T19:30:00+05:30", weather: WEATHER_CLEAR },
  { id: "05-bridge-closeup", at: "2026-09-24T06:40:00+05:30", weather: WEATHER_CLEAR, drive: { ms: 8_000 } },
  { id: "06-amphitheatre-districts", at: "2026-09-24T06:40:00+05:30", weather: WEATHER_CLEAR, drive: { ms: 8_000, steer: "d" } },
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const frame of FRAMES) {
      const page = await enterWorldV2(browser, frame);
      if (frame.drive) await holdDrive(page, frame.drive);
      const outPath = join(outDir, `${frame.id}.png`);
      await page.screenshot({ path: outPath, type: "png" });
      await page.close();
      console.log(`[capture-world-plate] wrote ${outPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[capture-world-plate] failed:", err);
  process.exit(1);
});
