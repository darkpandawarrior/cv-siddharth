import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase C2: axe locks in the a11y pass instead of just documenting it.
// Four routes cover every layout shape on the site — SSR content page (/),
// print-mode page (/resume), SSR project detail with a gallery/lightbox
// (/project/mileway), and a CSR "room" with canvas + form controls (/lab).
const ROUTES = ["/", "/resume", "/project/mileway", "/lab"];

for (const path of ROUTES) {
  test(`${path} has no serious/critical axe violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // color-contrast is ENFORCED (no allowlist). Phase B1 retired the
      // C2 exception: the failing muted-text tokens (text-zinc-500/600,
      // 3.5–2.2:1 on the dark grounds) were replaced sitewide with a single
      // `text-muted` token (#8b909a) that passes AA (>=4.5:1) on every dark
      // ground incl. the lightest themed card (#33241c → 4.65:1). The résumé
      // (dark-on-light) already passed and was left untouched. If this
      // regresses, a new muted-on-dark or accent-on-dark pairing slipped in.
      .analyze();

    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = bad
      .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
      .join("\n\n");
    expect(bad, report).toEqual([]);
  });
}
