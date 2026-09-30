import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * LANE U1 (composition): the HUD row, layer panel, left-slot inspector/tour
 * card, fact list, and phone bottom sheets never cover each other or the
 * globe's own disc. Fixed clock, every /api/* route mocked (G10, same
 * discipline as e2e/globe.spec.ts).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const weatherFixture = JSON.parse(readFileSync(join(FIXTURES, "weather-2026-09-24.json"), "utf8"));
const tleFixture = JSON.parse(readFileSync(join(FIXTURES, "tle.json"), "utf8"));
const aircraftFixture = JSON.parse(readFileSync(join(FIXTURES, "aircraft.json"), "utf8"));
const whereamiFixture = JSON.parse(readFileSync(join(FIXTURES, "whereami-IN.json"), "utf8"));

async function withApiFixtures(page: Page) {
  await page.route("**/api/weather", (route) => route.fulfill({ json: weatherFixture }));
  await page.route("**/api/tle", (route) => route.fulfill({ json: tleFixture }));
  await page.route("**/api/aircraft", (route) => route.fulfill({ json: aircraftFixture }));
  await page.route("**/api/whereami", (route) => route.fulfill({ json: whereamiFixture }));
}

async function openGlobe(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await withApiFixtures(page);
  await page.clock.setFixedTime(new Date("2026-09-24T12:27:00+05:30"));
  await page.goto("/globe");
  await waitForHydration(page);
  const canvas = page.locator("[data-globe-root] canvas").first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-globe-stage]")).toHaveAttribute("data-chrome-measured", "true");
  await expect.poll(() => page.locator("[data-subsolar-probe]").getAttribute("data-globe-r")).not.toBeNull();
  return canvas;
}

type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The globe's own screen disc (GlobeScene's SubsolarProbe), as a bounding
 *  square — the same reduction e2e/globe-L7.spec.ts uses to click it. */
async function globeDiscBox(page: Page): Promise<Box> {
  const probe = page.locator("[data-subsolar-probe]");
  await expect.poll(async () => probe.getAttribute("data-globe-x")).not.toBeNull();
  const canvasBox = await page.locator("[data-globe-root] canvas").first().boundingBox();
  if (!canvasBox) throw new Error("globe canvas has no bounding box");
  const [gx, gy, gr] = await Promise.all(
    ["x", "y", "r"].map(async (k) => Number(await probe.getAttribute(`data-globe-${k}`))),
  );
  return { x: canvasBox.x + gx - gr, y: canvasBox.y + gy - gr, width: gr * 2, height: gr * 2 };
}

// The fully opaque, structural surfaces the brief spends its words on (the
// panel column, the shared inspector/tour card): these may never sit on top
// of each other, the topbar, or the globe's own disc.
const OPAQUE_PANEL_SELECTORS = ["[data-globe-layer-panel]", "[data-globe-inspector]", "[data-globe-tour]"] as const;

// Two surfaces this layout deliberately paints as translucent overlays, not
// opaque columns, and so are checked against the opaque panels above (a
// real collision there IS a bug — see the Inspector card's own
// `--globe-top-offset` fix) but NOT against the globe disc:
//   - The topbar's two flex clusters (HUD pills, the compact time bar, the
//     tour's idle pill, the back-to-orbit pill): `backdrop-blur` floating
//     controls over the canvas, the same "controls float over the map"
//     pattern every reviewed screenshot at every breakpoint shows working
//     cleanly. Not the outer topbar wrapper: that div is a full-width
//     flex-wrap row with a padded-away right region (reserved for the layer
//     panel column) — real, but empty — so testing the wrapper itself would
//     fail on padding that paints nothing, not an actual collision.
//   - The fact list (`data-globe-panel`): Globe.tsx paints it with
//     `bg-gradient-to-t ... to-transparent` specifically so its OWN top
//     edge fades to nothing over whatever is behind it — same reasoning as
//     the topbar, just the opposite edge.
// Forbidding either from ever touching the sphere would outlaw the app's
// own established, shipped design, not just the real bugs this lane found
// (the opaque icon buttons sitting on the globe's rim on a narrow phone,
// and the Inspector card's top edge).
const OVERLAY_SELECTORS = ["[data-globe-topbar] > div", "[data-globe-panel]"] as const;

async function visibleBoxes(page: Page, selectors: readonly string[]): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (box && box.width > 0 && box.height > 0) boxes.push(box);
    }
  }
  return boxes;
}

