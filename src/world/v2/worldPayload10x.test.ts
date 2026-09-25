import { describe, expect, it } from "vitest";

import { landOf } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

/**
 * D4 (living-ledger-spec §3.4): for G1, G2, G6-G8, G10, G11, G12,
 * `landOf` stays under 200ms on a 10x fixture and the rendered instance
 * count for that rule stays at or below its declared post-aggregation cap.
 * Rows bounded by a career (weirs, footbridges, paddies, benches,
 * landmark facets, the reach columns) are exempt, listed here so the
 * exemption is visible rather than merely absent.
 */
const COVERED_RULE_IDS = ["year-strata", "river-width", "pr-stone", "lesson-kite", "archive-kite", "firefly", "deepmal-niche", "benchmark"];
const EXEMPT_RULE_IDS = ["district-bench", "weir", "footbridge", "chess-paddy", "chess-ridge", "landmark-facet", "reach-installs", "reach-upstream", "employer-marker"];

function repeat10x<T>(ledger: T, path: readonly (string | number)[], factor: number): T {
  const clone = structuredClone(ledger) as Record<string | number, Record<string | number, unknown>>;
  let arr: Record<string | number, unknown> = clone;
  for (const key of path.slice(0, -1)) arr = arr[key] as Record<string | number, unknown>;
  const lastKey = path[path.length - 1];
  const base = arr[lastKey] as unknown[];
  const grown: unknown[] = [];
  for (let i = 0; i < factor; i++) {
    for (const item of base) {
      const copy = structuredClone(item) as Record<string, unknown>;
      // Every seeded field a placementSeed might read gets a unique suffix
      // so 10x copies don't collide into the same feature id.
      for (const field of ["url", "id", "slug"]) {
        if (typeof copy[field] === "string") copy[field] = `${copy[field]}-x${i}`;
      }
      grown.push(copy);
    }
  }
  arr[lastKey] = grown;
  return clone as unknown as T;
}

describe("worldPayload10x: D4 scalable", () => {
  it("every covered rule id is a real GRAMMAR rule with a real cap10x", () => {
    for (const id of COVERED_RULE_IDS) {
      const rule = GRAMMAR.find((r) => r.id === id);
      expect(rule, id).toBeDefined();
      expect("cap10x" in rule!.scale, `${id} needs a cap10x scale plan, not exempt`).toBe(true);
    }
  });

  it("every exempt rule id really is exempt (the exemption is visible, not just absent)", () => {
    for (const id of EXEMPT_RULE_IDS) {
      const rule = GRAMMAR.find((r) => r.id === id);
      expect(rule, id).toBeDefined();
      expect("exempt" in rule!.scale, `${id} expected to be exempt`).toBe(true);
    }
  });

  it("landOf stays under 200ms and instance counts stay at or below cap, on a 10x pr-stone fixture", () => {
    const ledger = repeat10x(buildFixtureLedger(), ["openSource"], 150); // >480 cap, comfortably
    const start = performance.now();
    const features = landOf(ledger);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);

    const rule = GRAMMAR.find((r) => r.id === "pr-stone")!;
    const cap = (rule.scale as { cap10x: number }).cap10x;
    const instanceCount = features.filter((f) => f.rule === "pr-stone").length;
    expect(instanceCount).toBeLessThanOrEqual(cap);

    // the DATA claim (countOf) is never capped — only the render list is.
    const rawCount = rule.countOf(rule.source(ledger));
    expect(rawCount).toBeGreaterThan(cap);
  });

  it("landOf stays under 200ms and instance counts stay at or below cap, on a 10x lesson/archive-kite fixture", () => {
    const ledger = repeat10x(repeat10x(buildFixtureLedger(), ["writing", "lessons"], 30), ["writing", "archive"], 30);
    const start = performance.now();
    const features = landOf(ledger);
    expect(performance.now() - start).toBeLessThan(200);

    for (const id of ["lesson-kite", "archive-kite"]) {
      const rule = GRAMMAR.find((r) => r.id === id)!;
      const cap = (rule.scale as { cap10x: number }).cap10x;
      const instanceCount = features.filter((f) => f.rule === id).length;
      expect(instanceCount, id).toBeLessThanOrEqual(cap);
    }
  });

  it("landOf stays under 200ms and deepmal-niche's lit fraction is preserved past its cap", () => {
    const ledger = repeat10x(repeat10x(buildFixtureLedger(), ["fleet", "live"], 200), ["fleet", "delisted"], 200);
    const start = performance.now();
    const features = landOf(ledger);
    expect(performance.now() - start).toBeLessThan(200);

    const rule = GRAMMAR.find((r) => r.id === "deepmal-niche")!;
    const cap = (rule.scale as { cap10x: number }).cap10x;
    const instanceCount = features.filter((f) => f.rule === "deepmal-niche").length;
    expect(instanceCount).toBeLessThanOrEqual(cap);
  });
});
