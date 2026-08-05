import { test, expect, type Locator, type Page } from "@playwright/test";
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
  "/hire",
  "/read/deadline",
  "/resume",
  "/project/mileway",
  "/lab",
  "/terminal",
  "/blueprint",
  "/compose",
  "/forge",
  "/map",
  "/playground",
  "/pulse",
  "/loopdown",
  "/chess",
];

/* The reveal animations on the card grids fade in from transparent, and axe
 * computes contrast from whatever colour an element happens to have at the
 * instant it scans. Scanning mid-fade reported a card's own body text as
 * #191c20-on-#080b0c (1.15:1) — a failure that describes frame 3 of an
 * animation, not the page anyone reads.
 *
 * `waitUntil: "networkidle"` used to hide this by accident, and stopped once
 * /playground held a websocket open for the shared layer: no idle event, so the
 * scan started early and the flake surfaced — on /loopdown too, which has no
 * websocket and was already failing this way for its own timing reasons.
 *
 * Freezing animation at its end state is the fix rather than sleeping: it makes
 * every route scan the settled page deterministically, and it is the state a
 * visitor actually sits looking at. */
const SETTLE_ANIMATIONS = `*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-fill-mode: forwards !important;
  transition-duration: 0s !important;
}`;

for (const path of ROUTES) {
  test(`${path} has no serious/critical axe violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: SETTLE_ANIMATIONS });
    // Let the route's client render land before scanning it.
    await page.waitForSelector("#main-content", { state: "attached" });
    await page.waitForTimeout(1500);
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

/* The chess room mounts exactly ONE of its seven panes at a time (three are
 * three.js scenes and one is a Web Worker engine — mounting all seven would pay
 * for six rooms nobody is looking at). So the "/chess" entry in the loop above
 * scans the shell plus the default pane, The Findings, and nothing else: the
 * other six panes' controls — the rating arc, the graveyard toggle group, the
 * repertoire year slider, the bot picker and its 64-button board, the two
 * puzzle boards, the rhythm hour slider — would ship unscanned exactly like
 * the chat console did.
 *
 * The tab strip carries no route state, so this walks it by clicking, and waits
 * on each pane's own control rather than a timeout — the lazy chunks (and the
 * engine worker) land when they land.
 *
 * The board panes are the reason this test earns its runtime: react-chessboard
 * draws every piece as an unnamed dnd-kit `role="button"` with `tabindex="0"`
 * (32 serious violations on an untouched board, `allowDragging: false` included),
 * and BoardSurface strips those through a MutationObserver. If that observer
 * ever stops converging, "Play the Bot" and "Guess the Move" go red here.
 */
const CHESS_PANES: { tab: string; ready: (page: Page) => Locator }[] = [
  { tab: "The Arc", ready: (p) => p.getByText(/Where the arc changes hands/i) },
  { tab: "The Graveyard", ready: (p) => p.getByRole("group", { name: "Which games to show" }) },
  { tab: "Repertoire", ready: (p) => p.locator("#repertoire-year") },
  { tab: "Play the Bot", ready: (p) => p.getByRole("group", { name: /^Chess board\./ }) },
  { tab: "Guess the Move", ready: (p) => p.getByRole("group", { name: /^Puzzle board\./ }) },
  { tab: "Rhythm", ready: (p) => p.getByLabel("Hour of day, IST") },
];

test("every chess pane has no serious/critical axe violations", async ({ page }) => {
  await page.goto("/chess", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: SETTLE_ANIMATIONS });
  await page.waitForSelector("#main-content", { state: "attached" });

  for (const pane of CHESS_PANES) {
    await page.getByRole("button", { name: pane.tab }).click();
    await expect(pane.ready(page)).toBeVisible({ timeout: 20_000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = bad
      .map((v) => `${pane.tab} — ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
      .join("\n\n");
    expect(bad, report).toEqual([]);
  }
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
