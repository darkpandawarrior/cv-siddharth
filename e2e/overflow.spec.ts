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
/**
 * /blueprint is exempt, and only /blueprint.
 *
 * It is not a page with a layout — it is an r3f scene whose cards are drei
 * <Html> portals positioned in WORLD space inside a <group>, on a canvas you
 * orbit and pan. "Ghosts In The Recomposition" sits at x:2520 in
 * blueprintData.ts and is reached by moving the camera, not by scrolling. A
 * viewport-edge test cannot say anything true about it, so asserting here
 * would only teach the next person to add exemptions.
 *
 * Its DOM chrome — the toolbar, the back link, the tour controls — is still
 * covered by e2e/a11y.spec.ts at 390px.
 */
const CANVAS_ROUTES = new Set(["/blueprint"]);

const ROUTES = [...surfaces.map((s) => s.to), "/", "/project/mileway", "/read/deadline"].filter(
  (p) => !CANVAS_ROUTES.has(p),
);

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

      // Only a REAL scroller owns its overflow. Treating overflow:hidden as
      // containment was tried and rejected: a full-viewport `fixed inset-0
      // overflow-hidden` HUD wrapper would then hide genuinely off-screen
      // controls, which is exactly the /playground bug this exists to catch.
      // documentElement is excluded regardless — html{overflow-x:hidden} is
      // the rule that makes real clipping silent in the first place.
      const contained = (el: Element): boolean => {
        for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") return true;
        }
        return false;
      };

      // Decorative bleed is legitimate and common here — a masked marquee is
      // SUPPOSED to run past the edge. What is never acceptable is a control
      // you cannot press or words you cannot read. So this only judges
      // elements that are interactive or carry their own text.
      const INTERACTIVE = "a[href], button, input, select, textarea, [role=button], [role=link], [tabindex]:not([tabindex='-1'])";
      const ownText = (el: Element) =>
        Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);

      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (ALLOWED.some((sel) => el.closest(sel))) continue;
        if (!el.matches(INTERACTIVE) && !ownText(el)) continue;
        // Author-declared decoration. WorldLabels renders its 3D room names
        // into `aria-hidden pointer-events-none absolute inset-0`, and the
        // Blueprint Room's nodes live on a pannable infinite canvas — both are
        // positioned in world/canvas space, not laid out, so "off the viewport
        // right now" is the camera, not a clipped page. Anything the author
        // has already marked hidden-from-AT and unclickable is not the content
        // this gate protects.
        if (el.closest('[aria-hidden="true"]') && !el.matches(INTERACTIVE)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        // World-space 3D labels are positioned by the renderer, not by layout.
        if (el.closest("[data-world-label]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= limit + 1) continue;
        if (contained(el)) continue;
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
