import { describe, it, expect } from "vitest";
import { baselineTicks, deviationsFor, hitTest } from "./railGeometry";
import type { Facet } from "../data/facets";

const f = (id: string, authored: string): Facet => ({
  id, label: id, href: `/${id}`, authored, discovered: authored,
  paths: ["deep"], kind: "work",
});

describe("baselineTicks", () => {
  it("spaces ticks evenly down the height", () => {
    expect(baselineTicks(100, 25)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns a single tick when the rail is shorter than one spacing", () => {
    expect(baselineTicks(10, 25)).toEqual([0]);
  });

  it("refuses a non-positive spacing rather than looping forever", () => {
    expect(() => baselineTicks(100, 0)).toThrow();
  });

  it("stops at the last exact multiple when spacing does not divide height", () => {
    expect(baselineTicks(100, 30)).toEqual([0, 30, 60, 90]);
  });

  it("handles float spacing without silent rounding errors", () => {
    expect(baselineTicks(100, 0.1).length).toBe(1001);
  });

  it("returns a single tick for negative height", () => {
    expect(baselineTicks(-5, 25)).toEqual([0]);
  });
});

describe("deviationsFor", () => {
  it("places the oldest facet at the top pad and the newest at height minus pad", () => {
    const out = deviationsFor([f("new", "2026-01-01"), f("old", "2020-01-01")], 200, 20);
    expect(out[0]).toEqual({ id: "old", y: 20 });
    expect(out[1]).toEqual({ id: "new", y: 180 });
  });

  it("centres a lone facet", () => {
    expect(deviationsFor([f("only", "2020-01-01")], 200, 20)).toEqual([{ id: "only", y: 100 }]);
  });

  it("returns nothing for no facets", () => {
    expect(deviationsFor([], 200, 20)).toEqual([]);
  });
});

describe("hitTest", () => {
  const devs = [{ id: "a", y: 50 }, { id: "b", y: 150 }];

  it("returns the id within tolerance", () => {
    expect(hitTest(devs, 54, 8)).toBe("a");
  });

  it("returns null outside tolerance", () => {
    expect(hitTest(devs, 100, 8)).toBe(null);
  });

  it("returns the nearest when two are in range", () => {
    expect(hitTest([{ id: "a", y: 50 }, { id: "b", y: 56 }], 55, 8)).toBe("b");
  });

  it("returns the earlier entry when two are equidistant", () => {
    expect(hitTest([{ id: "first", y: 50 }, { id: "second", y: 60 }], 55, 8)).toBe("first");
  });
});
