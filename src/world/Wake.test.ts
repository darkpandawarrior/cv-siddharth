import { describe, expect, it } from "vitest";
import { buildStripIndices } from "./Wake.tsx";

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
