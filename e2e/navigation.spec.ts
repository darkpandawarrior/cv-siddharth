import { test, expect } from "@playwright/test";
import { SECTION_ID_LIST } from "../src/lib/navigation.ts";
import { surfaces } from "../src/data/surfaces.ts";

/**
 * The registry against the rendered page.
 *
 * SECTION_ID_LIST is the single source for "is this hash a section?", for the
 * command palette's jump list and for the assistant's list of linkable home
 * sections — and it was the last hand-kept copy in the nav stack. Three
 * consumers were derived from it, so all three drifted together and silently:
 * by the time the surfaces refactor landed the array was missing `morph` (added
 * with DeviceMorph, never registered — ⌘K could not jump to it and `#morph`
 * classified as a route to a page that does not exist) and `shipped`, and
 * listed the rest in an order the homepage had not used for a while.
 *
 * Every unit test in the repo passed throughout, because a hand-kept list of
 * strings agrees with itself. Only the rendered document knows.
 */
test.describe("the home page matches its own registry", () => {
  test("every registered section exists, in the order the registry declares", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const ids = new Set<string>(SECTION_ID_LIST);
    const rendered = await page.evaluate(
      (want) => [...document.querySelectorAll("main [id]")].map((e) => e.id).filter((id) => want.includes(id)),
      [...ids],
    );
    expect(rendered, "home section ids, in DOM order").toEqual([...SECTION_ID_LIST]);
  });

  // No browser: this one is about two registries agreeing, and the page has
  // nothing to say about it.
  test("no home section id shadows a route it is not meant to", () => {
    // `shipped` is deliberately both — the section wins, and __root.tsx's
    // HASH_ROUTES subtracts the section ids so `#shipped` scrolls instead of
    // navigating. Anything else sharing a name is an accident worth failing on.
    const routeSlugs = new Set(surfaces.map((s) => s.to.replace(/^\//, "")));
    const shadowed = SECTION_ID_LIST.filter((id) => routeSlugs.has(id));
    expect(shadowed).toEqual(["shipped"]);
  });

  test("the command palette can reach every route in the registry", async ({ page }) => {
    // The Launcher's docstring claims "⌘K already reaches every surface — by
    // name". It reached eleven of sixteen: /chess, /weeb, /ink, /excelsior and
    // /shipped had no row at all.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Opened once and re-queried, rather than opened and dismissed sixteen
    // times: the palette makes the rest of the document inert while it is up,
    // so a fill racing the close animation targets a node that is on its way
    // out. Same assertion, one state transition.
    await page.getByRole("button", { name: /open the command palette/i }).click();
    const search = page.getByRole("combobox", { name: "Command palette search" });
    await expect(search).toBeVisible();
    for (const surface of surfaces) {
      await search.fill(surface.label);
      // Substring, not exact: an option's accessible name is its whole text,
      // which includes the "Open" hint chip after the label.
      await expect(
        page.getByRole("option", { name: surface.label }).first(),
        `no palette row for ${surface.to}`,
      ).toBeVisible();
    }
  });
});

// Phase A-part-1: footer + command palette are router-native now (no more
// `#hash` bounce through the legacy HashCompat shim). These checks pin the
// two user-visible contracts: a route link lands on the real path with no
// intermediate `/#...` URL, and a section link stays on "/" and scrolls.
test.describe("primary nav surfaces (footer, command palette)", () => {
  test("footer route link navigates straight to /resume, no hash bounce", async ({ page }) => {
    const seenUrls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) seenUrls.push(frame.url());
    });

    await page.goto("/");
    await page.locator("footer").getByRole("link", { name: "Résumé" }).click();
    await expect(page).toHaveURL(/\/resume$/);
    await expect(page.locator("body")).toContainText(/Experience/i);

    expect(seenUrls.some((u) => u.includes("/#"))).toBe(false);
  });

  test("footer section link scrolls to #skills on the home page", async ({ page }) => {
    await page.goto("/");
    const before = await page.evaluate(() => window.scrollY);

    await page.locator("footer").getByRole("button", { name: "Skills" }).click();
    await expect(page.locator("#skills")).toBeInViewport();

    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
    expect(page.url()).not.toContain("/#");
  });

  test("command palette route command navigates to /loopdown", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /open the command palette/i }).click();
    await page.getByRole("combobox", { name: "Command palette search" }).fill("Loopdown");
    await page.getByRole("option", { name: /The Loopdown/i }).click();

    await expect(page).toHaveURL(/\/loopdown$/);
    await expect(page.locator("dialog, [role=dialog]")).toHaveCount(0);
  });
});

// Phase A-part-2: every remaining internal `#hash` control (back-links on
// isolated routes, lab-to-project cross-links, ...) converted to
// useSectionNav()/<Link> too. These pin the two shapes that regressed before
// the helper existed — the F1 bug: a bare `#top` on a non-home route just
// changed the URL with nothing on the page to scroll to.
test.describe("isolated-route back-links and cross-links", () => {
  test("resume's back-to-portfolio control lands on / with the hero in view (the F1 scenario)", async ({ page }) => {
    await page.goto("/resume");
    await page.getByRole("button", { name: "Back to portfolio" }).click();

    await expect(page).toHaveURL(/\/#top$/);
    await expect(page.locator("#top")).toBeInViewport();
  });

  test("a lab's project cross-link navigates to /project/mileway", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("link", { name: "rebuilt again at Mileway" }).click();

    await expect(page).toHaveURL(/\/project\/mileway$/);
    await expect(page.locator("body")).toContainText(/mileway/i);
  });
});
