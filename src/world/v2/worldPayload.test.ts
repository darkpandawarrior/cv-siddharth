import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * master-plan.md#M43 / world-v2-spec.md §9: heavy/world/payload.json
 * (gen-world-payload.mjs) stays under its two byte budgets — tier A
 * (first view, before the first frame) and the grand total across every
 * tier. Sibling of src/world/globe/globePayload.test.ts, a different
 * route with a different heavy manifest (that file's own doc comment).
 */
export const WORLD_TIER_A_MAX = 6_291_456; // 6 MiB
export const WORLD_TOTAL_MAX = 26_214_400; // 25 MiB

interface PayloadRow {
  path: string;
  bytes: number;
  tier: string;
}
interface Payload {
  totalBytes: number;
  byTier: Record<string, number>;
  files: PayloadRow[];
}

/** Pure, so the break-it test below can feed it an in-memory fixture
 *  instead of ever needing an oversized fixture directory on disk. */
export function overTierABudget(byTier: Readonly<Record<string, number>>, max = WORLD_TIER_A_MAX): boolean {
  return (byTier.A ?? 0) > max;
}
export function overTotalBudget(totalBytes: number, max = WORLD_TOTAL_MAX): boolean {
  return totalBytes > max;
}

const PAYLOAD_PATH = fileURLToPath(new URL("../../../heavy/world/payload.json", import.meta.url));

describe("heavy/world/payload.json stays under its tier-A and total budgets", () => {
  it.skipIf(!existsSync(PAYLOAD_PATH))("tier A is under 6,291,456 B and total is under 26,214,400 B", () => {
    const payload: Payload = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
    expect(
      overTierABudget(payload.byTier),
      `tier A is ${(payload.byTier.A ?? 0).toLocaleString("en-US")} B`,
    ).toBe(false);
    expect(overTotalBudget(payload.totalBytes), `total is ${payload.totalBytes.toLocaleString("en-US")} B`).toBe(false);
  });

  it.skipIf(!existsSync(PAYLOAD_PATH))("totalBytes really is the sum of every non-meta row (no drift between the two)", () => {
    const payload: Payload = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
    const summed = payload.files.filter((f) => f.tier !== "meta").reduce((n, f) => n + f.bytes, 0);
    expect(payload.totalBytes).toBe(summed);
  });

  // Break-it (G15): the same functions this test uses, fed fixtures that
  // must fail, proving the ceilings actually reject an oversized payload
  // rather than only ever seeing the real (small) ledger pass.
  it("overTierABudget/overTotalBudget reject a fixture over each ceiling", () => {
    expect(overTierABudget({ A: WORLD_TIER_A_MAX })).toBe(false);
    expect(overTierABudget({ A: WORLD_TIER_A_MAX + 1 })).toBe(true);
    expect(overTotalBudget(WORLD_TOTAL_MAX)).toBe(false);
    expect(overTotalBudget(WORLD_TOTAL_MAX + 1)).toBe(true);
  });
});
