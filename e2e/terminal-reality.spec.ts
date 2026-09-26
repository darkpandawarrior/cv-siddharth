import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { test, waitForHydration } from "./lib/test.ts";

/**
 * P2-16 (reality-spec.md#6 /terminal, live-data-spec.md#3 /terminal
 * extension, #4 R7, idea-atlas.md#PATH-5): `now`/`weather` prints the
 * Reality ledger as nine lines, `sky` prints five, and the router hint
 * fires once after three KMP-family project touches.
 *
 * Every /api/* route is mocked (G10) — this spec never depends on live
 * network state.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (path: string): unknown => JSON.parse(readFileSync(join(root, "e2e", "fixtures", path), "utf8"));

const WEATHER_OK = fixture("weather-2026-09-24.json");
const SIGNALS_OK = fixture("live/signals.json");
const TLE_OK = fixture("tle.json");
const ACTIVITY_OK = {
  connected: true,
  items: [
    { repo: "darkpandawarrior/doori", type: "push", message: "fix: settle sync race", url: "https://github.com/x", at: "2026-09-24T02:40:00Z", upstream: false },
    { repo: "darkpandawarrior/gaddi", type: "push", message: "chore: bump kmp-toolkit", url: "https://github.com/x", at: "2026-09-24T01:10:00Z", upstream: false },
    { repo: "someone/upstream-repo", type: "push", message: "not his own", url: "https://github.com/x", at: "2026-09-24T03:00:00Z", upstream: true },
  ],
};

// The fixed instant every other reality spec pins its "night" case to
// (reality-rooms.spec.ts, spine.spec.ts): fresh against tle.json's
// 2026-09-23T22:26:56Z epoch (< 7 days), and matches weather-2026-09-24.json.
const NIGHT = "2026-09-24T03:15:00+05:30";

async function mockLiveRoutes(page: Page, opts: { abortAll?: boolean } = {}): Promise<void> {
  if (opts.abortAll) {
    await page.route("**/api/weather", (route) => route.abort());
    await page.route("**/api/signals", (route) => route.abort());
    await page.route("**/api/tle", (route) => route.abort());
    await page.route("**/api/github-activity", (route) => route.abort());
    await page.route("**/api/ops", (route) => route.abort());
    await page.route("**/api/spotify", (route) => route.abort());
    return;
  }
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER_OK }));
  await page.route("**/api/signals", (route) => route.fulfill({ json: SIGNALS_OK }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: TLE_OK }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY_OK }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: { connected: false } }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false } }));
}

async function runCommand(page: Page, cmd: string) {
  const input = page.getByRole("textbox");
  await input.fill(cmd);
  await input.press("Enter");
}

/** The one region a command's output lands in (terminal.spec.ts's own locator). */
function output(page: Page) {
  return page.getByRole("main", { name: "terminal output" });
}

const TAG_WORD = /live|computed|modelled|unavailable/;
const SKY_TAG_WORD = /live|computed|calendar|unavailable/;

test.describe("`now` / `weather`: the Reality ledger as text", () => {
  test("prints sun, weather, air, river, moon, chess, CI, last push and visitors, each tagged", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/terminal");
    await waitForHydration(page);

    await runCommand(page, "now");
    const out = output(page);
    for (const label of ["Sun ·", "Weather ·", "Air ·", "River ·", "Moon ·", "Chess ·", "CI ·", "Last push ·", "Visitors ·"]) {
      await expect(out).toContainText(label);
    }
    // Every one of those nine lines carries a required tag word — assert per
    // line rather than "the block contains one somewhere", so a line that
    // silently lost its tag (e.g. a fallback string edited later) still fails.
    const text = (await out.innerText()).split("\n").filter((l) => /·/.test(l));
    const ledgerLines = text.filter((l) =>
      ["Sun ·", "Weather ·", "Air ·", "River ·", "Moon ·", "Chess ·", "CI ·", "Last push ·", "Visitors ·"].some((p) => l.includes(p)),
    );
    expect(ledgerLines.length).toBeGreaterThanOrEqual(9);
    for (const line of ledgerLines) expect(line, line).toMatch(TAG_WORD);
  });

  test("`weather` is an alias for `now`", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/terminal");
    await waitForHydration(page);
    await runCommand(page, "weather");
    await expect(output(page)).toContainText("Sun ·");
    await expect(output(page)).toContainText("Weather ·");
  });
});

