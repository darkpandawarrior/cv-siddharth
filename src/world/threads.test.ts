import { describe, expect, it } from "vitest";
import { facets } from "../data/facets.ts";
import { facetThreads, THREAD_MARKER_HEIGHT } from "./threads.ts";

describe("facet threads", () => {
  it("has exactly one entry per facet", () => {
    expect(facetThreads()).toHaveLength(facets.length);
    expect(facetThreads()).toHaveLength(8);
  });

  it("draws an arc for exactly the facets whose authored date differs from discovered", () => {
    // The test the design doc calls out explicitly: add a facet with a gap
    // to facets.ts and this count moves with NO edit to threads.ts.
    const arcCount = facetThreads().filter((t) => t.hasArc).length;
    expect(arcCount).toBe(facets.filter((f) => f.authored !== f.discovered).length);
    expect(arcCount).toBe(2);
    expect(facetThreads().filter((t) => t.hasArc).map((t) => t.id).sort()).toEqual(["board", "excelsior"]);
  });

  it("board's apex is the global max y — the bigger gap makes the tallest thing in the city", () => {
    const threads = facetThreads();
    const board = threads.find((t) => t.id === "board")!;
    const maxApex = Math.max(...threads.map((t) => t.apexY));
    expect(board.apexY).toBe(maxApex);
    expect(board.apexY).toBeGreaterThan(threads.find((t) => t.id === "excelsior")!.apexY);
  });

  it("the six flat facets get no gap, no arc, and the base marker height as their apex", () => {
    const flat = facetThreads().filter((t) => !t.hasArc);
    expect(flat).toHaveLength(6);
    for (const t of flat) {
      expect(t.gapYears).toBe(0);
      expect(t.authoredZ).toBe(t.discoveredZ);
      expect(t.apexY).toBe(THREAD_MARKER_HEIGHT);
    }
  });
});
