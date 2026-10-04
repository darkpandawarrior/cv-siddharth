import { describe, expect, it } from "vitest";
import { hexbinPoints, densityHeight, densityColor, type HexPoint } from "./hexbin.ts";

describe("hexbinPoints", () => {
  it("returns nothing for no points or no cells", () => {
    expect(hexbinPoints([], 200)).toEqual([]);
    expect(hexbinPoints([{ lat: 0, lon: 0, kind: "quake" }], 0)).toEqual([]);
  });

  it("groups nearby points into the same bin and counts by kind", () => {
    const points: HexPoint[] = [
      { lat: 18.5, lon: 73.8, kind: "quake" },
      { lat: 18.51, lon: 73.81, kind: "quake" },
      { lat: 18.49, lon: 73.79, kind: "fire" },
    ];
    const bins = hexbinPoints(points, 300);
    expect(bins.length).toBe(1);
    expect(bins[0].quakeCount).toBe(2);
    expect(bins[0].fireCount).toBe(1);
    expect(bins[0].total).toBe(3);
  });

  it("keeps antipodal points in different bins", () => {
    const points: HexPoint[] = [
      { lat: 0, lon: 0, kind: "quake" },
      { lat: 0, lon: 180, kind: "quake" },
    ];
    const bins = hexbinPoints(points, 300);
    expect(bins.length).toBe(2);
    expect(bins.every((b) => b.total === 1)).toBe(true);
  });

  it("never emits an empty bin", () => {
    const bins = hexbinPoints([{ lat: 40, lon: -105, kind: "fire" }], 600);
    expect(bins.every((b) => b.total > 0)).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const points: HexPoint[] = Array.from({ length: 50 }, (_, i) => ({ lat: (i * 7) % 90, lon: (i * 13) % 180, kind: i % 3 === 0 ? "fire" : "quake" }) as HexPoint);
    const a = hexbinPoints(points, 200);
    const b = hexbinPoints(points, 200);
    expect(a).toEqual(b);
  });
});

describe("densityHeight", () => {
  it("is 0 for an empty bin or a zero max", () => {
    expect(densityHeight(0, 10)).toBe(0);
    expect(densityHeight(5, 0)).toBe(0);
  });
  it("is 1 at the max and compresses via sqrt below it", () => {
    expect(densityHeight(10, 10)).toBe(1);
    expect(densityHeight(4, 16)).toBeCloseTo(0.5, 5);
  });
});

describe("densityColor", () => {
  it("clamps and returns the low/high ramp stops at the ends", () => {
    expect(densityColor(-1)).toEqual(densityColor(0));
    expect(densityColor(2)).toEqual(densityColor(1));
  });
  it("returns valid 0..1 sRGB channels across the range", () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = densityColor(t);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