/** Asserts no two of the given named boxes intersect, skipping any pair this
 *  layout allows on purpose (`skip` returns true for that pair). */
function assertNoOverlaps(boxes: { name: string; box: Box }[], skip: (a: string, b: string) => boolean = () => false) {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (skip(a.name, b.name)) continue;
      expect(overlaps(a.box, b.box), `${a.name} overlaps ${b.name}: ${JSON.stringify(a.box)} vs ${JSON.stringify(b.box)}`).toBe(false);
    }
  }
}

async function assertComposition(page: Page) {
  const panels = await visibleBoxes(page, OPAQUE_PANEL_SELECTORS);
  const overlays = await visibleBoxes(page, OVERLAY_SELECTORS);
  const disc = await globeDiscBox(page);
  const named = [
    ...panels.map((box, i) => ({ name: `panel[${i}]`, box })),
    ...overlays.map((box, i) => ({ name: `overlay[${i}]`, box })),
    { name: "globe-disc", box: disc },
  ];
  // overlay-vs-globe-disc is the one pairing this layout allows on purpose —
  // see OVERLAY_SELECTORS' own comment.
  const isOverlay = (n: string) => n.startsWith("overlay");
  assertNoOverlaps(named, (a, b) => (isOverlay(a) && b === "globe-disc") || (isOverlay(b) && a === "globe-disc"));
}

const DESKTOP_SIZES = [
  { name: "1440x900", w: 1440, h: 900 },
  { name: "1024x768", w: 1024, h: 768 },
];

for (const size of DESKTOP_SIZES) {
  test(`no panel overlaps another, the topbar, or the globe disc at ${size.name}`, async ({ page }) => {
    // The real landing composition: desktop first load always preselects
    // Pune (Inspector active), and the layer panel is whatever globeStore's
    // own matchMedia default gives it for this width (open at >=1280,
    // collapsed below it) - not forced either way, since forcing BOTH the
    // panel open and the inspector active at once asks the golden-ratio
    // globe (this lane may not resize) to fit a gap narrower than its own
    // diameter at 1024px, a pre-existing camera-sizing tension from an
    // earlier lane that a composition-only fix can't close without also
    // shrinking the globe.
    await openGlobe(page, size.w, size.h);
    await assertComposition(page);
  });
}

test("no panel overlaps another, the topbar, or the globe disc at 390x844 (phone, sheet closed)", async ({ page }) => {
  await openGlobe(page, 390, 844);
  await assertComposition(page);
});

test("phones open one sheet at a time (Layers, Time, Tour)", async ({ page }) => {
  await openGlobe(page, 390, 844);

  const layersBtn = page.getByRole("button", { name: "Open the layers sheet" });
  const timeBtn = page.getByRole("button", { name: "Open the time sheet" });
  const tourBtn = page.getByRole("button", { name: "Open the guided tour" });
  const layersSheet = page.locator("[data-globe-layer-sheet]");
  const timeSheet = page.locator("[data-globe-time-sheet]");
  const tourSheet = page.locator("[data-globe-tour-sheet]");

  await layersBtn.click();
  await expect(layersSheet).toBeVisible();
  await expect(timeSheet).toBeHidden();
  await expect(tourSheet).toBeHidden();

  await timeBtn.click();
  await expect(timeSheet).toBeVisible();
  await expect(layersSheet).toBeHidden();
  await expect(tourSheet).toBeHidden();

  await tourBtn.click();
  await expect(tourSheet).toBeVisible();
  await expect(layersSheet).toBeHidden();
  await expect(timeSheet).toBeHidden();

  // Re-opening layers while the tour is running still closes it — the same
  // "one at a time" contract holds in both directions, not just the order
  // this test happened to open them in.
  await layersBtn.click();
  await expect(layersSheet).toBeVisible();
  await expect(tourSheet).toBeHidden();

  // The tour icon starts/reopens the running tour (GlobeTour.tsx keeps
  // `tourStep` separate from sheet visibility); ending it is the sheet's own
  // "Exit" affordance, not a second tap on the icon — exiting leaves no
  // sheet open.
  await tourBtn.click();
  await expect(tourSheet).toBeVisible();
  await tourSheet.getByRole("button", { name: "Exit" }).click();
  await expect(tourSheet).toBeHidden();
  await expect(layersSheet).toBeHidden();
  await expect(timeSheet).toBeHidden();
});

test("the floating Pune card is retired", async ({ page }) => {
  await openGlobe(page, 1440, 900);
  await expect(page.locator("[data-pune-card]")).toHaveCount(0);
});
