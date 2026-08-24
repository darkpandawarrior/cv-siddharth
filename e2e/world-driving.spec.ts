import { test, expect, devices } from "@playwright/test";
import { waitForHydration } from "./lib/test.ts";
import type { Page } from "@playwright/test";

/**
 * Does the world actually drive?
 *
 * Nothing else in this suite asks. The world had ten passing invariant tests
 * while its steering was inverted, because every one of them asserted a
 * magnitude and none asserted a direction or moved the car at all — the bug
 * was found by a person driving it. These tests drive it.
 *
 * The car's pose is read off the minimap, which writes live telemetry into an
 * SVG transform. That is a real rendered surface rather than a test seam, so
 * it cannot quietly stop reflecting the car.
 *
 * Thresholds are deliberately loose. Playwright renders WebGL in software, so
 * the frame rate here says nothing about a real device, and asserting a
 * distance would only pin the speed of this machine. Every assertion below is
 * a relationship: it moved, or these two turns went opposite ways.
 */

const CRAFT = "svg g:has(> polygon.fill-accent)";

async function pose(page: Page): Promise<{ x: number; z: number; rot: number }> {
  const t = await page.locator(CRAFT).first().getAttribute("transform");
  const m = t?.match(/translate\((-?[\d.]+) (-?[\d.]+)\) rotate\((-?[\d.]+)\)/);
  if (!m) throw new Error(`minimap craft has no readable transform: ${t}`);
  return { x: +m[1], z: +m[2], rot: +m[3] };
}

/** pose(), but tolerant of the window before the first frame writes the
 *  transform at all. expect.poll propagates a thrown error instead of
 *  retrying, so a poll that calls pose() directly fails outright the one run
 *  in three where it samples early. */
async function posed(page: Page): Promise<{ x: number; z: number; rot: number } | null> {
  return pose(page).catch(() => null);
}

async function enterWorld(page: Page): Promise<void> {
  await page.goto("/playground");
  await waitForHydration(page);
  await page.waitForSelector("canvas", { timeout: 30_000 });
  // The first frames place the car and settle the camera; sampling a pose
  // before that races the spawn fly-in rather than the driving.
  await expect
    .poll(async () => (await posed(page))?.z ?? 0, { timeout: 30_000 })
    .toBeLessThan(0);
}

const moved = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(b.x - a.x, b.z - a.z);

/**
 * Hold `keys` until `progress` passes `enough`, then let go and report it.
 *
 * Not a fixed wall-clock window. WebGL renders in software here and three
 * workers share ten cores, so a 1.2-second hold can produce almost no frames
 * at all — the first version of this asserted over exactly that window and
 * measured a car that had moved precisely zero, which says nothing about the
 * car and everything about the machine. Waiting for the effect keeps the
 * assertion about whether driving works.
 */
async function hold(
  page: Page,
  keys: string[],
  progress: () => Promise<number>,
  enough: number,
): Promise<number> {
  for (const k of keys) await page.keyboard.down(k);
  try {
    await expect.poll(progress, { timeout: 30_000 }).toBeGreaterThan(enough);
  } finally {
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
  }
  return progress();
}

test.describe("the world drives", () => {
  test("holding the throttle moves the car", async ({ page }) => {
    test.slow();
    await enterWorld(page);

    const before = await pose(page);
    await hold(page, ["w"], async () => {
      const now = await posed(page);
      return now ? moved(before, now) : 0;
    }, 0.3);
  });

  test("left and right steer opposite ways", async ({ page }) => {
    test.slow();
    // This does NOT catch an inverted steering sign, and it was written
    // believing it did: flipping STEER_SIGN swaps which key turns which way,
    // so the two directions stay opposite and this stays green. Verified by
    // flipping it. drive.test.ts's "right goes right" is what fails there, and
    // it is the right place for it — direction is a property of the pure
    // model. What this covers is the half a unit test cannot reach: that both
    // keys are actually wired to the car in a running browser.
    const turn = async (key: string) => {
      await enterWorld(page);
      const before = await pose(page);
      const turned = async () => Math.abs(((await posed(page))?.rot ?? before.rot) - before.rot);
      await hold(page, ["w", key], turned, 1);
      return (await pose(page)).rot - before.rot;
    };

    const left = await turn("a");
    const right = await turn("d");

    expect(Math.abs(left), "steering left changed nothing").toBeGreaterThan(1);
    expect(Math.abs(right), "steering right changed nothing").toBeGreaterThan(1);
    expect(Math.sign(left), "left and right steer the same way").not.toBe(Math.sign(right));
  });
});

test.describe("the world drives on a phone", () => {
  // A real touch context, not just a small viewport: the thumbstick is gated
  // behind @media (pointer: coarse), so at 390px with a mouse it is display:
  // none and a test would be driving nothing.
  // defaultBrowserType is dropped: Playwright refuses it inside a describe
  // group because it would force a new worker, and it is the one field of the
  // preset this suite does not want — everything else (touch, coarse pointer,
  // viewport, DPR) is exactly the point.
  const { defaultBrowserType: _browser, ...pixel5 } = devices["Pixel 5"];
  test.use(pixel5);

  test("the thumbstick moves the car", async ({ page }) => {
    test.slow();
    await enterWorld(page);

    const stick = page.getByRole("slider", { name: /steer and throttle/i });
    await expect(stick, "no thumbstick on a coarse-pointer device").toBeVisible();
    const box = await stick.boundingBox();
    if (!box) throw new Error("thumbstick has no box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await pose(page);
    // Dispatched rather than driven through page.touchscreen because the stick
    // takes a pointer capture and tracks one pointerId across the drag.
    const at = (y: number) => ({ pointerId: 1, clientX: cx, clientY: y, isPrimary: true });
    await stick.dispatchEvent("pointerdown", at(cy));
    await stick.dispatchEvent("pointermove", at(cy - box.height / 2));
    try {
      await expect
        .poll(async () => {
          const now = await posed(page);
          return now ? moved(before, now) : 0;
        }, { timeout: 30_000 })
        .toBeGreaterThan(0.3);
    } finally {
      await stick.dispatchEvent("pointerup", at(cy - box.height / 2));
    }
  });
});
