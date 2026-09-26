import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { globeFacts, type GlobeRow } from "./globeRows.ts";

/**
 * living-ledger-spec.md#6.3: "globePlateFreshness.test.ts hashes the ledger
 * inputs it depicts (G15-G17), not live counts, so the plate never claims a
 * live number." `globeFacts` (globeRows.ts) already IS those inputs: the
 * install floor, the upstream PR/star claim and the employer-marker
 * resolution state, read straight from store.ts/profile.ts/globeGeo.ts, so
 * hashing it is hashing G15-G17 directly, not a second copy of them.
 *
 * scripts/capture-globe-plate.mjs writes the committed hash alongside the
 * plates it captures (heavy/globe/plates/manifest.json). This test recomputes
 * the hash from the CURRENT data and compares: if a G15-G17 input changed
 * since the plate was last captured, the plate is stale and this fails,
 * exactly the contract the spec names.
 */
export function hashGlobeFacts(facts: readonly GlobeRow[]): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

const ROOT = join(import.meta.dirname, "..", "..", "..");
const MANIFEST = join(ROOT, "heavy", "globe", "plates", "manifest.json");

describe("globe plate freshness (G15-G17 inputs, not live counts)", () => {
  it.skipIf(!existsSync(MANIFEST))("the committed plate's hash matches the current G15-G17 inputs", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { hash: string };
    expect(
      manifest.hash,
      "the reach-column inputs (install floor, upstream PRs/stars, employer markers) changed since " +
        "the plate was captured; run `node scripts/capture-globe-plate.mjs` to refresh it.",
    ).toBe(hashGlobeFacts(globeFacts));
  });

  // Break-it (G15): a fixture proving the hash actually changes, and so the
  // check above actually fails, when a G15-G17 input changes, rather than
  // only ever comparing a hash against itself.
  it("hashGlobeFacts changes when a G15-G17 input changes", () => {
    const before = hashGlobeFacts(globeFacts);
    const mutated: GlobeRow[] = [
      ...globeFacts,
      { id: "fixture-only", label: "a fixture row that must never really exist", file: "fixture.ts", source: "fixture" },
    ];
    expect(hashGlobeFacts(mutated)).not.toBe(before);
  });
});
