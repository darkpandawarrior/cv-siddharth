import { test, expect } from "@playwright/test";
import { surfaces } from "../src/data/surfaces.ts";

/**
 * THE SILENT-CLIPPING GATE.
 *
 * `html { overflow-x: hidden }` means over-wide content never produces a
 * scrollbar — it is simply CUT OFF. So "the page doesn't scroll sideways"
 * proves nothing, and no existing test caught the /playground HUD rendering
 * "ROOMS OPENED 0 /" with the rest of the line off the screen edge on a
 * 390px phone.
 *
 * The only reliable detection is comparing each element's right edge against
 * documentElement.clientWidth, which is what this does.
 *
 * Two things are allowed to overhang, both deliberately:
 *   .chapter-word-wrap — the masked editorial marquee, which bleeds by design
 *   .particle-hero     — decorative bleed, and only at >= 1024px
 * Anything else over-wide is either inside a real overflow-x:auto scroller
 * (checked for) or a genuine bug.
 *
 * Routes come from the registry, never a hand-kept list — a surface added
 * without a mobile pass should fail this, and a list maintained by hand would
 * simply never mention it.
 */

const MOBILE = { width: 390, height: 844 };
const ROUTES = [...surfaces.map((s) => s.to), "/", "/project/mileway", "/read/deadline"];

for (const path of ROUTES) {
  test(`${path} does not silently clip content at ${MOBILE.width}px`, async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Canvas rooms need a beat to lay their HUD out over the scene.
    await page.waitForTimeout(1200);

    const overflowing = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const ALLOWED = [".chapter-word-wrap", ".particle-hero"];
      const out: { tag: string; cls: string; right: number; text: string }[] = [];

      const inScroller = (el: Element): boolean => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") return true;
        }
        return false;
      };

      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (ALLOWED.some((sel) => el.closest(sel))) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        // World-space 3D labels are positioned by the renderer, not by layout.
        if (el.closest("[data-world-label]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= limit + 1) continue;
        if (inScroller(el)) continue;
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: typeof el.className === "string" ? el.className.slice(0, 70) : "",
          right: Math.round(r.right),
          text: (el.textContent ?? "").trim().slice(0, 40),
        });
      }
      // Report the outermost offenders only — a clipped parent drags every
      // child over the edge and the child list is noise.
      return out.filter((o, _i, all) => !all.some((p) => p !== o && o.cls.startsWith(p.cls) && p.right >= o.right)).slice(0, 8);
    });

    expect(
      overflowing,
      `clipped past ${MOBILE.width}px (silently — overflow-x is hidden):\n` +
        overflowing.map((o) => `  <${o.tag} class="${o.cls}"> right=${o.right} "${o.text}"`).join("\n"),
    ).toEqual([]);
  });
}
