import { test, expect } from "./lib/test.ts";
import { loopdownArt } from "../src/data/loopdownArt.ts";
import { writing, type Lesson } from "../src/data/writing.ts";

/**
 * P1-07a's own acceptance, run against the fixed clock master-plan.md
 * assigns this lane: 2026-09-24T03:15:00+05:30.
 */
const NIGHT = "2026-09-24T03:15:00+05:30";

// Same "actually live somewhere" test WritingView/LoopdownCast use, computed
// straight from writing.ts rather than imported: reality-spec.md#6's own
// acceptance line asks for that independence.
const liveLessons = writing.lessons.filter(
  (l): l is Lesson & { created: string } => Boolean(l.links?.devto || l.links?.hashnode || l.links?.medium || l.links?.linkedin) && Boolean(l.created),
);
const newest = [...liveLessons].sort((a, b) => b.created.localeCompare(a.created))[0];
const expectedAgeDays = Math.floor(
  (new Date(NIGHT).getTime() - new Date(`${newest.created}T00:00:00Z`).getTime()) / 86_400_000,
);

test("loopdownArt.ts carries exactly 13 cast and 8 series entries, each with alt text", () => {
  const cast = loopdownArt.filter((a) => a.kind === "cast");
  const series = loopdownArt.filter((a) => a.kind === "series");
  expect(cast).toHaveLength(13);
  expect(series).toHaveLength(8);
  for (const a of loopdownArt) expect(a.alt, a.id).not.toBe("");
});

test("every loopdownArt image rendered on /loopdown carries its manifest alt text", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/loopdown", { waitUntil: "networkidle" });

  // Every img whose src names a loopdownArt id (cast portraits, series
  // covers on series headers, and the lesson-card avatars that reuse a cast
  // portrait) must show that entry's exact manifest alt: a wrong or blanked
  // alt on any of the three surfaces is the same regression.
  const imgs = page.locator('img[src*="/loopdown/cast/"], img[src*="/loopdown/series/"]');
  const count = await imgs.count();
  expect(count).toBeGreaterThanOrEqual(13); // the 13 cast portraits alone

  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    const src = await img.getAttribute("src");
    const id = src?.match(/\/loopdown\/(?:cast|series)\/([^/]+)\.webp/)?.[1];
    expect(id, `unrecognised loopdown image src: ${src}`).toBeTruthy();
    const art = loopdownArt.find((a) => a.id === id);
    expect(art, `${id} has no loopdownArt entry`).toBeDefined();
    await expect(img).toHaveAttribute("alt", art!.alt);
  }
});

test("the not-yet-summoned cast are drawn outlined, derived from the lesson-cast join", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/loopdown", { waitUntil: "networkidle" });

  const summonedIds = new Set(writing.cast.map((c) => c.id));
  for (const c of loopdownArt.filter((a) => a.kind === "cast")) {
    const figure = page.locator(`[data-testid="cast-${c.id}"]`);
    await expect(figure).toHaveAttribute("data-summoned", String(summonedIds.has(c.id)));
    if (!summonedIds.has(c.id)) await expect(figure).toContainText("not yet summoned");
  }
});

test("the newest lesson's live age equals the whole days since it was created", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/loopdown", { waitUntil: "networkidle" });
  const row = page.locator('[data-testid="newest-lesson-age"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText(newest.title);
  await expect(row).toContainText(newest.created);
  await expect(row).toContainText(`published ${expectedAgeDays} d ago`);
});

test("/read/<newest lesson slug> shows the absolute date and 'published N d ago'", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto(`/read/${newest.slug}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: newest.title })).toBeVisible();
  const row = page.locator('[data-testid="lesson-age"]');
  await expect(row).toContainText(newest.created!);
  await expect(row).toContainText(`published ${expectedAgeDays} d ago`);
});

test("/read/<newest lesson slug> SSR ships only the absolute date, before the client clock mounts", async ({ page }) => {
  // No clock override here: JS disabled means useNow() never mounts, so the
  // row must still show the absolute date on its own (reality-spec.md#6:
  // "SSR: the absolute date").
  const context = await page.context().browser()!.newContext({ javaScriptEnabled: false });
  const noJsPage = await context.newPage();
  await noJsPage.goto(`/read/${newest.slug}`);
  await expect(noJsPage.locator('[data-testid="lesson-age"]')).toContainText(newest.created!);
  await expect(noJsPage.locator('[data-testid="lesson-age"]')).not.toContainText("d ago");
  await context.close();
});

test("/loopdown has no measurable layout shift after load (PerformanceObserver, no CLS)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(NIGHT));
  await page.goto("/loopdown", { waitUntil: "load" });
  // Lets lazy images near the fold and any late hydration settle before the
  // shift sum is read; the observer itself is `buffered: true`, so it also
  // sees whatever shifted before this ran.
  await page.waitForTimeout(1000);
  const cls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let value = 0;
        try {
          const po = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
              if (!entry.hadRecentInput) value += entry.value;
            }
          });
          po.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
        } catch {
          // layout-shift unsupported in this engine, nothing to sum.
        }
        setTimeout(() => resolve(value), 500);
      }),
  );
  expect(cls).toBeLessThan(0.01);
});
