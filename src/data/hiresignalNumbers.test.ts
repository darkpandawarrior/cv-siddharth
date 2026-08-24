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

  it("keeps the lab instruments from contradicting the case study", () => {
    // FanoutLab hardcoded 62 providers while profile.ts said 78, and ThemeLab
    // said "20+" white-label clients where profile says 150+. Both UNDERSTATED
    // his work, on the surfaces that exist specifically to demonstrate it —
    // which is the direction of error nobody ever notices, because a number
    // that is too small never looks like a bug.
    const fanout = readFileSync(new URL("../labs/FanoutLab.tsx", import.meta.url), "utf8");
    const labs = readFileSync(new URL("./labs.ts", import.meta.url), "utf8");
    const theme = readFileSync(new URL("../labs/ThemeLab.tsx", import.meta.url), "utf8");
    const providers = [...src.matchAll(/(\d+) ATS/g)][0]?.[1];
    expect(providers).toBeDefined();
    expect(fanout, `FanoutLab must show ${providers} providers`).toContain(`const TOTAL_PROVIDERS = ${providers};`);

    // The bench's own tab label was a tenth site, and it said 62. Asserting
    // that labs.ts carries NO digit-literal provider count, rather than that
    // it carries the right one, is what makes an eleventh site fail here
    // instead of quietly joining the split.
    expect(
      [...labs.matchAll(/(\d+) providers/g)].map((m) => m[1]),
      "labs.ts should interpolate providerCount, not type a number",
    ).toEqual([]);
    const shared = readFileSync(new URL("./hiresignal.ts", import.meta.url), "utf8");
    expect(shared, `providerCount must track the ${providers} the generator writes into the case study`).toContain(
      `export const providerCount = ${providers};`,
    );

    const clients = [...src.matchAll(/(\d+)\+ (?:white-label )?client/g)][0]?.[1];
    expect(clients).toBeDefined();
    const themeCounts = [...new Set([...theme.matchAll(/(\d+)\+ (?:white-label )?client/g)].map((m) => m[1]))];
    expect(themeCounts, `ThemeLab claims ${themeCounts.join("/")} clients, profile says ${clients}`).toEqual([clients]);
  });
});
