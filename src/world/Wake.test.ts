import { describe, expect, it } from "vitest";
import { buildStripIndices, wakeAlpha } from "./Wake.tsx";

describe("buildStripIndices — the wake ribbon's fixed triangle strip", () => {
  it("emits 2 triangles per segment, and never indexes past the vertex count", () => {
    const n = 240;
    const idx = buildStripIndices(n);
    expect(idx.length).toBe((n - 1) * 6);
    const maxVertex = n * 2 - 1;
    for (const v of idx) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(maxVertex);
    }
  });

  it("winds each quad as two triangles sharing an edge", () => {
    const idx = buildStripIndices(4);
    // Segment 0: vertices 0,1 (older) to 2,3 (newer).
    expect(Array.from(idx.slice(0, 6))).toEqual([0, 2, 1, 1, 2, 3]);
  });
});

describe("wakeAlpha — reduced motion freezes the time decay into a static trail", () => {
  it("normal motion: exponential time decay, unchanged by distance", () => {
    expect(wakeAlpha(0, 0, false)).toBeCloseTo(1);
    expect(wakeAlpha(2.5, 999, false)).toBeCloseTo(Math.exp(-1)); // age == DECAY_S, distance irrelevant
  });

  it("reduced motion: a static 45m falloff by distance, unchanged by age/clock", () => {
    expect(wakeAlpha(0, 0, true)).toBe(1); // right at the car
    expect(wakeAlpha(999, 22.5, true)).toBeCloseTo(0.5); // halfway down the 45m trail, whatever the age
    expect(wakeAlpha(0, 45, true)).toBe(0); // exactly at the trail's end
    expect(wakeAlpha(0, 60, true)).toBe(0); // past it — clamped, never negative
  });
});
