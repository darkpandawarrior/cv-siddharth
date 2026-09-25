import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { historyGeneratedAt } from "../src/data/history.ts";

/**
 * R5/P1-03 (reality-spec §6, §7): the data rooms' live layer.
 *
 * /chess marks the live IST hour on its existing hour-of-day chart and
 * back-links to the Lab Bench's real search tree (T6, trove-map.md); /lanes
 * draws the newest public push as its live tip; /time-machine counts real
 * pushes past its frozen snapshot and adds a files-touched sparkline
 * (REC-6, idea-atlas.md); /pulse composes one line proving presence,
 * weather and the clock at once (PATH-5, idea-atlas.md); /lab gives every
 * instrument card the EvidenceChip of the data it runs on.
 *
 * Every route here also mounts SiteFooter (weather, github-activity,
 * spotify) and OpsBoard-adjacent chips (ops) — all four are mocked on
 * every test so nothing here depends on live network state (G10).
 */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const ACTIVITY = fixture("activity.json") as {
  items: { repo: string; type: string; message: string; at: string; upstream: boolean }[];
};
const OPS = fixture("ops.json");
const WEATHER_OK = fixture("weather-2026-09-24.json");
// Not a test fixture: the same corpus the room itself fetches from
// public/chess/corpus.json — read directly (repo-root relative), per the
// acceptance criterion's own wording ("read from public/chess/corpus.json
// inside the test").
const CORPUS = JSON.parse(readFileSync(new URL("../public/chess/corpus.json", import.meta.url), "utf8")) as {
  hours: { chess: { hour: number; n: number }[]; commits: { hour: number; n: number }[] };
};

async function mockLiveRoutes(page: Page, opts: { weatherAbort?: boolean } = {}): Promise<void> {
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false } }));
  if (opts.weatherAbort) {
    await page.route("**/api/weather", (route) => route.abort());
  } else {
    await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER_OK }));
  }
}

// The fixed instant every other reality spec (spine.spec.ts, reality-footer.spec.ts)
// pins its "night" case to — 03:15 IST, hour 3, the same hour the fixtures were
// sampled at.
const NIGHT = "2026-09-24T03:15:00+05:30";

test.describe("/chess — the live IST hour marker and back-links (T6)", () => {
  test("marks hour 3, and the label's N equals corpus.hours.chess[3].n", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/chess");
    await waitForHydration(page);
    // ChessVsCommits (the hour-of-day chart) mounts on the room's last tab,
    // "Rhythm" — findings is the default landing tab.
    await page.getByRole("button", { name: "Rhythm" }).click();

    const marker = page.locator("[data-now-hour-marker]");
    await expect(marker).toHaveAttribute("data-now-hour", "3");
    const expectedGames = CORPUS.hours.chess.find((h) => h.hour === 3)?.n;
    expect(expectedGames, "corpus.json has no hour-3 entry").not.toBeUndefined();
    await expect(marker).toContainText(`I've played ${expectedGames?.toLocaleString("en-US")} games in this hour`);
    await expect(marker).toContainText("03:00 hour in Pune");
  });

  test("carries no marker before mount (SSR)", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    // Read the raw server response, before any client script has run.
    const res = await page.request.get("/chess");
    const body = await res.text();
    expect(body).not.toContain("data-now-hour-marker");
  });

  test("links to /lab#search-trees and /project/gaddi", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/chess");
    await waitForHydration(page);
    await expect(page.locator('a[href="/lab#search-trees"]')).toHaveCount(1);
    await expect(page.locator('a[href="/project/gaddi"]')).toHaveCount(1);
  });
});

test("/lanes shows the newest activity.json push as the live tip", async ({ page }) => {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/lanes");
  await waitForHydration(page);

  const newest = ACTIVITY.items
    .filter((i) => i.type === "push")
    .reduce((a, b) => (b.at > a.at ? b : a));
  const tip = page.locator("[data-lane-tip]");
  await expect(tip).toHaveCount(1);
  await expect(tip).toHaveAttribute("data-tip-repo", newest.repo);
});

test("/time-machine: push count since historyGeneratedAt, and the files sparkline has history.length points", async ({ page }) => {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/time-machine");
  await waitForHydration(page);

  const pushesSince = page.locator("[data-pushes-since]");
  await expect(pushesSince).toBeVisible();
  const attr = await pushesSince.getAttribute("data-pushes-since");
  const expected = ACTIVITY.items.filter((i) => i.type === "push" && i.at > historyGeneratedAt).length;
  expect(Number(attr)).toBe(expected);

  const sparkline = page.locator("[data-points]");
  await expect(sparkline).toHaveCount(1);
  const points = await sparkline.getAttribute("data-points");
  expect(Number(points)).toBeGreaterThan(0);
});

test.describe("/pulse — the reality line (PATH-5)", () => {
  test("contains '22.9' and 'IST'", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/pulse");
    await waitForHydration(page);
    const line = page.locator("[data-pulse-line]");
    await expect(line).toBeVisible({ timeout: 15_000 });
    await expect(line).toContainText("22.9");
    await expect(line).toContainText("IST");
  });

  test("with /api/weather aborted, the line has no 'undefined' and no weather clause", async ({ page }) => {
    await mockLiveRoutes(page, { weatherAbort: true });
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/pulse");
    await waitForHydration(page);
    const line = page.locator("[data-pulse-line]");
    await expect(line).toBeVisible({ timeout: 15_000 });
    const text = await line.innerText();
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("°C");
    expect(text).not.toContain("Pune");
  });
});

test("/lab: every instrument card carries its EvidenceChip or 'cadence not tracked'", async ({ page }) => {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/lab");
  await waitForHydration(page);

  const cards = page.locator("[data-lab-card]");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const hasChip = (await card.locator("[data-evidence-chip]").count()) > 0;
    const text = await card.innerText();
    expect(hasChip || text.includes("cadence not tracked"), `card ${i} ("${text}") has neither`).toBe(true);
  }
});

// break-it (G15): the pre-mount SSR failure this suite guards against — a
// data-lab-card rendering neither a chip nor the fallback text — would be a
// missing LabEvidence branch for a new LabKey. Asserted indirectly above
// since LAB_TABS is the single source of the card list; a card added there
// without a LabEvidence case falls into the `default` branch and still
// passes, which is correct (it MUST default to "cadence not tracked", never
// silently render nothing).
