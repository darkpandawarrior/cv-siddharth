import { expect, test } from "./lib/test.ts";
import { compareSets } from "../src/data/compareSets.ts";
import { projects } from "../src/data/profile.ts";

// Every project slug that ships a live Wasm/Compose embed, derived from the
// same profile.ts targets DeviceWall itself reads — never a hand-typed list
// that can drift when a target is added or removed. "portfolio" keeps its own
// bespoke test above (the CMP twin's no-<canvas> quirk needs its own comment);
// excluded here so the two suites don't register the same test title twice.
const liveTargetSlugs = projects
  .filter((p) => p.targets?.some((t) => t.liveUrl) && p.slug !== "portfolio")
  .map((p) => p.slug);

/**
 * A project page's two "things to look at" — the compare viewer and the gallery — are both
 * data-driven and both fail silently. compareSets.ts is generated from disk, so a set can vanish
 * (or never appear) without a single error; the gallery falls back to an auto-generated list, so an
 * empty one just renders nothing. Assert on the rendered page, not on the data.
 */
for (const slug of Object.keys(compareSets)) {
  test(`${slug}: the compare viewer renders, above the gallery`, async ({ page }) => {
    await page.goto(`/project/${slug}`);
    const compare = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Same screen,/ }) });
    await expect(compare).toBeVisible();
    // Scroll to it: the screenshots are loading="lazy", so they never decode while the section
    // sits thousands of px below the viewport and naturalWidth stays 0 forever.
    await compare.evaluate(el => el.scrollIntoView({ behavior: "instant" }));
    // Non-empty: a real, decoded image, not an empty frame. Polled — these are loading="lazy",
    // so naturalWidth is 0 for a beat after the element becomes visible.
    const shot = compare.locator("img").first();
    await expect(shot).toBeVisible();
    await expect
      .poll(() => shot.evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);

    const gallery = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Screens \(/ }) });
    await expect(gallery).toBeVisible();
    const tops = await Promise.all(
      [compare, gallery].map((l) => l.evaluate((e: HTMLElement) => e.offsetTop)),
    );
    expect(tops[0], "compare belongs above the gallery").toBeLessThan(tops[1]);
  });
}

/**
 * THE BUG: ProjectDetail used to snapshot document.title on mount and restore that snapshot on
 * unmount. On a browser Back off a project page, the destination route's OWN head() had already set
 * the correct title before this cleanup ran — so the cleanup clobbered it with a stale snapshot from
 * back when THIS page mounted. Reproduced by going /map -> /project/doori -> back, and checking the
 * title is /map's again, not stuck on "Doori — ...".
 */
test("back-navigating off a project page restores the destination's own title", async ({ page }) => {
  await page.goto("/map");
  const mapTitle = await page.title();
  await page.goto("/project/doori");
  await expect.poll(() => page.title()).toContain("Doori");
  await page.goBack();
  await expect(page).toHaveURL(/\/map$/);
  await expect.poll(() => page.title()).toBe(mapTitle);
});

/**
 * writingMeta.ts's lessonsFor(slug) is the lesson-level counterpart to
 * fieldNotesFor's series chips — an individual link per post, not just the
 * series it belongs to. Doori is the project with the most lessons naming it,
 * so its page is the one to assert the row actually renders a real link
 * (dev.to and friends), not just an empty container.
 */
test("/project/doori shows at least one lesson link under field notes", async ({ page }) => {
  await page.goto("/project/doori");
  const fieldNotes = page.locator("text=field notes").locator("..");
  await expect(fieldNotes).toBeVisible();
  const lessonLink = page.locator('a[href*="dev.to"]');
  await expect(lessonLink.first()).toBeVisible();
});

/**
 * Candidai's star-count prose dropped its emoji for plain "N stars" wording
 * (no emoji as data) — this checks the rendered page, not just the source
 * string, so a future component that re-introduces "⭐" (e.g. ReposShowcase's
 * own upstreamStars render) is caught wherever it renders, not just here.
 */
test("/project/candidai contains no star emoji", async ({ page }) => {
  await page.goto("/project/candidai");
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[⭐★🌟]/u);
});

/**
 * THE BUG: the live-embed reveal probe looked up `#ComposeTarget`, which the Compose Multiplatform
 * 1.12 build under /portfolio-app does not have — it renders into a plain div and has no <canvas>
 * at all. So the probe timed out, gave up, and the "live" frame stayed a black box forever. This
 * asserts the iframe actually reveals (opacity 1), which is the only observable difference.
 */
