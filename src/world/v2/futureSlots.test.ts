import { describe, expect, it } from "vitest";

import { futureSlots } from "./futureSlots.ts";
import { landOf } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { dateZ } from "../city.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

const PEGGED_RULE_IDS = ["pr-stone", "lesson-kite", "deepmal-niche", "benchmark"];

describe("futureSlots (§8.2)", () => {
  it("pegs exist for exactly G6/G7/G11/G12, and no others", () => {
    const ledger = buildFixtureLedger();
    const pegs = futureSlots(ledger, new Date("2026-06-30T00:00:00.000Z"));
    expect(pegs.map((p) => p.ruleId).sort()).toEqual([...PEGGED_RULE_IDS].sort());
  });

  it("weirs and footbridges get no peg", () => {
    const ledger = buildFixtureLedger();
    const pegs = futureSlots(ledger, new Date("2026-06-30T00:00:00.000Z"));
    expect(pegs.some((p) => p.ruleId === "weir")).toBe(false);
    expect(pegs.some((p) => p.ruleId === "footbridge")).toBe(false);
  });

  it("each peg sits at dateZ(now) within 1e-9", () => {
    const ledger = buildFixtureLedger();
    const now = new Date("2026-06-30T00:00:00.000Z");
    const pegs = futureSlots(ledger, now);
    const expectedZ = dateZ("2026-06-30");
    for (const p of pegs) expect(Math.abs(p.z - (expectedZ ?? NaN))).toBeLessThan(1e-9);
  });

  it("is deterministic for a fixed (ledger, now)", () => {
    const ledger = buildFixtureLedger();
    const now = new Date("2026-06-30T00:00:00.000Z");
    expect(futureSlots(ledger, now)).toEqual(futureSlots(ledger, now));
  });

  it("advances: adding the real record places the feature on the peg's own line", () => {
    const ledger = buildFixtureLedger();
    const now = new Date("2026-06-30T00:00:00.000Z");
    const peg = futureSlots(ledger, now).find((p) => p.ruleId === "pr-stone")!;

    const withNewPr = structuredClone(ledger);
    withNewPr.openSource = [
      ...withNewPr.openSource,
      { repo: "career-ops-hq/career-ops", title: "fix(today)", url: "https://example.com/pr/today", status: "merged", date: "2026-06-30", org: "career-ops-hq" },
    ];
    const features = landOf(withNewPr);
    const newFeature = features.find((f) => f.id === "pr-stone:https://example.com/pr/today");
    expect(newFeature).toBeDefined();
    expect(Math.abs(newFeature!.pos[2] - peg.z)).toBeLessThan(1e-9);

    // the peg itself is unchanged by adding the record — it always reads
    // "now", not the ledger's content (GRAMMAR still lists pr-stone).
    const pegAfter = futureSlots(withNewPr, now).find((p) => p.ruleId === "pr-stone")!;
    expect(pegAfter.z).toBe(peg.z);
  });

  it("every pegged rule id is a real GRAMMAR rule", () => {
    const ruleIds = new Set(GRAMMAR.map((r) => r.id));
    for (const id of PEGGED_RULE_IDS) expect(ruleIds.has(id)).toBe(true);
  });
});
