import { describe, it, expect } from "vitest";
import { projects } from "./profile.ts";
import { projectStats } from "./projectStats.ts";
import { repoStatLine, STATS_KEY } from "../lib/projectStatLine.ts";

/**
 * A project card prints TWO module counts: the hand-written `status` string
 * ("[ 46 MODULES · 5 PLATFORMS · 159 TESTS ]") and the generated one from
 * `repoStatLine` ("◇ 36 modules · 13 features · 368 screenshots"), about 30px
 * apart. Nothing checked that they agreed, and twice they did not:
 *
 *   - Mileway (now Doori) said 46 and 36 on the same card. 46 is the audited
 *     claim (claims.json `mileway-modules`: "36 local includes + 10 composed
 *     from kmp-toolkit"); repoStatLine was using the raw local count for
 *     Mileway while already summing local + composed for PaymentsLab.
 *   - Kursi (now Gaddi) said 13 while its settings.gradle.kts had 14 — a
 *     `:cli` module landed on 2026-08-26 and the hand-written line was never
 *     updated.
 *
 * A reader who counts is exactly the reader worth convincing, so the two
 * numbers have to be one number.
 */
describe("hand-written status agrees with the generated repo stats", () => {
  const modulesIn = (s: string) => {
    const m = s.match(/(\d+)\s+modules?/i);
    return m ? Number(m[1]) : null;
  };

  const covered = projects.filter((p) => (STATS_KEY[p.slug] ?? p.slug) in projectStats);

  it("finds the projects the stats generator covers", () => {
    expect(covered.length).toBeGreaterThanOrEqual(3);
  });

  it("never prints two different module counts on one card", () => {
    const clashes: string[] = [];
    for (const p of covered) {
      const stated = modulesIn(p.status);
      const generated = modulesIn(repoStatLine(p.slug) ?? "");
      if (stated !== null && generated !== null && stated !== generated) {
        clashes.push(`${p.slug}: status says ${stated}, repo says ${generated}`);
      }
    }
    expect(clashes, `run \`npm run gen:stats\` and reconcile: ${clashes.join("; ")}`).toEqual([]);
  });

  it("keeps the badges agreeing with the status line too", () => {
    const clashes: string[] = [];
    for (const p of covered) {
      const stated = modulesIn(p.status);
      const badge = p.badges.map(modulesIn).find((n) => n !== null);
      if (stated !== null && badge != null && stated !== badge) {
        clashes.push(`${p.slug}: status says ${stated}, badge says ${badge}`);
      }
    }
    expect(clashes, `card badges contradict the status line: ${clashes.join("; ")}`).toEqual([]);
  });
});
