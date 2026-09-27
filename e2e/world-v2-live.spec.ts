import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { riverRow } from "../src/lib/ledgerText.ts";
import { kitesRow } from "../src/lib/signalsText.ts";
import { riverDischargeIst } from "../src/world/v2/live/liveBinding.ts";
import { ledger } from "../src/world/v2/ledger.ts";
import type { River } from "../src/lib/sky.ts";
import type { SignalsResponse } from "../api/_lib/signals-handler.ts";

/**
 * P3-02a — world-v2-live (live-data-spec.md §2.2/§2.3/§4 WL; master-plan.md
 * #M2-#M4, #M19-#M21, #M48-#M49). Deterministic time and fixture routing
 * throughout (G10): no test here ever touches a live network.
 */

const FIXTURES_URL = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_URL)), "utf8"));

const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const AIRCRAFT = fixture("aircraft.json");
const TLE = fixture("tle.json");
// "the overcast fixture" (this repo's own convention, e2e/world-reality.spec.ts) —
// today's real Open-Meteo sample: 22.9 °C, code 3 (overcast), PM2.5 29.2, AQI 77.
const WEATHER_OVERCAST = fixture("weather-2026-09-24.json");
const WEATHER_WET = fixture("weather-wet-2026-09-24.json");
const SIGNALS = fixture("live/signals.json");
const SIGNALS_PLAYING = fixture("live/signals-playing.json");
const SIGNALS_NULLS = fixture("live/signals-nulls.json");

const NIGHT = "2026-09-24T03:15:00+05:30";
const NOON = "2026-09-24T12:27:00+05:30";

async function mockLiveRoutes(page: Page, weather: unknown = WEATHER_OVERCAST, signals: unknown = SIGNALS): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weather }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false, isPlaying: false, recent: [] } }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: signals }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: { country: null } }));
}

async function gotoWorldV2(page: Page, at: string, opts: { weather?: unknown; signals?: unknown; reducedMotion?: boolean } = {}): Promise<void> {
  await mockLiveRoutes(page, opts.weather ?? WEATHER_OVERCAST, opts.signals ?? SIGNALS);
  await page.clock.setFixedTime(new Date(at));
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("playground:v2:onboarded", "1"));
  await page.goto("/playground?world=v2", { waitUntil: "networkidle" });
  await waitForHydration(page);
  const canvas = page.locator("[data-world='v2'] canvas");
  await expect(canvas).toHaveCount(1, { timeout: 15_000 });
  return;
}

function canvas(page: Page) {
  return page.locator("[data-world='v2'] canvas");
}

test.describe("live-binding — scene state (data-live-* on the canvas)", () => {
  test("weather-wet, T1 desktop -> data-live-rain-count is 960 (row 5: min(tierMax, round(mmh*400)))", async ({ page }) => {
    await gotoWorldV2(page, NOON, { weather: WEATHER_WET });
    await expect(canvas(page)).toHaveAttribute("data-live-rain-count", "960", { timeout: 10_000 });
    await expect(canvas(page)).toHaveAttribute("data-live-rain", "on");
  });

  test("weather-wet + reduced motion -> data-live-rain is 'motion-reduced'", async ({ page }) => {
    await gotoWorldV2(page, NOON, { weather: WEATHER_WET, reducedMotion: true });
    await expect(canvas(page)).toHaveAttribute("data-live-rain", "motion-reduced", { timeout: 10_000 });
  });

  test("signals-playing -> data-live-chess-lamp is '1'", async ({ page }) => {
    await gotoWorldV2(page, NOON, { signals: SIGNALS_PLAYING });
    await expect(canvas(page)).toHaveAttribute("data-live-chess-lamp", "1", { timeout: 10_000 });
  });

  test("signals-nulls -> chess lamp and every collar read 'unmeasured', every lesson kite altitude is the 18m floor", async ({ page }) => {
    await gotoWorldV2(page, NOON, { signals: SIGNALS_NULLS });
    const el = canvas(page);
    await expect(el).toHaveAttribute("data-live-chess-lamp", "unmeasured", { timeout: 10_000 });
    await expect(el).toHaveAttribute("data-live-collar-doori", "unmeasured");
    await expect(el).toHaveAttribute("data-live-collar-gaddi", "unmeasured");
    await expect(el).toHaveAttribute("data-live-collar-paymentslab-kmp", "unmeasured");
    await expect(el).toHaveAttribute("data-live-keystone", "unlit");
    // Both attributes at "18" together proves EVERY lesson kite (not just
    // some) sits at the floor: min === max === 18.
    await expect(el).toHaveAttribute("data-live-kite-min-altitude", "18");
    await expect(el).toHaveAttribute("data-live-kite-max-altitude", "18");
  });

  test("the default (signals.json) fixture lights the keystone (kmp-toolkit + kmp-build-logic both pass, M2)", async ({ page }) => {
    await gotoWorldV2(page, NOON);
    await expect(canvas(page)).toHaveAttribute("data-live-keystone", "lit", { timeout: 10_000 });
    await expect(canvas(page)).toHaveAttribute("data-live-collar-doori", "pass");
    // The default fixture's paymentslab-kmp CI fails on "Quality Gate".
    await expect(canvas(page)).toHaveAttribute("data-live-collar-paymentslab-kmp", "fail");
  });

  test("/api/ops both green -> data-live-twin-chhatri is 'lit' (M2: the site's own CI, not the keystone)", async ({ page }) => {
    await gotoWorldV2(page, NOON);
    await expect(canvas(page)).toHaveAttribute("data-live-twin-chhatri", "lit", { timeout: 10_000 });
  });
});

