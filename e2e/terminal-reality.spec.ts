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

// This one test deliberately imports plain @playwright/test's own `base`
// rather than the visitor-safe `test` above (same trade-off visitors.spec.ts
// documents for itself): it round-trips through three /project pages, and
// the visitor-safe page's localStorage-denial init script interacts badly
// with the browser's View Transitions API on that path (observed: a
// `pageerror` "Transition was skipped" right as the project page's chunk
// mounts, which silently drops its `touch(slug)` effect) — a test
// infrastructure interaction, not a Terminal.tsx defect. Counted as one
// ordinary visitor, same as visitors.spec.ts's own tests.
base.describe("router hint (idea-atlas.md#PATH-5)", () => {
  base("help and now stay quiet below the threshold, and suggest `open kmp-family` at 3 KMP-family touches", async ({ page }) => {
    await mockLiveRoutes(page);
    // No fixed clock here on purpose: this test's own assertions never read a
    // time value, and Playwright's clock mock also fakes the timer/scheduler
    // primitives React's route transitions use, so a route mounted under a
    // frozen clock never runs its effects (`touch(slug)` included) until
    // something calls `page.clock.runFor`/`fastForward` to release them.
    await page.goto("/terminal");
    await waitForHydration(page);

    await runCommand(page, "help");
    await expect(output(page)).not.toContainText("open kmp-family");

    // `open <slug>` navigates client-side (no reload), so sessionRipple's
    // module-scope touched list survives; `page.goBack()` is the same
    // client-side history pop, which is what brings the terminal back
    // without losing that state. Neither `waitForURL` nor `waitForHydration`
    // is enough of a signal on its own here: ProjectDetail's hero `<h1>`
    // carries a `viewTransitionName` (a card-to-detail morph), and popping
    // back while that transition is still in flight gets it logged as
    // "Transition was skipped" and never actually swaps the DOM in — so the
    // still-mounted `/terminal` shell (which has its own, different, sr-only
    // `<h1>`) satisfies a generic `h1` or hydration wait immediately, before
    // `touch(slug)` ever runs. Waiting for THIS project's own heading text
    // is what actually proves the transition landed.
    const PROJECT_NAME: Record<string, string> = { doori: "Doori", gaddi: "Gaddi", "paymentslab-kmp": "PaymentsLab-KMP" };
    for (const slug of ["doori", "gaddi", "paymentslab-kmp"]) {
      await runCommand(page, `open ${slug}`);
      await page.waitForURL(`**/project/${slug}`);
      await page.getByRole("heading", { level: 1, name: PROJECT_NAME[slug] }).waitFor();
      await page.goBack();
      await page.waitForURL("**/terminal");
      await waitForHydration(page);
    }

    await runCommand(page, "help");
    // Scoped to this command's own output block, not the whole scrollback
    // (which still carries the first, hint-free `help` from above): "try"
    // alone is not distinctive enough either, since help's own standing
    // footer always reads "try open doori". Exactly one suggestion, never
    // a menu, per idea-atlas.md#PATH-5.
    const helpBlock = output(page).locator(".term-line").last();
    await expect(helpBlock).toContainText("open kmp-family");
    expect(await helpBlock.getByText("open kmp-family").count()).toBe(1);

    await runCommand(page, "now");
    const nowBlock = output(page).locator(".term-line").last();
    await expect(nowBlock).toContainText("open kmp-family");
    expect(await nowBlock.getByText("open kmp-family").count()).toBe(1);
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
