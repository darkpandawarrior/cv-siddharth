import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, waitForHydration } from "./lib/test.ts";
import { SPINE, present } from "../src/spine/registry.ts";
import { ANSWERS } from "../src/data/source/answers.ts";
import { parseAnchor } from "../src/lib/faqJsonLd.ts";

/**
 * The FAQ dock (spine F1, F2, F14; SP-01) — docked as SiteFooter's first
 * band. Covers the finish-plan brief (collapsed budget, exclusive accordion,
 * route ranking, filter, follow-up, source chips, keyboard, axe, reduced
 * motion) plus G-SPINE ("faq|spine-tail|trailing", run separately under
 * SPINE_STRICT=1 by e2e/spine.spec.ts, which this file does not duplicate).
 */

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const ACTIVITY = fixture("activity.json");
const OPS = fixture("ops.json");
const WEATHER_OK = fixture("weather-2026-09-24.json");
const NOON = "2026-09-24T12:27:00+05:30"; // the fixed instant spine.spec.ts and reality-footer.spec.ts both use

/** Every live route a footer-bearing page touches, stood in for so no test
 *  here depends on network state (same contract as reality-footer.spec.ts). */
async function mockLiveRoutes(page: Page): Promise<void> {
  await page.route("**/api/github-activity", (route) => route.fulfill({ json: ACTIVITY }));
  await page.route("**/api/ops", (route) => route.fulfill({ json: OPS }));
  await page.route("**/api/spotify", (route) => route.fulfill({ json: { connected: false } }));
  await page.route("**/api/weather", (route) => route.fulfill({ json: WEATHER_OK }));
}

async function openFaqDock(page: Page, path: string): Promise<void> {
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto(path, { waitUntil: "networkidle" });
  await page.locator("[data-spine=faq]").waitFor();
}

const FAQ = SPINE.find((e) => e.id === "faq")!;
const FOOTER_ROUTES = ["/", "/lanes", "/project/doori"];
const NO_FOOTER_ROUTE = "/forge"; // OD-S1: no footer, no FAQ, verified absent below

test.describe.configure({ mode: "parallel" });

