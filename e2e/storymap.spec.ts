import { test, expect, waitForHydration } from "./lib/test.ts";
import { NODES } from "../src/data/storyMap.ts";
import { projects } from "../src/data/profile.ts";

/**
 * /map (ORBIT altitude): every registry project gets a constellation node,
 * including the two the map used to leave off (sinc-p, kmp-family — see
 * storyMap.test.ts for the data-level pin), and orbiting the 3D scene never
 * leaves two node labels stacked unreadably on top of each other.
 */

const projectSlugs = new Set(projects.map((p) => p.slug));

test("the constellation carries 9 project nodes, including sinc-p and kmp-family", () => {
  const projectNodes = NODES.filter((n) => projectSlugs.has(n.id));
  expect(projectNodes.map((n) => n.id).sort()).toEqual([...projectSlugs].sort());
  expect(projectNodes).toHaveLength(9);
  expect(projectNodes.some((n) => n.id === "sinc-p")).toBe(true);
  expect(projectNodes.some((n) => n.id === "kmp-family")).toBe(true);
});

test("sinc-p and kmp-family are real, clickable destinations on /map", async ({ page }) => {
  await page.goto("/map");
  await waitForHydration(page);
  // The chip row below the canvas is the keyboard/touch/screen-reader path
  // to every node (the canvas itself is aria-hidden) — real links, not just
  // data the generator emitted.
  await expect(page.getByRole("link", { name: "SINC-P" })).toBeVisible();
  await expect(page.getByRole("link", { name: "KMP toolkit family" })).toHaveAttribute(
    "href",
    "/project/kmp-family",
  );
});

test("orbiting the constellation never leaves two visible labels overlapping", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/map");
  await waitForHydration(page);
  const canvas = page.locator("#map canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  // Orbit ~200px, same drag studio-visuals.spec.ts already proves moves the
  // constellation, then let the ~150ms collision pass settle.
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 200, bounds!.y + bounds!.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  // [data-story-node-label], not a bare "span" — the page also has legend,
  // chip-row and EvidenceChip spans below the canvas that a plain selector
  // catches too, none of which the collision system manages or this test
  // means to assert about.
  const rects = await page.locator("#map [data-story-node-label]").evaluateAll((spans) =>
    spans
      .filter((el) => getComputedStyle(el).visibility !== "hidden")
      .map((el) => el.getBoundingClientRect())
      .map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
  );
  expect(rects.length).toBeGreaterThan(0);

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

test("at 390 the map falls back to the 2D canvas and stays legible, no overlapping chip-row links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/map");
  await waitForHydration(page);
  // Below the 1024px 3D breakpoint (StoryMap.tsx's isSmallScreen check):
  // the 2D canvas fallback draws its own labels on a raster, so there is no
  // separate DOM label box to test for overlap there. What IS testable at
  // this width is the real DOM: the legend, the EvidenceChip and the
  // chip-row of links never overlap each other in a normal flex layout.
  await expect(page.locator("#map canvas")).toBeVisible();
  const chips = await page.locator("#map a.tag-chip, #map button.tag-chip").evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
  );
  expect(chips.length).toBeGreaterThan(0);
  const overlaps = (a: (typeof chips)[number], b: (typeof chips)[number]) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const collisions: string[] = [];
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      if (overlaps(chips[i], chips[j])) collisions.push(`${i}<->${j}`);
    }
  }
  expect(collisions).toEqual([]);
});
