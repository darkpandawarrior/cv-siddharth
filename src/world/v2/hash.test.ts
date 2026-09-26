import { describe, expect, it } from "vitest";
import { hashNoise, stringSeed } from "./hash.ts";

describe("hashNoise", () => {
  it("is deterministic for a given seed", () => {
    expect(hashNoise(42)).toBe(hashNoise(42));
    expect(hashNoise(1.7)).toBe(hashNoise(1.7));
  });

  it("stays in [-1, 1)", () => {
    for (let seed = 0; seed < 200; seed += 3.7) {
      const v = hashNoise(seed);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it("matches the value every v1 call site had before extraction", () => {
    // Pinned from districtWest.ts / resolve.ts / gps.ts / corpusData.ts's
    // identical pre-extraction bodies — proves the extraction changed
    // nothing (districtWest.test.ts etc. cover it end to end; this pins the
    // primitive itself).
    const s = Math.sin(12.9898 * 12.9898) * 43758.5453;
    expect(hashNoise(12.9898)).toBe((s - Math.floor(s)) * 2 - 1);
  });
});

describe("stringSeed", () => {
  it("is deterministic for a given id", () => {
    expect(stringSeed("neev-doori")).toBe(stringSeed("neev-doori"));
  });

  it("differs for different ids (no accidental collision on these real slugs)", () => {
    expect(stringSeed("doori")).not.toBe(stringSeed("gaddi"));
  });

  it("is stable under the same charCodeAt(i) reduction the v1 duplicates used", () => {
    let expected = 0;
    const id = "portfolio-twin";
    for (let i = 0; i < id.length; i++) expected = (expected * 31 + id.charCodeAt(i)) % 100000;
    expect(stringSeed(id)).toBe(expected);
  });
});
