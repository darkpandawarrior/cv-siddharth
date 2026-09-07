import { test, expect, waitForHydration } from "./lib/test.ts";
import { type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { surfaces } from "../src/data/surfaces.ts";

// Phase C2: axe locks in the a11y pass instead of just documenting it.
// Four routes cover every layout shape on the site — SSR content page (/),
// print-mode page (/resume), SSR project detail with a gallery/lightbox
// (/project/doori), and a CSR "room" with canvas + form controls (/lab).
// 2026-07-29 audit: extended to the remaining CSR "rooms" (terminal, blueprint,
// compose, forge, map, playground, loopdown) — the original four never scanned
// any of these, so their ARIA/keyboard wiring shipped unverified like the chat
// console did before the dedicated test below was added.
/**
 * Every scannable route, derived rather than listed.
 *
 * This was a hand-kept array, and it had drifted exactly the way hand-kept
 * arrays do: /excelsior, /ink and /shipped were all live routes that nothing
 * ever scanned. Each one is a real page a recruiter can land on, and each was
 * shipping unverified — /ink in particular carries `--color-accent2` (#cf8f63)
 * on the ink-world ground, a pairing that had never been contrast-checked at
 * body weight.
 *
 * Taking the paths from the surfaces registry means adding a surface widens
 * this gate automatically, and `src/data/surfaces.test.ts` already fails the
 * build if a route file exists with no surface. So a new route cannot be
 * unscanned without two separate gates going red first.
 *
 * The two `$param` routes are not surfaces — they need a concrete param to
 * render — so they stay explicit, one representative each.
 */
const ROUTES = [
  "/",
  "/read/deadline",
  "/project/doori",
  ...surfaces.map((s) => s.to),
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
}
.reveal { opacity: 1 !important; transform: none !important; }
* { content-visibility: visible !important; }`;

/* Why that last rule exists.
 *
 * .reveal starts at opacity 0 and only gains .revealed when an
 * IntersectionObserver fires. A test never scrolls, so every section below the
 * fold stayed transparent — and axe either skipped it or, worse, computed
 * contrast against a half-composited grey (#bcbcc0 on #909092 at 9px) and
 * failed a pairing that exists in no stylesheet.
 *
 * That made the suite load-dependent: whichever routes lost the race against
 * the fixed 1500ms wait below failed, and WHICH routes lost changed run to run.
 * It stayed hidden while the suite was small and surfaced the moment an
 * eighteenth route was added.
 *
 * Forcing the end state is both the deterministic fix and a stricter gate:
 * below-the-fold content is now actually scanned instead of being invisible to
 * axe, and it is the state a visitor who scrolls actually reads.
 *
 * The content-visibility rule closes the same hole a second time. index.css
 * puts `content-visibility: auto` on #projects, #surfaces, #shipped and
 * #contact; a skipped subtree has no layout box, so axe cannot compute contrast
 * inside it and four of fourteen homepage sections went unscanned again — which
 * is how a 2.23:1 line in #shipped stayed green. The rule is written `*` rather
 * than naming those four ids so a fifth section added to index.css is covered
 * without editing this file.
 *
 * (Kept OUTSIDE the template literal: a backtick in a comment inside a tagged
 * template is parsed as JS, which silently yielded "No tests found".) */

/**
 * Run the scan, retrying ONLY when hydration navigated out from under it.
 *
 * color-contrast is ENFORCED (no allowlist). Phase B1 retired the C2
 * exception: the failing muted-text tokens (text-zinc-500/600, 3.5–2.2:1 on
 * the dark grounds) were replaced sitewide with a single `text-muted` token
 * (#8b909a) that passes AA (>=4.5:1) on every dark ground incl. the lightest
 * themed card (#33241c → 4.65:1). The résumé (dark-on-light) already passed
 * and was left untouched. If this regresses, a new muted-on-dark or
 * accent-on-dark pairing slipped in.
 *
 * THE RETRY, and why it is not a papered-over failure. TanStack Start
 * re-navigates to the same URL when the router hydrates — measured on
 * /playground, `framenavigated → /playground` fires once for the document and
 * again after the load event. When that second navigation lands mid-walk, axe
 * dies with "Execution context was destroyed", which is a statement about the
 * harness, not about the page: no rule ran, so there is no verdict to trust.
 *
 * Whether hydration beat the fixed 1500ms wait depended on machine load, so
 * /playground passed alone and failed in the full 19-test suite — the same
 * load-dependent shape as the .reveal race above. `waitForLoadState("networkidle")`
 * was tried first and did NOT fix it (the route polls, so it never goes idle).
 *
 * So: retry that one error, at most twice, and re-throw everything else
 * untouched. A real violation still fails on the first attempt, because a real
 * violation returns results rather than throwing.
 */
/**
 * The rule set, in one place because three call sites had hand-copied it.
 *
 * Beyond the four WCAG tags: `best-practice` and the one experimental rule that
 * matters here. Lighthouse runs both against the live site and found three real
 * defects this suite was green on, because axe's tag filter excluded them:
 *
 *   aria-allowed-role            — best-practice, so filtered out. Six clickable
 *                                  cards carried role="link" on <article>, which
 *                                  ARIA does not permit.
 *   label-content-name-mismatch  — WCAG 2.5.3 but EXPERIMENTAL, so off unless
 *                                  named explicitly. Two controls had an
 *                                  accessible name that did not contain their
 *                                  own visible label.
 *
 *   target-size                  — WCAG 2.2 AA, and the tag list stopped at 2.1,
 *                                  so filtered out. Fifteen homepage card links
 *                                  and buttons measured 20px tall; Lighthouse
 *                                  runs the rule but scans mid-.reveal, so the
 *                                  cards are transparent when it looks.
 *
 * The third (button-name, plain wcag2a) was missed for a different reason
 * entirely — see MOBILE below.
 */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const AXE_EXPERIMENTAL = ["label-content-name-mismatch"];

const axeFor = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .options({ rules: Object.fromEntries(AXE_EXPERIMENTAL.map((id) => [id, { enabled: true }])) });

async function scanWithRetry(page: Page) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axeFor(page).analyze();
    } catch (e) {
      const destroyed = String(e).includes("Execution context was destroyed");
      if (!destroyed || attempt >= 2) throw e;
      await page.waitForTimeout(1200);
    }
  }
}

/**
 * The verdict, in one place because six call sites had hand-copied it.
 *
 * `!== "minor"` rather than serious/critical: bfde6e5 fixed three real defects
 * that this suite was green on, and its own message says why — "that suite
 * fails only on serious and critical while all three of these are scored
 * moderate". The filter was not widened then. It is now.
 */
function expectClean(results: Awaited<ReturnType<AxeBuilder["analyze"]>>, label: string) {
  const bad = results.violations.filter((v) => v.impact !== "minor");
  const report = bad
    .map((v) => `${label} — ${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`)
    .join("\n\n");
  expect(bad, report).toEqual([]);
}

/**
 * MOBILE. The suite only ever scanned Playwright's default 1280x720, and this
 * site hides text at breakpoints — `hidden sm:inline` on a label leaves an icon
 * button with no accessible name at all below 640px. The nav's "Ask my AI"
 * button shipped exactly that, on every route, and axe never saw it because axe
 * never looked at a phone. Lighthouse (which emulates a Moto G) found it in one
 * run against the live site.
 *
 * It ran over a hand-picked three routes ("/", "/hire", "/lab") against the
 * twenty-two the desktop loop covers, and that list drifted exactly the way the
 * old hand-kept ROUTES array did: /chess ships a mobile-only
 * scrollable-region-focusable violation that no chosen route could ever see.
 * So the two loops are one nested loop now — same body, one extra
 * setViewportSize — and adding a surface widens both widths at once.
 */
const MOBILE = { width: 390, height: 844 };
const VIEWPORTS = [
  { name: "desktop", size: null },
  { name: `${MOBILE.width}px`, size: MOBILE },
];

for (const v of VIEWPORTS) {
  for (const path of ROUTES) {
    test(`${path} has no axe violations (${v.name})`, async ({ page }) => {
      if (v.size) await page.setViewportSize(v.size);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: SETTLE_ANIMATIONS });
      // Let the route's client render land before scanning it.
      await page.waitForSelector("#main-content", { state: "attached" });
      await page.waitForTimeout(1500);
      expectClean(await scanWithRetry(page), `${path} (${v.name})`);
    });
  }
}

// The chat console is closed on load, so the loop above never sees it — its
// combobox/listbox wiring (aria-expanded, aria-controls, aria-activedescendant,
// role="option") was shipped unverified. Open it, then open the slash menu, and
// axe the panel in both states.
test("the chat console has no axe violations, closed menu or open", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open chat" }).click();

  const input = page.getByRole("combobox", { name: /Ask Panda/i });
  await expect(input).toBeVisible();

  const scan = async (label: string) => expectClean(await axeFor(page).analyze(), label);

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

  /* Expanded, the panel covers the viewport, so Tab must not walk out of it —
   * WCAG 2.4.11, focus obscured by the thing on top. It measurably did: ten
   * stops in, focus landed on AnomalyRail links and a nav button behind the
   * panel, all of them invisible. axe has no rule for this, so the guard is a
   * Tab walk.
   *
   * `<body>` is allowed and everything else is not. `inert` stops focus
   * ENTERING the page behind, but it does not make the last control wrap: Tab
   * off the end goes to the browser's own chrome, which the DOM reports as
   * body, and the next Tab comes back to the top of the panel. That hop is the
   * platform's, and it lands on nothing the visitor cannot see. A named control
   * outside the dialog is the actual defect. */
  await page.getByRole("button", { name: "Expand chat panel" }).click();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "body";
      return el.closest('[role="dialog"]') ? "dialog" : `${el.tagName} ${el.textContent?.trim().slice(0, 40)}`;
    });
    expect(where, `Tab ${i + 1} left the expanded chat panel`).toMatch(/^(dialog|body)$/);
  }
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

test("every chess pane has no axe violations", async ({ page }) => {
  await page.goto("/chess", { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: SETTLE_ANIMATIONS });
  await page.waitForSelector("#main-content", { state: "attached" });

  // The tabs are server-rendered; clicking one before React owns it loses the
  // click, and the wait below then times out on a pane nothing ever opened.
  await waitForHydration(page);

  for (const pane of CHESS_PANES) {
    await page.getByRole("button", { name: pane.tab }).click();
    await expect(pane.ready(page)).toBeVisible({ timeout: 20_000 });
    expectClean(await axeFor(page).analyze(), pane.tab);
  }
});

// CommandPalette is mounted on "/" (scanned above), but the loop never
// presses ⌘K, so its role="dialog"/combobox/listbox wiring was unverified —
// same class of gap the chat-console test above exists to catch.
/* The launcher renders nothing until it is opened, so the route loop above can
 * never see it — the same blind spot that let the chat console's combobox
 * wiring ship unverified. It is opened from inside a ROOM on purpose: that is
 * the case it exists for (moving sideways between rooms instead of going back
 * to the hub), and it puts a dialog on top of a full-screen WebGL route, which
 * is the least forgiving ground it will ever land on. */
test("the launcher has no axe violations when open", async ({ page }) => {
  await page.goto("/forge", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Surfaces/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  expectClean(await scanWithRetry(page), "launcher open");
});

test("the command palette has no axe violations when open", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Meta+k");
  await expect(page.getByRole("dialog")).toBeVisible();

  expectClean(await axeFor(page).analyze(), "command palette open");
});
