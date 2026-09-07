import { test, expect } from "./lib/test.ts";

/**
 * The two fixed controls, verified rather than eyeballed.
 *
 * CommandPalette's trigger and FloatingChat's launcher are both global chrome
 * — mounted once, present on every route — so a defect in either is a defect
 * everywhere at once, and a visual fix here needs a Playwright assertion or
 * nobody will notice it regress (per the web-dev skill).
 */

const MOBILE = { width: 390, height: 844 };

test("the command palette trigger is fixed, on-screen and reachable without scrolling", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto("/", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: /open the command palette/i });
  await expect(trigger).toBeVisible();
  const position = await trigger.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("fixed");
  const box = await trigger.boundingBox();
  expect(box).toBeTruthy();
  // Within the viewport with no scroll — the exact defect was that this
  // button was the literal last element in body, ~24.8k px down on home.
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(MOBILE.height);
});

test("/hire mounts the chat launcher", async ({ page }) => {
  await page.goto("/hire", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Open chat" })).toBeVisible();
});

/**
 * Collision check against the FAB's real footprint, on the routes the sweep
 * named.
 *
 * index.css's `--chat-fab-clearance` now reserves the launcher's footprint in
 * both directions, not one: padding-bottom for the true end of the document
 * (verified: /map's room-to-room footer link and /resume's closing paragraph
 * no longer collide), plus padding-right as a permanent column down the
 * right edge of every route. The launcher is viewport-fixed, so a
 * bottom-only reservation left it free to sit over whatever text occupied
 * that corner at ANY scroll position — which is what made /shipped's fourth
 * stat and /chess's thesis sentence collide on first paint, nowhere near the
 * document's end. A column no text ever enters removes the overlap at every
 * scroll position at once, so this is one assertion per route now expected
 * to genuinely pass rather than a pinned known-gap.
 */
const ROUTES = ["/shipped", "/chess", "/project/candidai", "/project/stutter", "/map", "/resume"];

for (const path of ROUTES) {
  test(`${path} — chat launcher vs. live content at ${MOBILE.width}px`, async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const collisions = await page.evaluate(() => {
      const fab = document.querySelector('button[aria-label="Open chat"]');
      if (!fab) return ["NO FAB FOUND"];
      const fabRect = fab.getBoundingClientRect();
      const ownText = (el: Element) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
      const out: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (el === fab || fab.contains(el) || el.contains(fab)) continue;
        if (!ownText(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overlap = !(r.right < fabRect.left || r.left > fabRect.right || r.bottom < fabRect.top || r.top > fabRect.bottom);
        if (overlap) out.push(`<${el.tagName.toLowerCase()} class="${(el.className as string).toString().slice(0, 40)}"> "${(el.textContent ?? "").trim().slice(0, 60)}"`);
      }
      // Outermost offenders only.
      return out.filter((o, _i, all) => !all.some((p) => p !== o && o.startsWith(p.split('"')[0])));
    });
    expect(collisions, `${path}: ${collisions.length} collision(s)`).toEqual([]);
  });
}
