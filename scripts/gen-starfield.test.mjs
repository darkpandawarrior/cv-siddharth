import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildStarField } from "./gen-starfield.mjs";

const FIXTURE_PATH = fileURLToPath(new URL("__fixtures__/hyg-20.csv", import.meta.url));

describe("buildStarField", () => {
  const csvText = readFileSync(FIXTURE_PATH, "utf-8");

  it("rebuilds from the 20-row fixture byte-identically across runs", () => {
    expect(buildStarField(csvText).equals(buildStarField(csvText))).toBe(true);
  });

  it("drops Sol (dist 0) and any row over the mag limit, keeps Sirius", () => {
    const buf = buildStarField(csvText);
    // 20 fixture rows: Sol (dist 0, excluded) + one mag-5.01 row (excluded) = 18 kept.
    expect((buf.length - 4) / 8).toBe(18);
    const count = buf.readUInt32LE(0);
    expect(count).toBe(18);
    let sawSirius = false;
    for (let i = 0; i < count; i++) {
      const o = 4 + i * 8;
      const mag = buf.readInt16LE(o + 4) / 100;
      expect(mag).toBeLessThanOrEqual(5.0);
      const ra = buf.readInt16LE(o) / 1000;
      const dec = buf.readInt16LE(o + 2) / 100;
      if (Math.abs(ra - 6.7525) < 0.01 && Math.abs(dec - -16.7161) < 0.1) sawSirius = true;
    }
    expect(sawSirius).toBe(true);
  });
});
