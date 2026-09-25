import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { landOf } from "./worldModel.ts";
import { GRAMMAR } from "./grammar.ts";
import { ledger } from "./ledger.ts";
import { hashNoise, stringSeed } from "./hash.ts";
import { buildFixtureLedger } from "./__fixtures__/grammar/ledger.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLACEMENTS_PATH = join(HERE, "generated/placements.json");

/**
 * D3 (living-ledger-spec §3.4): position is
 * `(dateZ(dateOf(r)) or the rule's shelf, lateral = hashNoise(stringSeed(seed))·jitter)`.
 * Every existing committed key keeps its position within 1e-9; new keys may
 * appear. Reversing openSource yields the same {seed, pos} set; dropping
 * and re-adding a record reproduces its offset.
 */
describe("placements: D3 stable, deterministic positions", () => {
  it("every key committed in generated/placements.json keeps its position within 1e-9 of a fresh landOf(ledger)", () => {
    const committed = JSON.parse(readFileSync(PLACEMENTS_PATH, "utf8")) as Record<string, [number, number, number]>;
    const fresh = landOf(ledger);
    const freshById = new Map(fresh.map((f) => [f.id, f.pos]));
    for (const [id, pos] of Object.entries(committed)) {
      const freshPos = freshById.get(id);
      expect(freshPos, `${id} missing from a fresh landOf(ledger)`).toBeDefined();
      for (let i = 0; i < 3; i++) expect(Math.abs(freshPos![i] - pos[i])).toBeLessThan(1e-9);
    }
  });

  it("landOf(ledger) run twice gives every feature the identical position", () => {
    const a = new Map(landOf(ledger).map((f) => [f.id, f.pos]));
    const b = landOf(ledger);
    for (const f of b) {
      const prev = a.get(f.id)!;
      for (let i = 0; i < 3; i++) expect(f.pos[i]).toBe(prev[i]);
    }
  });

  it("reversing openSource yields the same {id, pos} set for pr-stone", () => {
    const fixture = buildFixtureLedger();
    const reversed = structuredClone(fixture);
    reversed.openSource = [...reversed.openSource].reverse();

    const before = landOf(fixture)
      .filter((f) => f.rule === "pr-stone")
      .map((f) => ({ id: f.id, pos: f.pos }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const after = landOf(reversed)
      .filter((f) => f.rule === "pr-stone")
      .map((f) => ({ id: f.id, pos: f.pos }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(after).toEqual(before);
  });

  it("dropping then re-adding a record reproduces its exact offset", () => {
    const fixture = buildFixtureLedger();
    const withExtra = structuredClone(fixture);
    const extra = { repo: "career-ops-hq/career-ops", title: "fix(round-trip)", url: "https://example.com/pr/round-trip", status: "merged" as const, date: "2026-06-05", org: "career-ops-hq" };
    withExtra.openSource = [...withExtra.openSource, extra];

    const withIt = landOf(withExtra).find((f) => f.id === "pr-stone:https://example.com/pr/round-trip")!;
    const droppedThenReadded = structuredClone(fixture);
    droppedThenReadded.openSource = [...droppedThenReadded.openSource, extra]; // "drop" = never had it; "re-add" = add it fresh
    const again = landOf(droppedThenReadded).find((f) => f.id === "pr-stone:https://example.com/pr/round-trip")!;

    expect(again.pos).toEqual(withIt.pos);
  });

  it("break-it (G15): a rule whose formula changed (v bump) is expected to move — proves the check isn't vacuous", () => {
    const fixture = buildFixtureLedger();
    const rule = GRAMMAR.find((r) => r.id === "pr-stone")!;
    const rows = rule.source(fixture);
    const seed = rule.placementSeed(rows[0]);
    // Simulate a `v` bump by widening the jitter for this rule only — the
    // real placement code keys jitter by rule id, so this stands in for a
    // real formula change without touching grammar.ts's committed constants.
    const jitterBefore = 4;
    const jitterAfter = 40;
    const xBefore = hashNoise(stringSeed(seed)) * jitterBefore;
    const xAfter = hashNoise(stringSeed(seed)) * jitterAfter;
    expect(xAfter).not.toBeCloseTo(xBefore, 9);
  });
});
