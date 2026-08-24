import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ROT HAS TO BE LOUD.
 *
 * Almost every generator here promises the same thing, and each one is right
 * on its own terms: if a fetch fails, keep the previous file rather than ship
 * a gap. gen-anthology says it, gen-project-stats says it, gen-chess-stats
 * says it. What none of them says is what happens when the fetch keeps
 * failing — the committed file stays valid, the build stays green, the daily
 * job keeps "succeeding", and the data quietly ages out.
 *
 * That is not hypothetical. On 2026-08-24, with a refresh job running every
 * day at 06:17 UTC, chessDeep.ts was 25 days old and weeb.ts was 19 — and
 * weeb's own page argues that a hand-kept list cannot see the present.
 *
 * So this asserts freshness on anything that timestamps itself. The threshold
 * is deliberately generous: it is not there to nag about a quiet week, it is
 * there so a generator that has been failing for a MONTH cannot keep passing
 * for one that works.
 */
const MAX_AGE_DAYS = 45;

/** Which generator to run when one of these fails. Derived from the file name
 *  rather than hand-mapped, so a new generated file is covered on arrival. */
const generatorFor = (file: string) => `npm run gen:${file.replace(/\.ts$/, "").replace(/([A-Z])/g, (m) => "-" + m.toLowerCase())}`;

describe("generated data has not quietly aged out", () => {
  const dir = new URL("./", import.meta.url).pathname;
  const stamped = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({ file: f, at: /"generatedAt":\s*"(\d{4}-\d{2}-\d{2})/.exec(readFileSync(join(dir, f), "utf8"))?.[1] }))
    .filter((x): x is { file: string; at: string } => Boolean(x.at));

  /**
   * Datasets whose source is live and external, so a stale file is a broken
   * generator rather than a quiet week.
   *
   * Named, not counted. `stamped.length >= 3` passed just as happily when a
   * generator DROPPED its stamp as when it kept it: the file falls out of the
   * scan, the set shrinks by one, and the 45-day alarm above simply stops
   * being able to see it. Removing the alarm is the failure this catches.
   *
   * timeline.ts is deliberately absent. Its generator recomputes lanes from
   * local files on every prebuild, so its stamp says a build happened, not
   * that data moved — a member that can never go red is padding, not cover.
   */
  const MUST_BE_STAMPED = ["chess.ts", "chessDeep.ts", "weeb.ts"];

  it.each(MUST_BE_STAMPED)("%s still carries a generatedAt stamp", (file) => {
    expect(
      stamped.map((s) => s.file),
      `${file} lost its generatedAt — the ${MAX_AGE_DAYS}-day alarm below cannot see it any more. ` +
        `Restore the stamp in its generator rather than deleting this line.`,
    ).toContain(file);
  });

/**
 * The hand-kept half of the same problem.
 *
 * profile.ts's `recentGrowth` is a curated narrative — "Mileway — offline AI +
 * policy engine" is a sentence no API produces — so it cannot be generated.
 * But it is dated, it is labelled RECENT, and on 2026-08-24 its newest entry
 * said Jul 2026 while the live GitHub feed showed pushes from yesterday. A
 * section headed "recently shipped" that stops a month and a half ago says
 * something worse about the site than having no such section.
 *
 * Nothing can auto-write this. What a test CAN do is refuse to let it rot in
 * silence, which is the whole difference between a list that is current and a
 * list that merely was.
 */
describe("the curated 'recent' list is actually recent", () => {
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  it("has a newest entry inside the freshness window", async () => {
    const { recentGrowth } = (await import("./profile.ts")) as { recentGrowth?: { date: string }[] };
    if (!recentGrowth?.length) return;
    // Dates read like "Jul 2026" or "Jun–Aug 2026"; take the LAST month named.
    const newest = recentGrowth
      .map((e) => {
        const year = /(\d{4})/.exec(e.date)?.[1];
        const months = [...e.date.toLowerCase().matchAll(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/g)].map((m) => MONTHS.indexOf(m[1]));
        if (!year || !months.length) return 0;
        return Date.UTC(Number(year), Math.max(...months), 1);
      })
      .reduce((a, b) => Math.max(a, b), 0);
    expect(newest, "no recentGrowth entry carried a parseable date").toBeGreaterThan(0);
    const ageDays = Math.floor((Date.now() - newest) / 86_400_000);
    expect(
      ageDays,
      `profile.ts's newest recentGrowth entry is ${ageDays} days old. It is the section headed ` +
        `"recently shipped" — nothing can generate it, so it is on a person to add what shipped ` +
        `since. The live /api/github-activity feed beside it is a good prompt for what to write.`,
    ).toBeLessThanOrEqual(MAX_AGE_DAYS + 30);
  });
});

  it.each(stamped)(`$file was regenerated within ${MAX_AGE_DAYS} days`, ({ file, at }) => {
    const ageDays = Math.floor((Date.now() - Date.parse(at)) / 86_400_000);
    expect(
      ageDays,
      `${file} was last generated ${at} (${ageDays} days ago). Its generator has probably been ` +
        `failing silently — they all keep the previous file on a fetch error, which is right, but ` +
        `means a broken source looks identical to a quiet one. Run ${generatorFor(file)} and read ` +
        `what it prints.`,
    ).toBeLessThanOrEqual(MAX_AGE_DAYS);
  });
});
