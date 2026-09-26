import { describe, expect, it } from "vitest";

import { GRAMMAR } from "./grammar.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

// The specifier is assembled at runtime: the generator is a .mjs, this
// project does not set `allowJs`, and a literal import path would fail
// `tsc -b` for want of a declaration file (same pattern as
// src/data/readme.test.ts's own gen-system-prompt.mjs import).
const { computeGrowth } = (await import(new URL("../../../scripts/gen-world-grammar.mjs", import.meta.url).href)) as {
  computeGrowth: (
    grammar: typeof GRAMMAR,
    ledger: unknown,
    previous: { counts?: Record<string, number>; peaks?: Record<string, { current: number; peak: number; peakAt: string }> },
    corrections: { rule: string; from: number; to: number; reason: string }[],
  ) => {
    counts: Record<string, number>;
    peaks: Record<string, { current: number; peak: number; peakAt: string }>;
    failures: { rule: string; from: number; to: number }[];
  };
};

/**
 * D2c (living-ledger-spec §3.4): a C-class feature's `label` states
 * `current(r)`, never `peak` — but its rendered terrace height comes from
 * the recorded `peak`, so a real drop (a correction, a re-measurement)
 * never shrinks the world, only the label's number.
 *
 * The house example: doori's `modules` dropping 36 -> 20 keeps the terrace
 * at the 36-derived height and the label reads "20 modules (36 at peak,
 * 2026-09)".
 */
describe("highWater: D2c C-class rules never inflate a shown number, never shrink a rendered height", () => {
  it("district-bench: doori modules 36 -> 20 keeps the terrace at 36's height, label reads 20", () => {
    const rule = GRAMMAR.find((r) => r.id === "district-bench")!;
    const ledgerAt36 = buildFixtureLedger();
    const rowsAt36 = rule.source(ledgerAt36) as { slug: string; modules: number | null }[];
    const dooriAt36 = rowsAt36.find((r) => r.slug === "doori")!;
    expect(rule.current!(dooriAt36)).toBe(36);
    const heightAt36 = rule.featureOf(dooriAt36, rowsAt36).scalar!;

    const previous = computeGrowth(GRAMMAR, ledgerAt36, { counts: {}, peaks: {} }, []).peaks;

    const ledgerAt20 = structuredClone(ledgerAt36);
    (ledgerAt20 as unknown as { projectStats: { doori: { modules: number } } }).projectStats.doori.modules = 20;
    const rowsAt20 = rule.source(ledgerAt20) as { slug: string; modules: number | null }[];
    const dooriAt20 = rowsAt20.find((r) => r.slug === "doori")!;
    expect(rule.current!(dooriAt20)).toBe(20);
    const heightAt20 = rule.featureOf(dooriAt20, rowsAt20).scalar!;

    // The label-level number (what a renderer would print via `current`)
    // reads the new, lower value...
    expect(heightAt20).toBeLessThan(heightAt36); // this rule's OWN scalar tracks `current`, not the peak —
    // the peak/terrace is a SEPARATE quantity the generator tracks
    // (growthCounts.json's `peaks` section), which is what actually never
    // shrinks:
    const { peaks: peaksAt20 } = computeGrowth(GRAMMAR, ledgerAt20, { counts: {}, peaks: previous }, []);
    const key = `district-bench:doori`;
    expect(peaksAt20[key].peak).toBe(36); // held at the high-water mark
    expect(peaksAt20[key].current).toBe(20); // the honest, current number
  });

  it("a peak key's `current` never exceeds its own `peak`", () => {
    const ledger = buildFixtureLedger();
    const { peaks } = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []);
    for (const [key, v] of Object.entries(peaks) as [string, { current: number; peak: number }][]) {
      expect(v.current, key).toBeLessThanOrEqual(v.peak);
    }
  });

  it("break-it (G15): re-running with a lower current never lowers the stored peak", () => {
    const ledger = buildFixtureLedger();
    const first = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []);
    const key = Object.keys(first.peaks)[0];
    const inflated = { counts: {}, peaks: { [key]: { current: 500, peak: 500, peakAt: "2020-01-01" } } };
    const second = computeGrowth(GRAMMAR, ledger, inflated, []);
    expect(second.peaks[key].peak).toBeGreaterThanOrEqual(500);
  });
});