test.describe("ledger rows — pure formatters, real production code", () => {
  test("weather/air rows read straight off the overcast fixture (real DOM, no signal wiring needed)", async ({ page }) => {
    await gotoWorldV2(page, NOON);
    await page.keyboard.press("r");
    const weatherRow = page.locator("[data-ledger-row='weather']");
    const airRow = page.locator("[data-ledger-row='air']");
    await expect(weatherRow).toBeVisible();
    await expect(weatherRow).toContainText("22.9 °C, overcast");
    await expect(airRow).toContainText("AQI 77");
    await expect(airRow).toContainText(/modelled/i);
  });

  test("the river row's live DOM text ('not a gauge') and the row-10 IST correction, proven on riverRow() directly", async ({ page }) => {
    // What the live, integrated ledger actually shows today: `raw.river` is
    // Open-Meteo's raw `dischargeM3s` (UTC-anchored), with no IST correction
    // — `src/world/v2/useNowModel.ts` and `ledgerText.ts`'s `riverRow`, both
    // outside this lane's `owns`. "not a gauge"/"modelled" already read
    // correctly through that path; the number does not yet.
    await gotoWorldV2(page, NOON);
    await page.keyboard.press("r");
    const riverRowEl = page.locator("[data-ledger-row='river']");
    await expect(riverRowEl).toBeVisible();
    await expect(riverRowEl).toContainText(/not a gauge/i);
    await expect(riverRowEl).toContainText("modelled");

    // Row 10 is this lane's own (live-data-spec §2.2 #10, "river_discharge
    // TODAY (IST)"): before 05:30 IST, the flood API's UTC-anchored
    // dischargeM3s describes UTC's "yesterday" relative to IST's already-
    // current calendar day, and `river.next[0]` is the value that lines up
    // (liveBinding.test.ts pins this against the real fixture: 78.98, not
    // 73.64). Feeding riverRow() — real, unmodified production code — that
    // IST-corrected value proves the formatter renders exactly "79 m³/s"
    // once a lane wires `raw.river` through the correction.
    const river: River = { date: "2026-09-24", dischargeM3s: 73.64, next: [78.98, 54.46], range7d: [32.27, 99.46] };
    const correctedDischarge = riverDischargeIst(new Date("2026-09-24T03:30:00+05:30"), river);
    expect(correctedDischarge).toBe(78.98);
    const correctedText = riverRow({ ...river, dischargeM3s: correctedDischarge! });
    expect(correctedText).toContain("79 m³/s");
    expect(correctedText).toContain("not a gauge");
  });

  test("kites '11 of 17' — kitesRow(), real production code, both numbers derived (not literals)", async () => {
    // `totalLessons` is `ledger.writing.lessons.length` (never a hardcoded
    // 17); `devto.length` is this test's own 11-article fixture, standing in
    // for whatever dev.to's articles endpoint returns (kitesRow counts
    // articles returned, not lessons matched — src/lib/signalsText.ts).
    // `ledgerRows.ts` (P2-19, unowned) does not yet route `kites-devto`
    // through this formatter (its own doc comment: "the day a lane threads
    // that state through" — a one-line SECTION_BY_STREAM_ID/switch addition
    // outside this lane's `owns`); this proves the formatter itself is
    // correct end to end.
    const totalLessons = ledger.writing.lessons.length;
    expect(totalLessons).toBe(17);
    const devto: SignalsResponse["devto"] = Array.from({ length: 11 }, (_, i) => ({
      url: `https://dev.to/darkpandawarrior/lesson-${i}`,
      reactions: 1,
      comments: 0,
      publishedAt: "2026-08-01T00:00:00Z",
    }));
    const text = kitesRow(devto, totalLessons, "2026-09-24T03:28:00Z");
    expect(text).toContain(`11 of ${totalLessons} lessons on dev.to`);
    expect(text).toContain("11 of 17 lessons on dev.to");
  });
});

test.describe("art direction — the ordering luma probe (M49)", () => {
  async function meanLuma(buffer: Buffer): Promise<number> {
    const { data } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (const p of data as Buffer) sum += p;
    return sum / data.length;
  }

  test("canvas mean luma at 03:15 < luma at 12:27 - 8/255, overcast fixture, preview build", async ({ page }, testInfo) => {
    test.slow();
    await gotoWorldV2(page, NIGHT);
    // Let the live-binding effect apply the night sky/key-light write and the
    // scene settle a couple of frames before sampling.
    await page.waitForTimeout(2000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const nightBox = await canvas(page).boundingBox();
    if (!nightBox) throw new Error("world-v2 canvas has no bounding box");
    const nightBuf = await page.screenshot({ clip: nightBox, path: testInfo.outputPath("world-v2-night.png") });
    const nightLuma = await meanLuma(nightBuf);

    await page.clock.setFixedTime(new Date(NOON));
    await page.reload({ waitUntil: "networkidle" });
    await waitForHydration(page);
    await expect(canvas(page)).toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const noonBox = await canvas(page).boundingBox();
    if (!noonBox) throw new Error("world-v2 canvas has no bounding box");
    const noonBuf = await page.screenshot({ clip: noonBox, path: testInfo.outputPath("world-v2-noon.png") });
    const noonLuma = await meanLuma(noonBuf);

    await testInfo.attach("luma", { body: JSON.stringify({ nightLuma, noonLuma }), contentType: "application/json" });
    expect(noonLuma, `noon luma ${noonLuma} vs night luma ${nightLuma}`).toBeGreaterThanOrEqual(nightLuma + 8);
  });
});
