import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, waitForHydration } from "./lib/test.ts";
import { kmpGraph } from "../src/data/kmpGraph.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

async function mockLiveSignals(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/signals", (route) => route.fulfill({ path: "e2e/fixtures/live/signals.json" }));
  await page.route("**/api/github-activity", (route) => route.fulfill({ path: "e2e/fixtures/activity.json" }));
}

test.describe("CiStrip — reality-spec.md §6 + live-data-spec.md §3", () => {
  test("paymentslab-kmp: main-branch CI and APK downloads from /api/signals", async ({ page }) => {
    await mockLiveSignals(page);
    await page.goto("/project/paymentslab-kmp");
    const strip = page.locator("p", { hasText: "APK downloads" });
    await expect(strip).toContainText("main CI ✗");
    await expect(strip).toContainText("22 APK downloads");
  });

  test("stutter: no CI or downloads clause, fixed private label instead", async ({ page }) => {
    await mockLiveSignals(page);
    await page.goto("/project/stutter");
    await expect(page.getByText("private, not polled")).toBeVisible();
    await expect(page.getByText(/main CI/)).toHaveCount(0);
    await expect(page.getByText(/APK downloads/)).toHaveCount(0);
  });
});

test.describe("KmpAdoption matrix — /project/kmp-family", () => {
  test("renders modules x 5 cells and a Mermaid SVG with one node per module", async ({ page }) => {
    await page.goto("/project/kmp-family");
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(kmpGraph.modules.length);
    // 5 known consumers (idea-atlas.md#I2): doori, gaddi, paymentslab-kmp, candidai, portfolio.
    await expect(rows.first().locator("td")).toHaveCount(5);

    const heading = page.getByRole("heading", { name: "Every catalog module, one node each" });
    await heading.scrollIntoViewIfNeeded();
    // By id (Mermaid's own `id={\`mmd-${slug}-modules\`}`), not `.mermaid-wrap
    // svg last()`: this page also renders the "architecture" diagrams
    // (d.diagrams, e.g. "Three repos, one seam each") from an EARLIER
    // section, each its own async Mermaid render. `.last()` re-queries the
    // DOM on every poll, so `toBeVisible()` was satisfied by whichever
    // <mermaid-wrap svg> happened to exist LAST *so far* the moment it
    // polled — usually this one, but under load the architecture diagram
    // above it (50 nodes) sometimes finishes rendering after this one and
    // becomes the new last(), and the very next line's `.count()` call
    // re-resolves `.last()` and reads ITS count instead
    // (e2e/project-depth.spec.ts: flaky, exact under isolation, inflated by
    // the other diagram's node count under the full suite). Targeting this
    // diagram's own id is unambiguous regardless of render order.
    const svg = page.locator("svg#mmd-kmp-family-modules");
    await expect(svg).toBeVisible({ timeout: 15_000 });
    const nodeCount = await svg.locator(".node").count();
    expect(nodeCount).toBe(kmpGraph.modules.length);
  });
});

test.describe("GatewayCompare — /project/paymentslab-kmp", () => {
  test("switching two providers updates both columns independently", async ({ page }) => {
    await page.goto("/project/paymentslab-kmp");
    const selects = page.locator("section", { has: page.getByText("cataloged gateways") }).locator("select");
    await expect(selects).toHaveCount(2);

    const before = await Promise.all([selects.nth(0).inputValue(), selects.nth(1).inputValue()]);
    const optionValues = await selects.nth(1).locator("option").evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    const nextForB = optionValues.find((v) => v !== before[1]);
    expect(nextForB).toBeDefined();

    await selects.nth(1).selectOption(nextForB!);
    await expect(selects.nth(0)).toHaveValue(before[0]); // column A untouched
    await expect(selects.nth(1)).toHaveValue(nextForB!); // column B updated

    const optionValuesA = await selects.nth(0).locator("option").evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    const nextForA = optionValuesA.find((v) => v !== before[0] && v !== nextForB);
    expect(nextForA).toBeDefined();
    await selects.nth(0).selectOption(nextForA!);
    await expect(selects.nth(0)).toHaveValue(nextForA!);
    await expect(selects.nth(1)).toHaveValue(nextForB!); // column B still holds its own pick
  });
});

test.describe("Earned density — idea-atlas.md#PATH-2", () => {
  test("fresh session is FOCUS, then GUIDED after two other project pages", async ({ page }) => {
    await page.goto("/project/doori");
    await waitForHydration(page);
    await expect(page.locator("[data-density]")).toHaveAttribute("data-density", "FOCUS");
    await expect(page.getByText("Go deeper", { exact: true })).toBeVisible();

    // Client-side navigation (the "next build" pager — present on every
    // project page, TanStack Router intercepts the click, no full reload),
    // so sessionRipple's module-scope touched list survives across pages
    // the way it would for a real visitor clicking through the site.
    const nextBuild = () => page.locator("a").filter({ hasText: "next build" }).first();
    await nextBuild().click();
    await nextBuild().click(); // now on a third distinct project: 2 OTHER pages touched

    await expect(page.locator("[data-density]")).toHaveAttribute("data-density", "GUIDED");
    await expect(page.getByText(/You've explored other builds this session/)).toBeVisible();
  });

  test("prerendered HTML carries the ANALYST-only sentence for a no-JS reader", () => {
    const html = readFileSync(join(ROOT, "dist/client/project/doori/index.html"), "utf8");
    expect(html).toContain("data-density=\"FOCUS\"");
    expect(html).toMatch(/Analyst view: .*?draws on .*? stack entries/);
  });
});
