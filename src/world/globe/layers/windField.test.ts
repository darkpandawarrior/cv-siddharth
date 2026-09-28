import { describe, it, expect } from "vitest";
import { buildWindField, sampleWind, windSpeed, type WindGridSpec } from "./windField.ts";

// A 3x3 grid (lat -10/0/10, lon 70/80/90) with a distinct, known u at every
// cell — big enough to test interior bilinear interpolation, an edge
// (antimeridian-style wrap on a full-circle grid below) and a pole clamp.
const GRID3: WindGridSpec = { latStart: -10, latStep: 10, latCount: 3, lonStart: 70, lonStep: 10, lonCount: 3 };
// Row-major (lat outer, lon inner): row0 lat-10, row1 lat0, row2 lat10.
const U3 = [0, 10, 20, 0, 10, 20, 0, 10, 20];
const V3 = [0, 0, 0, 5, 5, 5, 10, 10, 10];

describe("sampleWind", () => {
  it("returns the exact grid value at an exact grid point", () => {
    const field = buildWindField(GRID3, U3, V3);
    const out = sampleWind(field, 0, 80);
    expect(out.u).toBeCloseTo(10, 6);
    expect(out.v).toBeCloseTo(5, 6);
  });

  it("bilinearly interpolates at the centre of four cells", () => {
    const field = buildWindField(GRID3, U3, V3);
    // Midpoint of lat -10..0 and lon 70..80: u averages (0,10,0,10) = 5, v averages (0,0,5,5) = 2.5.
    const out = sampleWind(field, -5, 75);
    expect(out.u).toBeCloseTo(5, 6);
    expect(out.v).toBeCloseTo(2.5, 6);
  });

  it("clamps latitude at the pole instead of wrapping or throwing", () => {
    const field = buildWindField(GRID3, U3, V3);
    const atEdge = sampleWind(field, 10, 80);
    const beyondPole = sampleWind(field, 55, 80); // no row up there; must clamp to the last row
    expect(beyondPole.u).toBeCloseTo(atEdge.u, 6);
    expect(beyondPole.v).toBeCloseTo(atEdge.v, 6);
  });

  it("wraps longitude across the antimeridian on a full-circle grid instead of leaving a seam", () => {
    // A full 360deg grid: 4 lon columns at 0/90/180/270, one lat row.
    const fullCircle: WindGridSpec = { latStart: 0, latStep: 10, latCount: 1, lonStart: 0, lonStep: 90, lonCount: 4 };
    const u = [0, 10, 20, 30]; // lon 0, 90, 180, 270
    const field = buildWindField(fullCircle, u, u.map(() => 0));
    // 315deg sits between column 270 (u=30) and the wrap-around column 0
    // (u=0, i.e. 360deg) -- halfway, so the interpolated value is their mean.
    const wrapped = sampleWind(field, 0, 315);
    expect(wrapped.u).toBeCloseTo(15, 6);
    // -45deg is the same physical point as 315deg (mod 360) and must sample identically.
    const negative = sampleWind(field, 0, -45);
    expect(negative.u).toBeCloseTo(wrapped.u, 6);
  });

  it("writes into the passed `out` object rather than allocating a new one", () => {
    const field = buildWindField(GRID3, U3, V3);
    const out = { u: -999, v: -999 };
    const returned = sampleWind(field, 0, 80, out);
    expect(returned).toBe(out);
    expect(out.u).toBeCloseTo(10, 6);
  });
});

describe("windSpeed", () => {
  it("is the vector magnitude", () => {
    expect(windSpeed(3, 4)).toBeCloseTo(5, 6);
    expect(windSpeed(0, 0)).toBe(0);
  });
});
