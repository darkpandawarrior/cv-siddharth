import { test, expect } from "./lib/test.ts";

// The rail (src/AnomalyRail.tsx) and its instrument-view overlay
// (src/InstrumentView.tsx) are the most focus-sensitive component on the
// site — a dialog with a manual `inert` sweep and a manual focus trap — and
// had zero e2e coverage before this spec. Finding I2 in the 2026-08-05 final
// review (a route change while the overlay is open un-inerts the background)
// lived entirely in that gap: e2e/navigation.spec.ts's existing
// `[role=dialog]` count-is-0 check passes trivially because nothing there
// ever opens the dialog.

const RAIL_NAV = "Timeline"; // aria-label shared by both the rail's <nav> and the instrument view's dialog

test.describe("anomaly rail — links", () => {
  test("all eight facet links are present, have discernible names, and are keyboard-reachable", async ({ page }) => {
    await page.goto("/");
    const links = page.getByRole("navigation", { name: RAIL_NAV }).getByRole("link");
    await expect(links).toHaveCount(8);

    for (const link of await links.all()) {
      await expect(link).toHaveAccessibleName(/.+/);
    }

    // Real anchors in normal DOM order — a Tab from the first one lands on
    // the second, no bespoke keyboard handling required.
    await links.first().focus();
    await expect(links.first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(links.nth(1)).toBeFocused();
  });

  test("a rail link navigates to its route (no full page reload)", async ({ page }) => {
    await page.goto("/");
    const seenUrls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) seenUrls.push(frame.url());
    });

    await page.getByRole("navigation", { name: RAIL_NAV }).getByRole("link", { name: /^Labs/ }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.locator("body")).toContainText(/lab/i);

    // I5: these used to be raw <a href> — every cross-route click left the
    // SPA for a full document load. A router-native <Link> never bounces
    // through a `/#…` intermediate URL the way the legacy hash shim did.
    expect(seenUrls.some((u) => u.includes("/#"))).toBe(false);
  });
});

test.describe("instrument view — open, close, focus, inert", () => {
  test("`\\` opens the instrument view; Escape closes it; focus returns to the rail", async ({ page }) => {
    // networkidle, not just domcontentloaded — the `\` handler is attached by
    // a useEffect that only runs post-hydration, and this test's very first
    // action is a bare keypress with nothing to wait on beforehand.
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.locator("dialog, [role=dialog]")).toHaveCount(0);

    await page.keyboard.press("\\");
    const dialog = page.getByRole("dialog", { name: RAIL_NAV });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".anomaly-rail, .instrument-view")).toHaveCount(2);

    // Focus lands inside the dialog on open.
    const active = await page.evaluate(() => document.activeElement?.closest(".instrument-view") != null);
    expect(active).toBe(true);

    // Every body-level sibling of the dialog is inert while it's open.
    const inertCount = await page.evaluate(() => document.querySelectorAll("[inert]").length);
    expect(inertCount).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".anomaly-rail")).toBeFocused();

    // Closed: zero dialogs in the a11y tree, zero leaked inert.
    await expect(page.locator("dialog, [role=dialog]")).toHaveCount(0);
    // Polled, not sampled once. "Leaks nothing" is a claim about the settled
    // state: while the overlay unmounts and the destination route mounts,
    // elements can legitimately carry [inert] for a frame or two. Reading a
    // single frame right after the URL flips scored that in-flight moment as
    // a leak, which is why this went red roughly one full run in three.
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll("[inert]").length))
      .toBe(0);
  });

  // I2: the terminal's ` hotkey (registered globally in __root.tsx) used to
  // navigate away without the overlay's own effects ever running their
  // cleanup, because InstrumentView's inert sweep snapshots
  // document.body.children once at open time — a route change swaps that
  // routed node out from under the snapshot. Measured before the fix: inert
  // siblings dropped 5 → 4 and the dialog stayed open over a reachable page.
  test("navigating away while the overlay is open closes it and leaks nothing (I2 regression)", async ({ page }) => {
    await page.goto("/excelsior", { waitUntil: "networkidle" });
    await page.keyboard.press("\\");
    await expect(page.getByRole("dialog", { name: RAIL_NAV })).toBeVisible();

    await page.keyboard.press("`"); // __root.tsx's global terminal hotkey
    await expect(page).toHaveURL(/\/terminal$/);

    await expect(page.locator("dialog, [role=dialog]")).toHaveCount(0);
    // Polled, not sampled once. "Leaks nothing" is a claim about the settled
    // state: while the overlay unmounts and the destination route mounts,
    // elements can legitimately carry [inert] for a frame or two. Reading a
    // single frame right after the URL flips scored that in-flight moment as
    // a leak, which is why this went red roughly one full run in three.
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll("[inert]").length))
      .toBe(0);
  });
});

// C1: under prefers-reduced-motion, useCanvasLoop fast-forwards, draws once,
// and returns with no rAF loop — but the ResizeObserver it registers always
// delivers one initial callback after that, which used to reset the canvas
// bitmap (canvas.width assignment) and wipe the one and only frame. Measured
// before the fix: 0 non-transparent pixels vs 644 under no-preference.
test("rail canvas is non-blank under prefers-reduced-motion (C1 regression)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const canvas = page.locator(".anomaly-rail-canvas");
  await expect(canvas).toBeAttached();
  // Let the ResizeObserver's initial (async) callback land.
  await page.waitForTimeout(300);

  const nonTransparentPixels = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++;
    return count;
  });
  expect(nonTransparentPixels).toBeGreaterThan(0);
});
