import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase C2: axe locks in the a11y pass instead of just documenting it.
// Four routes cover every layout shape on the site — SSR content page (/),
// print-mode page (/resume), SSR project detail with a gallery/lightbox
// (/project/mileway), and a CSR "room" with canvas + form controls (/lab).
// 2026-07-29 audit: extended to the remaining CSR "rooms" (terminal, blueprint,
// compose, forge, map, playground, loopdown) — the original four never scanned
// any of these, so their ARIA/keyboard wiring shipped unverified like the chat
// console did before the dedicated test below was added.
const ROUTES = [
  "/",
  "/resume",
  "/project/mileway",
  "/lab",
  "/terminal",
  "/blueprint",
  "/compose",
  "/forge",
  "/map",
  "/playground",
  "/loopdown",
];

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

// The chat console is closed on load, so the loop above never sees it — its
// combobox/listbox wiring (aria-expanded, aria-controls, aria-activedescendant,
// role="option") was shipped unverified. Open it, then open the slash menu, and
// axe the panel in both states.
test("the chat console has no serious/critical axe violations, closed menu or open", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open chat" }).click();

  const input = page.getByRole("combobox", { name: /Ask Panda/i });
  await expect(input).toBeVisible();

  const scan = async (label: string) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad, `${label}: ${bad.map((v) => `${v.id} — ${v.help}`).join("; ")}`).toEqual([]);
  };

  await scan("chat open, slash menu closed");

  // "/" pops the command listbox — the state that owns the ARIA under test.
  await input.fill("/");
  await expect(page.getByRole("listbox", { name: "Console commands" })).toBeVisible();
  await scan("chat open, slash menu open");

  // /jd swaps the whole composer for the job-description paste box — a
  // different set of controls (labelled textarea, counter, two buttons) that
  // the two scans above never see.
  await input.fill("/jd");
  await input.press("Enter");
  const paste = page.getByLabel("job description → fit analysis");
  await expect(paste).toBeVisible();
  await scan("chat open, JD composer up");

  // …and Esc gets out of it without closing the panel (focus must not be left
  // on a control that no longer exists).
  await paste.press("Escape");
  await expect(input).toBeFocused();
});

// CommandPalette is mounted on "/" (scanned above), but the loop never
// presses ⌘K, so its role="dialog"/combobox/listbox wiring was unverified —
// same class of gap the chat-console test above exists to catch.
test("the command palette has no serious/critical axe violations when open", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
    .join("\n\n");
  expect(bad, report).toEqual([]);
});
