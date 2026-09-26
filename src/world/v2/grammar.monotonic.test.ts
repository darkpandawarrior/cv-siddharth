import { describe, expect, it } from "vitest";

import { GRAMMAR } from "./grammar.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

/**
 * D2: for every I-class rule, `countOf(rs.slice(0, k))` is non-decreasing
 * for k = 0..n (living-ledger-spec §3.4). The generator's own count-drop
 * guard (gen-world-grammar.test.mjs) covers drift ACROSS builds; this file
 * covers the invariant WITHIN a single `source()` array.
 */
describe("grammar.monotonic: D2 non-decreasing prefix counts", () => {
  const ledger = buildFixtureLedger();
  const iClassRules = GRAMMAR.filter((r) => r.class === "I");

  it("at least one I-class rule exists (the test isn't vacuous)", () => {
    expect(iClassRules.length).toBeGreaterThan(0);
  });

  for (const rule of iClassRules) {
    it(`${rule.id}: countOf(rs.slice(0, k)) is non-decreasing for k=0..n`, () => {
      const rs = rule.source(ledger);
      let prev = rule.countOf(rs.slice(0, 0));
      expect(prev).toBeGreaterThanOrEqual(0);
      for (let k = 1; k <= rs.length; k++) {
        const cur = rule.countOf(rs.slice(0, k));
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    });
  }

  it("break-it (G15): a rule whose countOf ignores its input would fail the guard above on a rule built to shrink", () => {
    // A minimal fixture rule that DOES violate D2 (count drops as more
    // records are considered) — proves the per-k loop above actually
    // catches a real violation rather than passing everything.
    const badRule = {
      countOf: (rs: readonly number[]) => (rs.length > 2 ? 0 : rs.length),
    };
    const rs = [1, 2, 3, 4];
    let prev = badRule.countOf(rs.slice(0, 0));
    let sawDecrease = false;
    for (let k = 1; k <= rs.length; k++) {
      const cur = badRule.countOf(rs.slice(0, k));
      if (cur < prev) sawDecrease = true;
      prev = cur;
    }
    expect(sawDecrease).toBe(true);
  });
});
