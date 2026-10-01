import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * /globe, LANE L4 (living-ledger-spec.md#6.3, GLOBE lens): PulseLayer,
 * ArcLayer and LocalTraffic's chevrons. Reuses the same committed fixtures
 * reality-footer.spec.ts / ops-reality.spec.ts already prove match their
 * handlers' real shapes (activity.json, ops.json, live/signals.json,
 * aircraft.json) rather than hand-rolling new ones the brief only offered
 * as examples -- one less place those shapes can drift from the real
 * handler. Every /api/* route this spec depends on is fixed or explicitly
 * left unmocked (the 404-draws-nothing case), never live network (G10).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const ACTIVITY_OK = fixture("activity.json");
const OPS_OK = fixture("ops.json");
const SIGNALS_OK = fixture("live/signals.json");
const AIRCRAFT_OK = fixture("aircraft.json") as { aircraft: unknown[] };

async function mockPulseFeeds(page: Page) {
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY_OK }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS_OK }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS_OK }));
}

async function mockAircraft(page: Page) {
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: AIRCRAFT_OK }));
}

async function setPresence(page: Page, counts: Record<string, number>) {
  await page.addInitScript((c) => {
    (window as unknown as { __GLOBE_PRESENCE_TEST__: Record<string, number> }).__GLOBE_PRESENCE_TEST__ = c;
  }, counts);
}

// After every fixture's newest "at" (activity.json's 2026-09-24T04:30:00Z),
// so every intro pulse reads a real, positive time-ago rather than "just
// now" hiding a bug that would make any timestamp look fresh.
const AFTER_FIXTURES = new Date("2026-09-24T12:00:00+05:30");

test("the opening replay stages real events as pulses, no live network required", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPulseFeeds(page);
  await mockAircraft(page);
  await setPresence(page, {});
  await page.clock.setFixedTime(AFTER_FIXTURES);
  await page.goto("/globe");
  await waitForHydration(page);

  const seam = page.locator("[data-pulse-layer]");
  await expect(seam).toBeAttached({ timeout: 30_000 });
  // Six intro events stagger in at ~420ms apart -- generous timeout for the
  // slowest of them plus the poll's own fetch round trip.
  await expect.poll(async () => Number(await seam.getAttribute("data-pulse-total")), { timeout: 10_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await seam.getAttribute("data-pulse-count")), { timeout: 10_000 }).toBeGreaterThan(0);
});

test("a non-IN country with visitors now draws exactly one arc; India is skipped (a ring, not an arc)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPulseFeeds(page);
  await mockAircraft(page);
  await setPresence(page, { DE: 3, IN: 2 });
  await page.clock.setFixedTime(AFTER_FIXTURES);
  await page.goto("/globe");
  await waitForHydration(page);

  const seam = page.locator("[data-arc-layer]");
  await expect(seam).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => seam.getAttribute("data-arc-count")).toBe("1");
});

test("aircraft render from the fixture, one chevron per entry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPulseFeeds(page);
  await mockAircraft(page);
  await setPresence(page, {});
  await page.clock.setFixedTime(AFTER_FIXTURES);
  await page.goto("/globe");
  await waitForHydration(page);

  const seam = page.locator("[data-aircraft-layer]");
  await expect(seam).toBeAttached({ timeout: 30_000 });
  await expect.poll(async () => seam.getAttribute("data-aircraft-count")).toBe(String(AIRCRAFT_OK.aircraft.length));
});

test("unreachable feeds (dev/preview's real 404) draw nothing for pulses, arcs or aircraft", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Deliberately NOT mocking github-activity/ops/signals/aircraft: vite
  // preview's own 404 for every /api/* route (living-earth-lanes.md's own
  // house rule) is the real failure path this test proves degrades to
  // nothing drawn, never a stale value dressed as live.
  await setPresence(page, {});
  await page.goto("/globe");
  await waitForHydration(page);

  const pulses = page.locator("[data-pulse-layer]");
  const arcs = page.locator("[data-arc-layer]");
  const aircraft = page.locator("[data-aircraft-layer]");
  await expect(pulses).toBeAttached({ timeout: 30_000 });
  await expect(arcs).toBeAttached();
  await expect(aircraft).toBeAttached();

  // Give a real frame or two to run so a false pass isn't just "nothing
  // rendered yet" -- these must SETTLE at zero, not merely start there.
  await page.waitForTimeout(1500);
  await expect.poll(async () => pulses.getAttribute("data-pulse-count")).toBe("0");
  await expect.poll(async () => arcs.getAttribute("data-arc-count")).toBe("0");
  await expect.poll(async () => aircraft.getAttribute("data-aircraft-count")).toBe("0");
});
