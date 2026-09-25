import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * P1-01b's chrome (reality-spec.md#P7/#R2 subset, spine F15/F16, master-plan
 * M23/M57/M58): the SkyLine hairline mounted once in __root, the hero's
 * hydration safety, /hire's two clocks, and the 404's "last near" branch.
 *
 * The footer weather chip (P1-01a), /terminal's `now` command (P2-16) and
 * /ops's reality rows (P2-14) are covered by other lanes' specs — M23's
 * split. Every live route these tests touch is mocked (G10); nothing here
 * hits a real network.
 */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const WEATHER = fixture("weather-2026-09-24.json");
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");

/** Every /api/* SkyLine's __root mount and a route's own footer can touch,
 *  mocked the same way reality-footer.spec.ts does it — SkyLine itself only
 *  reads /api/weather, but several of these routes also render SiteFooter. */
async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false } }));
}

const TIMES = {
  night: "2026-09-24T03:15:00+05:30",
  goldenSunrise: "2026-09-24T06:24:00+05:30",
  noon: "2026-09-24T12:27:00+05:30",
  dusk: "2026-09-24T18:30:00+05:30",
} as const;

test.describe("SkyLine (P7, spine F15/M58)", () => {
  test("at solar noon: daypart='day' and progress in [0.48, 0.52]", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.noon));
    await page.goto("/", { waitUntil: "networkidle" });
    const line = page.locator("[data-sky-line]");
    await expect(line).toHaveAttribute("data-daypart", "day");
    const progress = Number(await line.getAttribute("data-sun-progress"));
    expect(progress).toBeGreaterThanOrEqual(0.48);
    expect(progress).toBeLessThanOrEqual(0.52);
  });

  test("at night: daypart='night' and the dot is not rendered", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.night));
    await page.goto("/", { waitUntil: "networkidle" });
    const line = page.locator("[data-sky-line]");
    await expect(line).toHaveAttribute("data-daypart", "night");
    // The dot is its own aria-hidden span; the sr-only sentence carries no
    // aria-hidden attribute, so this selector can't accidentally match it.
    await expect(line.locator('[aria-hidden="true"]')).toHaveCount(0);
  });

  test("near sunset: progress is at or past the top of the line", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.dusk));
    await page.goto("/", { waitUntil: "networkidle" });
    const progress = Number(await page.locator("[data-sky-line]").getAttribute("data-sun-progress"));
    expect(progress).toBeGreaterThanOrEqual(0.99);
  });

  test("/resume in print media: the sky-line is not visible", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.noon));
    await page.goto("/resume", { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("[data-sky-line]")).not.toBeVisible();
  });

  for (const [label, at] of Object.entries(TIMES)) {
    test(`no hydration warnings on / at ${label}`, async ({ page }) => {
      const hydrationWarnings: string[] = [];
      page.on("console", (msg) => {
        if (/hydrat/i.test(msg.text())) hydrationWarnings.push(msg.text());
      });
      await mockLiveRoutes(page);
      await page.clock.setFixedTime(new Date(at));
      await page.goto("/", { waitUntil: "networkidle" });
      expect(hydrationWarnings).toEqual([]);
    });
  }
});

test.describe("/hire — two clocks (reality-spec.md#6)", () => {
  test("shows Pune's real time and daypart beside the visitor's own, from Intl alone", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.night));
    await page.goto("/hire", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(/03:15 in Pune \(night\)/);
  });

  test("with timezoneId America/Los_Angeles at 03:15 IST: '03:15 in Pune' and '14:45 where you are'", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "America/Los_Angeles" });
    const page = await context.newPage();
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(TIMES.night));
    await page.goto("/hire", { waitUntil: "networkidle" });
    const body = page.locator("body");
    await expect(body).toContainText(/03:15 in Pune/);
    await expect(body).toContainText(/14:45 where you are/);
    await context.close();
  });
});

test.describe("404 — 'last near' the visitor's own path (reality-spec.md#6 $, P1-04's touch())", () => {
  test("client-side nav after touching a project names it and links back; a fresh load does not", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.goto("/project/doori", { waitUntil: "networkidle" });
    await waitForHydration(page);
    // project.$slug.tsx's own mount effect calls touch("doori") — poll for it
    // rather than assuming one tick is enough.
    await expect
      .poll(() => page.evaluate(() => !!(window as unknown as { __e2eRouter?: unknown }).__e2eRouter))
      .toBe(true);

    // Genuine client-side navigation to a path nothing in the UI links to —
    // e2e/reality-chrome.spec.ts's own acceptance line names "router
    // navigate" as one of the two sanctioned ways in (see __root.tsx's
    // E2ERouterHandle).
    await page.evaluate(() => {
      (window as unknown as { __e2eRouter: { navigate: (o: { to: string }) => void } }).__e2eRouter.navigate({
        to: "/this-route-does-not-exist",
      });
    });
    await expect(page).toHaveURL(/\/this-route-does-not-exist$/);
    // Scoped to the 404 copy's own paragraph: AnomalyRail's live commit feed
    // also renders a "Doori" link globally (real GitHub activity), and an
    // unscoped getByRole here is a strict-mode violation against it.
    const lastNear = page.getByText(/You were last near Doori/);
    await expect(lastNear).toBeVisible();
    await expect(lastNear.getByRole("link", { name: "Doori" })).toHaveAttribute("href", "/project/doori");

    // sessionRipple is in-memory by design: a fresh full page load of the
    // SAME url starts empty, so the branch falls back to the plain CTA.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/You were last near/)).toHaveCount(0);
    await expect(page.getByText(/The atlas \(every project/)).toBeVisible();
  });
});
