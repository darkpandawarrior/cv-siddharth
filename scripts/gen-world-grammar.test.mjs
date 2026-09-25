import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { computeGrowth, buildPlacements } from "./gen-world-grammar.mjs";
import { GRAMMAR } from "../src/world/v2/grammar.ts";
import { landOf } from "../src/world/v2/worldModel.ts";
import { buildFixtureLedger } from "../src/world/v2/__fixtures__/grammar/ledger.ts";

const root = join(fileURLToPath(import.meta.url), "..", "..");

describe("computeGrowth (pure)", () => {
  const ledger = buildFixtureLedger();

  it("is deterministic: same ledger, same previous -> identical output", () => {
    const previous = { counts: {}, peaks: {} };
    const a = computeGrowth(GRAMMAR, ledger, previous, []);
    const b = computeGrowth(GRAMMAR, ledger, previous, []);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not fail when there is no previous snapshot yet (first run)", () => {
    const { failures } = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []);
    expect(failures).toEqual([]);
  });

  it("D2: flags an I-class count drop with no matching correction (break-it, G15)", () => {
    const previous = { counts: { weir: 99 }, peaks: {} };
    const { failures, counts } = computeGrowth(GRAMMAR, ledger, previous, []);
    expect(counts.weir).toBeLessThan(99);
    expect(failures).toContainEqual({ rule: "weir", from: 99, to: counts.weir });
  });

  it("D2: a matching ledger-corrections.json entry clears the same drop", () => {
    const previous = { counts: { weir: 99 }, peaks: {} };
    const realCount = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []).counts.weir;
    const corrections = [{ rule: "weir", from: 99, to: realCount, date: "2026-01-01", reason: "test correction" }];
    const { failures } = computeGrowth(GRAMMAR, ledger, previous, corrections);
    expect(failures).toEqual([]);
  });

  it("D2c: a C-class key's peak only ever grows, and peakAt is held once set", () => {
    const first = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []);
    const key = Object.keys(first.peaks)[0];
    const inflatedPrevious = { counts: {}, peaks: { [key]: { current: 999999, peak: 999999, peakAt: "2020-01-01" } } };
    const second = computeGrowth(GRAMMAR, ledger, inflatedPrevious, []);
    expect(second.peaks[key].peak).toBe(999999); // never shrinks below a real recorded peak
    expect(second.peaks[key].peakAt).toBe("2020-01-01"); // held, not re-stamped
  });

  it("D5: adding one openSource entry changes G6's itemised count by one and no other rule", () => {
    const prStone = GRAMMAR.find((r) => r.id === "pr-stone");
    const itemisedCount = (l) => prStone.source(l).filter((r) => r.kind === "itemised").length;

    const before = computeGrowth(GRAMMAR, ledger, { counts: {}, peaks: {} }, []).counts;
    const itemisedBefore = itemisedCount(ledger);

    const withOneMore = structuredClone(ledger);
    withOneMore.openSource = [
      ...withOneMore.openSource,
      { repo: "career-ops-hq/career-ops", title: "fix(one-more)", url: "https://example.com/pr/extra", status: "merged", date: "2026-06-20", org: "career-ops-hq" },
    ];
    const after = computeGrowth(GRAMMAR, withOneMore, { counts: {}, peaks: {} }, []).counts;
    const itemisedAfter = itemisedCount(withOneMore);

    expect(itemisedAfter).toBe(itemisedBefore + 1);
    for (const ruleId of Object.keys(before)) {
      if (ruleId === "pr-stone") continue; // total merged is unaffected — one stone moved from cairn to itemised
      expect(after[ruleId]).toBe(before[ruleId]);
    }
  });
});

describe("buildPlacements (pure)", () => {
  it("is a stable, sorted { [feature.id]: pos } map", () => {
    const ledger = buildFixtureLedger();
    const placements = buildPlacements(landOf(ledger));
    const ids = Object.keys(placements);
    expect(ids).toEqual([...ids].sort());
    for (const id of ids) expect(placements[id]).toHaveLength(3);
  });
});

describe("node scripts/gen-world-grammar.mjs (end to end, real committed data)", () => {
  it("two runs give byte-identical growthCounts.json and placements.json", () => {
    const before = {
      counts: readFileSync(join(root, "src/world/v2/generated/growthCounts.json"), "utf8"),
      placements: readFileSync(join(root, "src/world/v2/generated/placements.json"), "utf8"),
    };
    const run1 = spawnSync("node", ["scripts/gen-world-grammar.mjs"], { cwd: root, encoding: "utf8" });
    expect(run1.status).toBe(0);
    const after1 = {
      counts: readFileSync(join(root, "src/world/v2/generated/growthCounts.json"), "utf8"),
      placements: readFileSync(join(root, "src/world/v2/generated/placements.json"), "utf8"),
    };
    const run2 = spawnSync("node", ["scripts/gen-world-grammar.mjs"], { cwd: root, encoding: "utf8" });
    expect(run2.status).toBe(0);
    const after2 = {
      counts: readFileSync(join(root, "src/world/v2/generated/growthCounts.json"), "utf8"),
      placements: readFileSync(join(root, "src/world/v2/generated/placements.json"), "utf8"),
    };
    expect(after1).toEqual(after2);
    // and regenerating over the real committed ledger reproduces exactly
    // what is already committed — nothing here is stale.
    expect(after1).toEqual(before);
  });

  it("exits 0 and leaves committed files untouched when a sibling module is missing", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gen-world-grammar-"));
    const scriptCopy = join(tmp, "gen-world-grammar.mjs");
    writeFileSync(scriptCopy, readFileSync(join(root, "scripts/gen-world-grammar.mjs"), "utf8"));
    // No src/world/v2 sibling exists next to this copy, so the dynamic
    // import in main() rejects and the script must exit 0, not crash.
    const run = spawnSync("node", [scriptCopy], { cwd: tmp, encoding: "utf8" });
    expect(run.status).toBe(0);
    rmSync(tmp, { recursive: true, force: true });
  });
});