test.describe("`sky`: sun, moon, next meteor peak, ISS and festival", () => {
  test("prints exactly 5 lines, each tagged live/computed/calendar/unavailable", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/terminal");
    await waitForHydration(page);
    await runCommand(page, "sky");

    const out = output(page);
    await expect(out).toContainText("Sun ·");
    await expect(out).toContainText("Moon ·");
    await expect(out).toContainText("Meteor ·");
    // ISS's next-visible-pass line needs a real (idle-scanned) SGP4 sweep —
    // give it more room than the default 5 s expect timeout.
    await expect(out).toContainText("ISS ·", { timeout: 10_000 });
    await expect(out).toContainText("Festival ·");

    const text = (await out.innerText()).split("\n").filter((l) => /·/.test(l));
    const skyLines = text.filter((l) => ["Sun ·", "Moon ·", "Meteor ·", "ISS ·", "Festival ·"].some((p) => l.includes(p)));
    expect(skyLines).toHaveLength(5);
    for (const line of skyLines) expect(line, line).toMatch(SKY_TAG_WORD);
  });

  test("with every /api/* aborted, prints 5 'unavailable' lines within 5 s", async ({ page }) => {
    await mockLiveRoutes(page, { abortAll: true });
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/terminal");
    await waitForHydration(page);
    await runCommand(page, "sky");

    const out = output(page);
    await expect(out).toContainText("Sun · unavailable right now", { timeout: 5_000 });
    await expect(out).toContainText("Moon · unavailable right now");
    await expect(out).toContainText("Meteor · unavailable right now");
    await expect(out).toContainText("ISS · unavailable right now");
    await expect(out).toContainText("Festival · unavailable right now");

    const text = (await out.innerText()).split("\n").filter((l) => /·/.test(l));
    const skyLines = text.filter((l) => ["Sun ·", "Moon ·", "Meteor ·", "ISS ·", "Festival ·"].some((p) => l.includes(p)));
    expect(skyLines).toHaveLength(5);
    for (const line of skyLines) expect(line, line).toContain("unavailable");
  });

  test("shows the active festival on its own date (calendar-diwali fixture)", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date("2026-11-08T12:00:00Z"));
    await page.goto("/terminal");
    await waitForHydration(page);
    await runCommand(page, "sky");
    await expect(output(page)).toContainText("Festival · Diwali today");
  });
});

test.describe("router hint (idea-atlas.md#PATH-5)", () => {
  test("help and now stay quiet below the threshold, and suggest `open kmp-family` at 3 KMP-family touches", async ({ page }) => {
    await mockLiveRoutes(page);
    await page.clock.setFixedTime(new Date(NIGHT));
    await page.goto("/terminal");
    await waitForHydration(page);

    await runCommand(page, "help");
    await expect(output(page)).not.toContainText("open kmp-family");

    // `open <slug>` navigates client-side (no reload), so sessionRipple's
    // module-scope touched list survives; `page.goBack()` is the same
    // client-side history pop, which is what brings the terminal back
    // without losing that state.
    for (const slug of ["doori", "gaddi", "paymentslab-kmp"]) {
      await runCommand(page, `open ${slug}`);
      await page.waitForURL(`**/project/${slug}`);
      await page.goBack();
      await page.waitForURL("**/terminal");
      await waitForHydration(page);
    }

    await runCommand(page, "help");
    await expect(output(page)).toContainText("try");
    await expect(output(page)).toContainText("open kmp-family");
    // Exactly one suggestion, never a menu.
    expect(await output(page).getByText("try").count()).toBe(1);

    await runCommand(page, "now");
    await expect(output(page)).toContainText("open kmp-family");
  });
});

// Plain `@playwright/test`, not the visitor-safe `test` above: this one reads
// a build artifact off disk, opens no page, and needs no localStorage guard.
base("build gate: the Terminal chunk never statically imports satellites (manifest check)", () => {
  const distClient = join(root, "dist", "client");
  expect(existsSync(distClient), "dist/client is missing — run `npm run build` first").toBe(true);
  const manifest = JSON.parse(readFileSync(join(distClient, ".vite", "manifest.json"), "utf8")) as Record<
    string,
    { file: string; isEntry?: boolean; src?: string }
  >;
  const terminalEntry = Object.entries(manifest).find(([key]) => key.includes("Terminal"));
  expect(terminalEntry, "no Terminal.tsx entry in the manifest").toBeTruthy();
  const [, meta] = terminalEntry!;
  const chunkSrc = readFileSync(join(distClient, meta.file), "utf8");
  expect(chunkSrc.includes("twoline2satrec")).toBe(false);
});
