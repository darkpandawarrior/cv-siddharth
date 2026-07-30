import { test, expect, type Page } from "@playwright/test";

/* ── The chess section renders with the network cut ──────────────────────
 *
 * This is the property the whole build-time architecture exists to buy, and it
 * is worth an assertion rather than an argument. `scripts/gen-chess-stats.mjs`
 * runs in CI and commits two artefacts — `src/data/chess.ts` (bundled) and
 * `public/chess/corpus.json` (fetched same-origin by the room). Nothing on
 * either surface calls lichess or chess.com at view time: chess.com 403s
 * serverless egress without a User-Agent it likes, and the lichess half is a
 * frozen archive that takes ~9 minutes to export. If a future change quietly
 * reintroduces a runtime API call, these two tests go red instead of the site
 * going blank for a visitor behind a corporate proxy.
 *
 * "No network" here means: everything off-origin is aborted. Same-origin
 * requests are the committed build output — the JS chunks and corpus.json are
 * exactly the artefacts under test, so blocking them would test nothing.
 *
 * Caveat worth stating rather than hiding: `page.route` covers HTTP(S) only.
 * A WebSocket (playhtml, on the "Guess the Move" pane) is not intercepted by
 * it, so neither test opens that pane — both stay on surfaces that make HTTP
 * requests or none at all.
 */

const ORIGIN = "http://localhost:4173";

/** Aborts every off-origin request and returns the list of what was cut, so a
 *  failure names the dependency that appeared rather than just going red. */
async function cutTheNetwork(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN)) return route.continue();
    blocked.push(url);
    return route.abort();
  });
  return blocked;
}

test("/chess renders the room from committed data with no network", async ({ page }) => {
  const blocked = await cutTheNetwork(page);

  await page.goto("/chess", { waitUntil: "domcontentloaded" });

  const room = page.locator("#chess-pane");

  // The honest failure state the loader renders when corpus.json doesn't
  // arrive. Asserting against it directly means a broken fetch can't pass as
  // "the page rendered".
  await expect(room).not.toContainText("didn't load");

  // Straight from corpus.arc + chess.activityByYear, and it names both
  // platforms — so this one sentence proves the bundled summary and the
  // fetched corpus both made it into the DOM.
  await expect(room).toContainText(
    /Where the arc changes hands: in \d{4} chess\.com carried [\d,]+ games against lichess's [\d,]+/,
    { timeout: 20_000 },
  );

  // corpus.json's own stamp — only rendered once the fetch resolved and parsed.
  await expect(page.locator("#main-content")).toContainText(/corpus generated \d{4}-\d{2}-\d{2}/);

  // Not an assertion, a breadcrumb: if this ever prints a lichess or chess.com
  // URL, the room grew a runtime API call and the offline property is gone.
  expect(blocked.filter((u) => /lichess|chess\.com/.test(u)), blocked.join("\n")).toEqual([]);
});

test("the home chess section renders its thesis and both profile links with no network", async ({ page }) => {
  await cutTheNetwork(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const section = page.locator("#chess");

  /* The thesis figure. Matched as a shape, not a value: the corpus grows every
   * time he plays (it gained three games within an hour of first generation),
   * so pinning 41.9% here would make a regenerate fail this test for being
   * correct. */
  await expect(section).toContainText(
    /\d+\.\d% of my decided games ended on a clock, not on a board/,
  );

  // Both profile links. These are the plan's stated offline targets; they live
  // in ChessSection on "/" rather than in the room, which renders no outbound
  // profile link at all.
  await expect(section.getByRole("link", { name: /lichess/ })).toHaveAttribute(
    "href",
    /^https:\/\/lichess\.org\//,
  );
  await expect(section.getByRole("link", { name: /chess\.com/ })).toHaveAttribute(
    "href",
    /^https:\/\/www\.chess\.com\//,
  );
});
