import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * living-ledger-spec.md#12: `heavy/globe` (earth-720x360.bin, the two static
 * plates) stays under 1 MB, its own budget line, separate from world-v2's
 * `worldPayload.test.ts` tier ceilings, since GLOBE is a different route with
 * a different heavy manifest.
 */
export const HEAVY_GLOBE_MAX = 1_048_576;

/** Pure so the break-it test below can feed it an in-memory fixture. */
export function overBudget(sizes: readonly number[], max = HEAVY_GLOBE_MAX): boolean {
  return sizes.reduce((n, s) => n + s, 0) > max;
}

describe("heavy/globe stays under its 1 MB payload budget", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const dir = join(root, "heavy", "globe");

  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = join(d, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });

  it.skipIf(!existsSync(dir))("heavy/globe total is under 1,048,576 bytes", () => {
    const files = walk(dir);
    const sizes = files.map((f) => statSync(f).size);
    const report = files.map((f, i) => `${f.slice(root.length)} (${sizes[i].toLocaleString("en-US")} B)`).join("\n  ");
    expect(overBudget(sizes), `heavy/globe is ${sizes.reduce((n, s) => n + s, 0).toLocaleString("en-US")} B:\n  ${report}`).toBe(false);
  });

  // Break-it (G15): the same function this test uses, fed a fixture that
  // must fail, proving the ceiling actually rejects an oversized payload
  // rather than only ever seeing the real (small) directory pass.
  it("overBudget fails a fixture whose total exceeds the ceiling", () => {
    expect(overBudget([HEAVY_GLOBE_MAX])).toBe(false);
    expect(overBudget([HEAVY_GLOBE_MAX, 1])).toBe(true);
  });
});
