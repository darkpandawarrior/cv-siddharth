import { describe, expect, it } from "vitest";

import { visitDiff, type LastSeen } from "./visitDiff.ts";
import { landOf } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

function countsFor(ledger: ReturnType<typeof buildFixtureLedger>) {
  const counts: Record<string, number> = {};
  for (const rule of GRAMMAR) {
    if (rule.class === "I") counts[rule.id] = rule.countOf(rule.source(ledger));
  }
  return counts;
}

describe("visitDiff (§7.3, pure)", () => {
  const ledger = buildFixtureLedger();
  const features = landOf(ledger);
  const counts = countsFor(ledger);
  const now = new Date("2026-06-30T00:00:00.000Z");

  it("is deterministic for the same inputs", () => {
    const a = visitDiff(features, counts, null, now);
    const b = visitDiff(features, counts, null, now);
    expect(a).toEqual(b);
  });

  it("first visit (lastSeen null) windows to the last 30 days", () => {
    const diff = visitDiff(features, counts, null, now);
    expect(diff.sinceDays).toBe(30);
    // every "grown" rule's `to` must equal the count of that rule's own
    // features dated within the window — never the all-time total.
    for (const g of diff.grown) {
      const windowCount = features.filter(
        (f) => f.rule === g.ruleId && f.date !== null && new Date(f.date).getTime() > now.getTime() - 30 * 86400000,
      ).length;
      expect(g.to).toBe(windowCount);
      expect(g.to).toBeLessThanOrEqual(counts[g.ruleId] ?? Infinity);
    }
  });

  it("with a lastSeen snapshot, grown is the count delta since that snapshot", () => {
    const lastSeen: LastSeen = { at: "2026-06-01T00:00:00.000Z", counts: { "pr-stone": counts["pr-stone"] - 1 } };
    const diff = visitDiff(features, counts, lastSeen, now);
    const prStoneGrown = diff.grown.find((g) => g.ruleId === "pr-stone");
    expect(prStoneGrown).toEqual({ ruleId: "pr-stone", from: counts["pr-stone"] - 1, to: counts["pr-stone"] });
  });

  it("a rule with no count change never appears in `grown`", () => {
    const lastSeen: LastSeen = { at: "2026-06-01T00:00:00.000Z", counts: { ...counts } };
    const diff = visitDiff(features, counts, lastSeen, now);
    expect(diff.grown).toEqual([]);
  });

  it("newFeatureIds only ever contains features dated after the window start", () => {
    const lastSeen: LastSeen = { at: "2026-05-15T00:00:00.000Z", counts: {} };
    const diff = visitDiff(features, counts, lastSeen, now);
    const sinceDate = new Date(lastSeen.at).getTime();
    for (const id of diff.newFeatureIds) {
      const f = features.find((x) => x.id === id)!;
      expect(f.date).not.toBeNull();
      expect(new Date(f.date!).getTime()).toBeGreaterThan(sinceDate);
    }
  });

  it("break-it (G15): a fixture with an inflated lastSeen count never reports negative growth", () => {
    const lastSeen: LastSeen = { at: "2026-06-01T00:00:00.000Z", counts: { "pr-stone": 999999 } };
    const diff = visitDiff(features, counts, lastSeen, now);
    expect(diff.grown.some((g) => g.ruleId === "pr-stone")).toBe(false); // filtered out: to <= from
  });

  it("sentence mentions the day count and stays empty-safe with nothing new", () => {
    const diff = visitDiff([], {}, { at: "2026-06-29T00:00:00.000Z", counts: {} }, now);
    expect(diff.sentence).toContain("1 days");
    expect(diff.grown).toEqual([]);
    expect(diff.newFeatureIds).toEqual([]);
  });
});