test("the portfolio's live CMP/Wasm embed reveals over its screenshot floor", async ({ page }) => {
  test.slow(); // first load pulls ~12 MB of Wasm and compiles it
  await page.goto("/project/portfolio");
  // The iframe is lazy-mounted on first intersection, so it does not exist until the device wall
  // is scrolled to — waiting on the iframe itself would wait forever.
  await page.getByRole("heading", { name: "One codebase, every surface" }).evaluate(el => el.scrollIntoView({ behavior: "instant" }));
  const frame = page.locator('iframe[title="Live web build"]');
  await expect(frame).toBeVisible({ timeout: 30_000 });
  await expect(frame).toHaveCSS("opacity", "1", { timeout: 90_000 });
});

/**
 * L10 (deployment weight): all five "-app" builds now load from
 * HEAVY_ASSET_BASE (src/lib/assetBase.ts) rather than from this origin's own
 * public/ — a cross-origin embed in production. Generalizes the portfolio-only
 * check above across every project that ships a live target, so a bundle that
 * fails to resolve from the new origin (a bad path, a missing publish) shows up
 * here as a frame that never reveals, not as a silent screenshot fallback
 * nobody notices. Reads the slugs from profile.ts itself — new live target,
 * new coverage, no hardcoded list to fall out of date.
 */
for (const slug of liveTargetSlugs) {
  test(`${slug}'s live web build reveals over its screenshot floor`, async ({ page }) => {
    test.slow(); // first load pulls several MB of Wasm and compiles it
    await page.goto(`/project/${slug}`);
    // Same trap the portfolio test above already worked around: the iframe is
    // lazy-mounted on first intersection, so it does not exist in the DOM
    // until then — scrolling to it directly waits forever for an element that
    // is never there yet. Scroll to the section heading instead.
    await page.getByRole("heading", { name: "One codebase, every surface" }).evaluate(el => el.scrollIntoView({ behavior: "instant" }));
    // index.css sets `scroll-behavior: smooth` site-wide, so the scroll above
    // is still animating when the next line runs on a page this far down
    // (Doori/PaymentsLab-KMP ship far more sections above this one than
    // Portfolio/Stutter do) — a click mid-scroll lands on whatever the
    // viewport happened to hold at that instant, not the tab. Wait for the
    // scroll position to stop moving before clicking anything.
    await page.waitForFunction(() => {
      const key = "__scrollSettleY";
      const cur = document.scrollingElement?.scrollTop ?? 0;
      const last = (window as unknown as Record<string, number>)[key];
      (window as unknown as Record<string, number>)[key] = cur;
      return last === cur;
    });
    // DeviceWall's tab switcher defaults to its FIRST target (Android, for
    // Gaddi/Doori/PaymentsLab-KMP) — the live embed only exists once "Web" is
    // the active tab. Portfolio and Stutter happen to ship Web first, which is
    // why the single hand-written test above never needed this click.
    const webTab = page.getByRole("tab", { name: /Web/ });
    await expect.poll(() => webTab.evaluate(el => Object.keys(el).some(key => key.startsWith("__react")))).toBe(true);
    await webTab.click();
    await expect(webTab).toHaveAttribute("aria-selected", "true");
    // THE BUG: scrolling to the SECTION HEADING above puts the frame itself
    // in the viewport only on a short page. Doori's project page carries far
    // more prose and screenshots above this section than Gaddi/PaymentsLab-KMP
    // do (the 49-module writeup, the super-profile wave, master search) — long
    // enough that the actual DeviceFrame, one heading, one badge paragraph and
    // the tablist further down, sits below the fold once the heading itself
    // reaches the top. useInView's IntersectionObserver (threshold 0.15) then
    // never fires, the iframe never mounts, and the wait below times out on an
    // element that was never going to appear — not a slow paint, a scroll
    // target that was never going to bring the frame on screen for THIS page.
    // Center the tab itself: it sits directly above the frame regardless of
    // how much the project page carries above it.
    await webTab.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
    const frame = page.locator('iframe[title="Live web build"]');
    await expect(frame).toBeVisible({ timeout: 30_000 });
    // The src is whatever HEAVY_ASSET_BASE resolves to in this run's build —
    // asserting it is non-empty and matches the asset-base doc's own
    // production default confirms the iframe points at the moved origin, not
    // a leftover same-origin public/ path this lane's whole point was to kill.
    await expect(frame).toHaveAttribute("src", /^(https:\/\/darkpandawarrior\.github\.io\/cv|https?:\/\/localhost(:\d+)?)\/.+-app\/index\.html$/);
    await expect(frame).toHaveCSS("opacity", "1", { timeout: 90_000 });
  });
}
