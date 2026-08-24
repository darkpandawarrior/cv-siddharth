import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { openSource } from "./profile.ts";

/**
 * ONE FACT, ONE NUMBER.
 *
 * The HireSignal case study stated its provider count as both 76 and 62, and
 * its merged-PR count as both 17 and 4, on the same page. Neither was a typo:
 * scripts/gen-hiresignal-stats.mjs refreshes these from the live GitHub API,
 * but its regexes only reached four of the nine places the numbers appear, so
 * the four it could see kept moving and the rest froze wherever they were.
 * The live values on 2026-08-24 were 78 and 18 — so even the higher of each
 * pair was stale.
 *
 * The generator now covers all nine. This fails if a tenth appears, which is
 * the only way the split can come back.
 */
describe("HireSignal's numbers agree with themselves", () => {
  const src = readFileSync(new URL("./profile.ts", import.meta.url), "utf8");

  it("states exactly one provider count", () => {
    const counts = [...new Set([...src.matchAll(/(\d+) ATS/g)].map((m) => m[1]))];
    expect(counts, `profile.ts claims ${counts.length} different provider counts: ${counts.join(", ")}`).toHaveLength(1);
  });

  it("states exactly one merged-PR count", () => {
    const counts = [...new Set([...src.matchAll(/(\d+) (?:merged PRs|PRs merged)/g)].map((m) => m[1]))];
    expect(counts, `profile.ts claims ${counts.length} different PR counts: ${counts.join(", ")}`).toHaveLength(1);
  });

  it("never lists more contributions than it claims", () => {
    // openSource[] is a curated subset of the merged PRs, so it may be SHORTER
    // than the claimed count — the live figure comes from the GitHub search
    // API and includes PRs the list has not been updated with. It must never
    // be LONGER, which would mean the headline number is undercounting work
    // the page is already showing.
    const claimed = Number([...src.matchAll(/(\d+) merged PRs/g)][0]?.[1] ?? 0);
    expect(claimed).toBeGreaterThan(0);
    expect(openSource.length).toBeLessThanOrEqual(claimed);
  });
});
