// scripts/gen-world-grammar.mjs
/**
 * Emits src/world/v2/generated/growthCounts.json and placements.json from
 * GRAMMAR + the committed Ledger (living-ledger-spec §3.4 D2/D2c/D5).
 *
 * BYTE-DETERMINISTIC (per check-generated.mjs's own rule): every value here
 * derives from committed inputs (src/data/* via ledger.ts) — generatedAt is
 * `ledger.generatedAt` itself, never `Date.now()`. Two runs over the same
 * committed data give byte-identical output (gen-world-grammar.test.mjs).
 *
 * D2: an I-class rule's count is never allowed to drop silently. A drop
 * exits 1 UNLESS src/world/v2/ledger-corrections.json carries a matching
 * `{rule, from, to}` entry (a real event: a curated PR entry was wrong, a
 * listing was double counted — never a routine data refresh).
 *
 * D2c: a C-class key's `peak` only ever grows (`max(previous peak,
 * current)`); `peakAt` is stamped from `ledger.generatedAt` the run a new
 * peak is set, and held unchanged afterwards — never `Date.now()`.
 *
 * Per the house generator contract (gen-history.mjs's own docstring): if an
 * upstream or sibling module the ledger needs isn't there yet, this exits 0
 * and leaves the committed files untouched rather than crashing the chain.
 *
 * NOT YET WIRED into scripts/generators.mjs / package.json's `gen:*` chain —
 * both are owned by other lanes (this lane's `owns` list is scoped to this
 * script and its own output files). Run directly:
 *   node scripts/gen-world-grammar.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN_DIR = join(root, "src/world/v2/generated");
const COUNTS_PATH = join(GEN_DIR, "growthCounts.json");
const PLACEMENTS_PATH = join(GEN_DIR, "placements.json");
const CORRECTIONS_PATH = join(root, "src/world/v2/ledger-corrections.json");

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Pure: GRAMMAR + ledger + the previously committed growthCounts.json +
 *  ledger-corrections.json -> this run's counts/peaks, and the list of any
 *  uncorrected drops. No I/O, no Date.now() — directly unit-testable
 *  (gen-world-grammar.test.mjs). */
export function computeGrowth(GRAMMAR, ledger, previous, corrections) {
  const counts = {};
  const peaks = {};
  const failures = [];

  for (const rule of GRAMMAR) {
    const rows = rule.source(ledger);
    if (rule.class === "I") {
      const count = rule.countOf(rows);
      const prevCount = previous.counts?.[rule.id];
      if (typeof prevCount === "number" && count < prevCount) {
        const match = corrections.find((c) => c.rule === rule.id && c.from === prevCount && c.to === count);
        if (match) {
          console.log(`[gen-world-grammar] ${rule.id} drop ${prevCount} -> ${count} covered by correction: ${match.reason}`);
        } else {
          failures.push({ rule: rule.id, from: prevCount, to: count });
        }
      }
      counts[rule.id] = count;
    } else {
      // C-class: one high-water entry per record key (placementSeed).
      for (const r of rows) {
        const key = `${rule.id}:${rule.placementSeed(r)}`;
        const current = rule.current ? rule.current(r) : 0;
        const prevPeak = previous.peaks?.[key];
        const peak = prevPeak ? Math.max(prevPeak.peak, current) : current;
        const peakAt = prevPeak && peak === prevPeak.peak ? prevPeak.peakAt : ledger.generatedAt;
        peaks[key] = { current, peak, peakAt };
      }
    }
  }

  return { counts, peaks, failures };
}

/** Pure: `landOf()`'s features -> the committed `{ [feature.id]: pos }`
 *  shape, in a fixed (sorted) key order so the JSON is byte-stable. */
export function buildPlacements(features) {
  const out = {};
  for (const f of [...features].sort((a, b) => a.id.localeCompare(b.id))) out[f.id] = f.pos;
  return out;
}

async function main() {
  let GRAMMAR;
  let landOf;
  let ledger;
  try {
    ({ GRAMMAR } = await import(new URL("../src/world/v2/grammar.ts", import.meta.url)));
    ({ landOf } = await import(new URL("../src/world/v2/worldModel.ts", import.meta.url)));
    ({ ledger } = await import(new URL("../src/world/v2/ledger.ts", import.meta.url)));
  } catch (err) {
    console.log(`[gen-world-grammar] a sibling module isn't available yet, skipping: ${err.message}`);
    process.exit(0);
  }

  const corrections = readJson(CORRECTIONS_PATH, []);
  const previous = readJson(COUNTS_PATH, { generatedAt: "", counts: {}, peaks: {} });

  const { counts, peaks, failures } = computeGrowth(GRAMMAR, ledger, previous, corrections);

  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`[gen-world-grammar] ${f.rule} dropped from ${f.from} to ${f.to} with no matching entry in ledger-corrections.json`);
    }
    console.error("[gen-world-grammar] refusing to write: an uncorrected count drop is a claim-audit failure, not a data refresh.");
    process.exit(1);
  }

  const countsOut = { generatedAt: ledger.generatedAt, counts, peaks };
  const placementsOut = buildPlacements(landOf(ledger));

  mkdirSync(GEN_DIR, { recursive: true });
  writeFileSync(COUNTS_PATH, `${JSON.stringify(countsOut, null, 2)}\n`);
  writeFileSync(PLACEMENTS_PATH, `${JSON.stringify(placementsOut, null, 2)}\n`);
  console.log(
    `[gen-world-grammar] wrote ${Object.keys(counts).length} I-class counts, ${Object.keys(peaks).length} C-class peaks, ${Object.keys(placementsOut).length} placements`,
  );
}

// Only run when invoked directly (`node scripts/gen-world-grammar.mjs`), not
// when gen-world-grammar.test.mjs imports the pure functions above.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
