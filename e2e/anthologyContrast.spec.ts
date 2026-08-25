import { test, expect, waitForHydration } from "./lib/test.ts";

/**
 * Every word on the anthology hub, measured against the ground it is actually
 * painted on, in all four season layers.
 *
 * This exists because of a defect that shipped and that nothing here could see.
 * Season three's kept page paints its own paper ground (`--color-card: #e9dfc9`)
 * and correctly declares its own ink (`--color-text: #1f1a12`, stated at
 * 13.06:1 in seasonTheme.ts). The card's <h2> never read that token: it had no
 * colour of its own, so it inherited `.ink-world`'s cream from an ancestor
 * OUTSIDE the card. "One Page Kept", the title of the single undamaged object
 * in season three, rendered at 1.08:1. Invisible.
 *
 * Every existing guard passed. themeCoverage.test.ts checks that the tokens are
 * DEFINED. seasonTheme.test.ts checks that the theme RETURNS them. The stated
 * ratio, 13.06:1, was correct arithmetic about two hex values that were never
 * on screen together. Nothing asked what colour the browser actually painted,
 * which is why this is an e2e and not another unit test: the failure was not in
 * any value, it was in whether an element read one.
 *
 * The axe pass in a11y.spec.ts does not cover it either — it scans the default
 * layer, and three of the four season layers are behind a client-side switch.
 *
 * It walks the real DOM, composites up to the first non-transparent ancestor
 * background the way a browser does, and fails anything below the AA floor.
 */

const LAYERS = ["form", "case", "fire", "wall"] as const;

for (const layer of LAYERS) {
  test(`the ${layer} layer paints every word above the AA floor`, async ({ page }) => {
    await page.goto(layer === "form" ? "/anthology" : `/anthology?layer=${layer}`);
    await waitForHydration(page);
    await page.waitForTimeout(300);

    // WCAG relative luminance and contrast, computed in the page against the
    // colours the browser actually resolved.
    const rows = await page.evaluate(() => {
      const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
      const lum = (s: string) => {
        const [r, g, b] = (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const ratio = (a: string, b: string) => {
        const x = lum(a);
        const y = lum(b);
        const [hi, lo] = x > y ? [x, y] : [y, x];
        return (hi + 0.05) / (lo + 0.05);
      };
      // Composite the way a browser does: walk up until something is painted.
      const ground = (el: Element) => {
        let bg = "rgba(0, 0, 0, 0)";
        let n: Element | null = el;
        while (n && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
          bg = getComputedStyle(n).backgroundColor;
          n = n.parentElement;
        }
        return bg === "rgba(0, 0, 0, 0)" ? "rgb(0, 0, 0)" : bg;
      };
      const out: { tag: string; text: string; color: string; bg: string; ratio: number }[] = [];
      for (const el of document.querySelectorAll("main h2, main h3, main p, main li, main figcaption")) {
        const text = (el.textContent || "").trim();
        // Skip wrappers: only the element that directly owns the text.
        if (!text || el.querySelector("h2, h3, p, li")) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const bg = ground(el);
        out.push({ tag: el.tagName, text: text.slice(0, 40), color: cs.color, bg, ratio: Number(ratio(cs.color, bg).toFixed(2)) });
      }
      return out;
    });

    // A layer that renders nothing would pass an "everything is legible" test
    // trivially. Each season has at least ten cards, so this is the floor that
    // stops this spec becoming a green build that proves nothing.
    expect(rows.length, `the ${layer} layer rendered almost no text — this spec would prove nothing`).toBeGreaterThan(10);

    const failing = rows.filter((r) => r.ratio < 4.5);
    expect(
      failing,
      `unreadable text in the ${layer} layer:\n` +
        failing.map((f) => `  ${f.ratio}:1  <${f.tag}> ${f.color} on ${f.bg}  "${f.text}"`).join("\n"),
    ).toEqual([]);
  });
}
