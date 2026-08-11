import { describe, expect, it } from "vitest";
import { bandFor, clampPosition, clipFor, evenPositions, MIN_BAND, percentAt } from "./compareGeometry.ts";

describe("evenPositions", () => {
  it("splits the frame evenly", () => {
    expect(evenPositions(2)).toEqual([50]);
    expect(evenPositions(4)).toEqual([25, 50, 75]);
  });

  it("has no dividers below two layers", () => {
    expect(evenPositions(1)).toEqual([]);
    expect(evenPositions(0)).toEqual([]);
  });
});

describe("clampPosition", () => {
  it("moves the requested divider and leaves the others alone", () => {
    expect(clampPosition([25, 50, 75], 1, 60)).toEqual([25, 60, 75]);
  });

  // The whole reason this module exists: a divider dragged past its neighbour would reorder the
  // bands, and every label would then sit over the wrong version.
  it("stops against the neighbour instead of crossing it", () => {
    expect(clampPosition([25, 50, 75], 1, 90)).toEqual([25, 75 - MIN_BAND, 75]);
    expect(clampPosition([25, 50, 75], 1, -40)).toEqual([25, 25 + MIN_BAND, 75]);
  });

  it("stops against the frame edges for the outermost dividers", () => {
    expect(clampPosition([50], 0, 200)).toEqual([100 - MIN_BAND]);
    expect(clampPosition([50], 0, -200)).toEqual([MIN_BAND]);
  });

  it("ignores an out-of-range index rather than growing the array", () => {
    expect(clampPosition([50], 3, 10)).toEqual([50]);
    expect(clampPosition([50], -1, 10)).toEqual([50]);
  });
});

describe("bandFor", () => {
  it("covers the frame edge to edge with no gap between layers", () => {
    const pos = [30, 70];
    expect(bandFor(0, pos)).toEqual([0, 30]);
    expect(bandFor(1, pos)).toEqual([30, 70]);
    expect(bandFor(2, pos)).toEqual([70, 100]);
  });

  it("gives a single layer the whole frame", () => {
    expect(bandFor(0, [])).toEqual([0, 100]);
  });
});

describe("clipFor", () => {
  it("insets from both sides so only the layer's own band shows", () => {
    expect(clipFor(1, [30, 70])).toBe("inset(0 30% 0 30%)");
    expect(clipFor(0, [30, 70])).toBe("inset(0 70% 0 0%)");
  });
});

describe("percentAt", () => {
  it("maps a pointer position to percent along the frame", () => {
    expect(percentAt(150, { left: 100, width: 200 })).toBe(25);
    expect(percentAt(100, { left: 100, width: 200 })).toBe(0);
  });

  it("returns 0 for a zero-width frame rather than dividing by zero", () => {
    expect(percentAt(50, { left: 0, width: 0 })).toBe(0);
  });
});
