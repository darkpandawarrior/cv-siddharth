import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * The door counter, end to end against the production build.
 *
 * What this really guards is the shard design. The visitor total is a grow-only
 * counter spread over 64 keys of one shared CRDT document, and the rule that
 * makes it work is that every write touches a single key *in place*. Reassign
 * the containing object instead — an easy, invisible edit — and concurrent
 * visitors begin overwriting each other. No unit test can see that, because the
 * behaviour lives in Yjs. Two real browsers can.
 *
 * The assertions are relative on purpose: playhtml keys its room on hostname,
 * so this shares a `localhost` room with anything else pointed at the same
 * public server, and the absolute number is nobody's business. "Four new
 * browsers add exactly four" and "a reload adds none" hold regardless of what
 * is already in there. The one thing that would disturb them is a second local
 * session browsing /playground while this runs — if that happens the failure is
 * a true report about a shared room, not a wrong test.
 */

const PLAQUE = 'section[aria-label="Visitor count"]';

async function plaqueText(page: Page): Promise<string> {
  const plaque = page.locator(PLAQUE);
  await expect(plaque).toBeVisible({ timeout: 20_000 });
  return plaque.innerText();
}

function numberAfter(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) throw new Error(`no number matching ${pattern} in:\n${text}`);
  return Number(match[1].replace(/,/g, ""));
}

/** The plaque's "N through the door" — the rendered sum of the shards, and the
 *  number this whole design exists to keep correct. */
async function doorTotal(page: Page): Promise<number> {
  const plaque = page.locator(PLAQUE);
  await expect(plaque).toContainText(/through the door/, { timeout: 20_000 });
  return numberAfter(await plaque.innerText(), /([\d,]+) through the door/);
}

/** Which visitor this browser was told it is.
 *
 *  A first-ever visit runs the number up to its value, so a single read can
 *  catch it mid-flight and return something that was true for 40ms. Read until
 *  it stops moving. */
async function myNumber(page: Page): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = numberAfter(await plaqueText(page), /№\s*([\d,]+)/);
        const settled = now === last;
        last = now;
        return settled;
      },
      { timeout: 15_000, intervals: [500, 500, 500, 500, 500, 500] },
    )
    .toBe(true);
  return last;
}

/** A brand-new browser, so a genuine first-time visitor. */
async function freshVisit(browser: Browser): Promise<number> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/playground");
    return await doorTotal(page);
  } finally {
    await context.close();
  }
}

test.describe("the visitor ledger", () => {
  test("counts each new browser once, and loses nobody's write doing it", async ({ browser }) => {
    const totals = [await freshVisit(browser)];
    for (let i = 0; i < 3; i++) totals.push(await freshVisit(browser));

    const first = totals[0];
    expect(totals).toEqual([first, first + 1, first + 2, first + 3]);
  });

  test("does not count the same browser again, however often it comes back", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/playground");
    const counted = await doorTotal(page);
    expect(await plaqueText(page)).toMatch(/you are/i);

    for (let i = 0; i < 3; i++) {
      await page.goto("/playground");
      expect(await doorTotal(page)).toBe(counted);
    }
    // Already counted, so the arrival is history rather than news.
    expect(await plaqueText(page)).toMatch(/you were/i);

    await context.close();
  });

  test("gives a visitor a number and still knows it next time", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/playground");
    await doorTotal(page);
    const mine = await myNumber(page);
    expect(mine).toBeGreaterThan(0);

    await page.goto("/playground");
    await doorTotal(page);
    expect(await myNumber(page)).toBe(mine);

    await context.close();
  });

  test("declines to count a browser that will not remember being counted", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Only this feature's own keys are refused, which isolates the counter from
    // the shared layer underneath it: playhtml keeps its player identity in
    // localStorage too, and blocking everything would be testing that instead.
    await page.addInitScript(() => {
      const real = window.localStorage;
      const guard =
        (fn: (k: string, v?: string) => unknown) =>
        (key: string, value?: string) => {
          if (typeof key === "string" && key.startsWith("cv:")) {
            throw new DOMException("denied", "SecurityError");
          }
          return fn.call(real, key, value as string);
        };
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => ({
          getItem: guard(real.getItem),
          setItem: guard(real.setItem),
          removeItem: guard(real.removeItem),
          clear: () => real.clear(),
          key: (i: number) => real.key(i),
          length: real.length,
        }),
      });
    });

    await page.goto("/playground");
    // The Playground has to survive it — a counter declining to count is never
    // permission to take the page down with it.
    await expect(page.getByRole("heading", { name: /this site is a live demo/i })).toBeVisible();

    // Counted nobody, so it can only speak about the room, never about "you".
    const before = await doorTotal(page);
    expect(await plaqueText(page)).toMatch(/so far/i);

    await page.goto("/playground");
    expect(await doorTotal(page)).toBe(before);

    await context.close();
  });

  test("keeps the rooms readable when the shared layer cannot start at all", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    /* Chrome with "block all cookies" set does not hand back a storage object
     * whose methods fail — reaching for `localStorage` at all throws. That is
     * the shape worth testing, and it is the one that takes playhtml's init
     * down with it, since it keeps its player identity there. */
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("denied", "SecurityError");
        },
      });
    });

    await page.goto("/playground");

    // The rooms are the page. Losing presence, counters and the wall is a
    // downgrade; losing the Playground is a bug.
    await expect(page.getByRole("heading", { name: /this site is a live demo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Compose Playground/i })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/something broke/i);
    // Nothing is known about anyone, so the plaque says nothing at all.
    await expect(page.locator(PLAQUE)).toHaveCount(0);

    await context.close();
  });
});