// ── Collapsed budget (finish-plan brief; mirrors spine.spec.ts's own numbers,
// scoped to just the three routes the brief names) ─────────────────────────
for (const path of FOOTER_ROUTES) {
  for (const vp of [{ w: 1440, h: 900, max: 240 }, { w: 390, h: 844, max: 180 }]) {
    test(`${path} @${vp.w}: collapsed [data-spine=faq] is <= ${vp.max}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await openFaqDock(page, path);
      const box = await page.locator("[data-spine=faq]").boundingBox();
      expect(box).toBeTruthy();
      expect(box!.height).toBeLessThanOrEqual(vp.max);
    });
  }
}

test(`${NO_FOOTER_ROUTE} mounts no footer and no FAQ (OD-S1)`, async ({ page }) => {
  expect(present(FAQ, NO_FOOTER_ROUTE)).toBe(false);
  await mockLiveRoutes(page);
  await page.clock.setFixedTime(new Date(NOON));
  await page.goto(NO_FOOTER_ROUTE, { waitUntil: "networkidle" });
  await expect(page.locator("[data-spine=faq]")).toHaveCount(0);
});

// ── Route relevance ──────────────────────────────────────────────────────
test("/project/doori: the first answer's anchor path is /project/doori", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFaqDock(page, "/project/doori");
  const firstQuestion = await page.locator("[data-spine=faq] summary").first().textContent();
  const match = ANSWERS.find((a) => a.question === firstQuestion?.trim());
  expect(match, `no ANSWERS entry has question "${firstQuestion}"`).toBeTruthy();
  expect(parseAnchor(match!.anchor).path).toBe("/project/doori");
});

// ── Native exclusive accordion ───────────────────────────────────────────
test("opening a second answer closes the first (native <details name=faq> exclusivity)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFaqDock(page, "/");
  const items = page.locator("[data-spine=faq] details");
  const first = items.nth(0);
  const second = items.nth(1);
  await first.locator("summary").click();
  await expect(first).toHaveJSProperty("open", true);
  await second.locator("summary").click();
  await expect(second).toHaveJSProperty("open", true);
  await expect(first).toHaveJSProperty("open", false);
});

// ── Filter ────────────────────────────────────────────────────────────────
test("a filter term leaves only matching answers visible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFaqDock(page, "/");
  await waitForHydration(page);
  const total = await page.locator("[data-spine=faq] details").count();
  expect(total).toBe(ANSWERS.length);
  const target = ANSWERS.find((a) => a.id === "doori")!;
  await page.getByLabel("Filter the frequently asked questions").fill("Doori");
  const visible = page.locator("[data-spine=faq] details");
  await expect(visible).toHaveCount(1);
  await expect(visible.first().locator("summary")).toHaveText(target.question);
});

// ── Keyboard ──────────────────────────────────────────────────────────────
test("Tab reaches every summary and Enter/Space toggles it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFaqDock(page, "/");
  await waitForHydration(page);
  const summaries = page.locator("[data-spine=faq] details > summary");
  const count = await summaries.count();
  expect(count).toBe(ANSWERS.length);
  await summaries.first().focus();
  for (let i = 0; i < count; i++) {
    await expect(summaries.nth(i)).toBeFocused();
    await page.keyboard.press("Tab");
  }
  // Enter and Space both toggle the native disclosure — check on a fresh pair.
  const target = page.locator("[data-spine=faq] details").first();
  await target.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(target).toHaveJSProperty("open", true);
  await page.keyboard.press("Enter");
  await expect(target).toHaveJSProperty("open", false);
  await page.keyboard.press(" ");
  await expect(target).toHaveJSProperty("open", true);
});

// ── Reduced motion ────────────────────────────────────────────────────────
test("under reduced motion, opening an answer runs no transition", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "emulateMedia reduced-motion + transitionDuration read is checked once, on the default project");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFaqDock(page, "/");
  const content = page.locator("[data-spine=faq] details").first().locator("> div").first();
  // Tailwind's `motion-reduce:transition-none` sets `transition-property:
  // none` (not `transition-duration: 0s` — the duration utility and the
  // property utility are separate, granular classes), so "no transition
  // runs" is verified there: nothing is in the transitioned-properties list,
  // regardless of the duration still attached to it.
  const property = await content.evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(property).toBe("none");
});

// ── Follow-up → chat bus ─────────────────────────────────────────────────
test("'Ask Panda a follow-up' opens the chat panel carrying the question text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFaqDock(page, "/");
  await waitForHydration(page);
  const first = page.locator("[data-spine=faq] details").first();
  const question = (await first.locator("summary").textContent())!.trim();
  await first.locator("summary").click();
  await first.getByRole("button", { name: "Ask Panda a follow-up" }).click();
  const dialog = page.getByRole("dialog", { name: "Panda, Siddharth’s AI assistant" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(question);
});

// ── Accessibility ─────────────────────────────────────────────────────────
// Same tag set and experimental rule e2e/a11y.spec.ts scans every route
// with (AXE_TAGS/AXE_EXPERIMENTAL there), scoped to just the dock.
for (const path of ["/", "/project/doori"]) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`axe: ${path} @${vp.width} has no serious or critical violation in the FAQ dock`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openFaqDock(page, path);
      const results = await new AxeBuilder({ page })
        .include("[data-spine=faq]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .options({ rules: { "label-content-name-mismatch": { enabled: true } } })
        .analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
    });
  }
}

// ── SSR / build artifacts (F1/F2/F14) ─────────────────────────────────────
// Reads the SAME dist/ Playwright's own webServer just built (npm run build
// runs before webServer serves it — playwright.config.ts), so this needs no
// page and no extra build step of its own.
test.describe("SSR output", () => {
  const dist = (p: string) => readFileSync(join(import.meta.dirname, "..", "dist", "client", p), "utf8");

  test("dist/client/project/doori/index.html contains every ANSWERS question", () => {
    const html = dist("project/doori/index.html");
    for (const a of ANSWERS) expect(html).toContain(a.question.replace(/'/g, "&#x27;"));
  });

  test("dist/client/index.html has exactly one FAQPage JSON-LD block", () => {
    const html = dist("index.html");
    const blocks = html.match(/<script type="application\/ld\+json">[^<]*<\/script>/g) ?? [];
    const faqBlocks = blocks.filter((b) => b.includes('"@type":"FAQPage"'));
    expect(faqBlocks).toHaveLength(1);
  });

  test("dist/client/lanes/index.html has no FAQPage JSON-LD (jsonLd is / only)", () => {
    const html = dist("lanes/index.html");
    expect(html).not.toContain('"@type":"FAQPage"');
  });
});
