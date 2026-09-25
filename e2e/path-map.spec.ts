import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * P1-04: "your path" on /map (reality-spec §6, living-ledger §6.2's focus
 * hand-off, idea-atlas PATH-1). Every navigation below is a real in-app
 * <Link> click, never `page.goto` mid-sequence — sessionRipple.ts is
 * module-scope state that a full page load (a fresh JS bundle) would reset,
 * exactly the way it resets on a real reload by design.
 */

test("visiting doori then gaddi lights exactly those two nodes on /map, with a solid edge between them", async ({ page }) => {
  // Reduced motion keeps StoryMap.tsx on its 2D canvas fallback
  // (`wants3D = !reduced && ...`). The 3D scene's drei <Html> labels
  // (StoryMapScene.tsx, not owned by this lane) intercept clicks on the
  // chip-row links underneath them even outside the canvas box, a
  // pre-existing bug this test works around rather than masks; the flow
  // below is testing sessionRipple plus the overlay, not that renderer.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/map");
  await waitForHydration(page);

  await page.locator('a[href="/project/doori"]').first().click();
  await waitForHydration(page);
  await page.locator('a[href="/map"]').first().click();
  await waitForHydration(page);

  await page.locator('a[href="/project/gaddi"]').first().click();
  await waitForHydration(page);
  await page.locator('a[href="/map"]').first().click();
  await waitForHydration(page);

  const touched = page.locator("#map [data-touched]");
  await expect(touched).toHaveCount(2);
  const ids = await touched.evaluateAll((els) => els.map((el) => el.getAttribute("data-touched")));
  expect(ids.sort()).toEqual(["doori", "gaddi"]);

  await expect(page.locator("#map [data-solid]")).toHaveAttribute("data-edge", "doori-gaddi");
});

test("no touches renders today's graph, with no [data-touched] node", async ({ page }) => {
  await page.goto("/map");
  await waitForHydration(page);
  await expect(page.locator("#map [data-touched]")).toHaveCount(0);
  await expect(page.locator("#map [data-solid]")).toHaveCount(0);
});

test("?focus=kmp-family centres and lights that node; ?focus=bogus falls back with no error", async ({ page }) => {
  await page.goto("/map?focus=kmp-family");
  await waitForHydration(page);
  await expect(page.locator('#map [data-focused="kmp-family"]')).toHaveCount(1);

  // Same drop as smoke.spec.ts's EXPECTED_404 pass: local preview 404s on the
  // Vercel Speed Insights and Web Analytics scripts, which only resolve once
  // deployed. Their console form carries no URL, so this string match is the
  // only way to name them here; a genuine console.error from the page still
  // fails the assertion below.
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.text().includes("Failed to load resource:")) return;
    errors.push(msg.text());
  });
  await page.goto("/map?focus=bogus");
  await waitForHydration(page);
  await expect(page.locator("#map [data-focused]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`at ${viewport.width}x${viewport.height}, no two visible node labels overlap after a 3s orbit`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/map");
    await waitForHydration(page);
    const canvas = page.locator("#map canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();

    // Same orbit gesture as storymap.spec.ts's collision test (below the
    // 1024px breakpoint this is a no-op drag over the 2D fallback, which is
    // fine — that renderer has no [data-story-node-label] DOM boxes at all).
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 + 200, bounds!.y + bounds!.height / 2, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(3000);

    const rects = await page.locator("#map [data-story-node-label]").evaluateAll((spans) =>
      spans
        .filter((el) => getComputedStyle(el).visibility !== "hidden")
        .map((el) => el.getBoundingClientRect())
        .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
    );
    const overlaps = (a: (typeof rects)[number], b: (typeof rects)[number]) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const collisions: string[] = [];
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(rects[i], rects[j])) collisions.push(`${i}<->${j}`);
      }
    }
    expect(collisions, `overlapping visible labels after orbit: ${collisions.join(", ")}`).toEqual([]);
  });
}
