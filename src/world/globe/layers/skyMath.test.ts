import { describe, it, expect } from "vitest";
import { gmstDeg, substellarLatLon, bvToRgb, magToPointSize, physicalPointSize } from "./skyMath.ts";

describe("gmstDeg", () => {
  // Both values are independently published, not derived from this
  // codebase: J2000.0's GMST is that epoch's own defining constant, and the
  // second is Meeus's own fully worked example (Astronomical Algorithms,
  // Example 12.a: 1987 April 10, 0h UT -> 197deg.693195) - two different
  // sources catching a two-term-swap or off-by-a-century mistake the first
  // alone (T=0, so most of the polynomial never runs) could not.
  it("matches the J2000.0 defining constant", () => {
    expect(gmstDeg(new Date("2000-01-01T12:00:00Z"))).toBeCloseTo(280.46061837, 5);
  });

  it("matches Meeus's worked example (1987-04-10 0h UT)", () => {
    expect(gmstDeg(new Date("1987-04-10T00:00:00Z"))).toBeCloseTo(197.693195, 3);
  });
});

describe("substellarLatLon", () => {
  it("puts an object at lon 0 exactly when GMST equals its RA in degrees", () => {
    const d = new Date("2026-09-27T00:00:00Z");
    const gmst = gmstDeg(d);
    const { lat, lon } = substellarLatLon(gmst / 15, 12.3, d);
    expect(lat).toBe(12.3);
    expect(Math.abs(lon)).toBeLessThan(1e-6);
  });

  it("sweeps west (decreasing lon) as time advances, same direction as the Sun's subsolar point", () => {
    const raHours = 6;
    const d0 = new Date("2026-09-27T00:00:00Z");
    const d1 = new Date(d0.getTime() + 3_600_000);
    const lon0 = substellarLatLon(raHours, 0, d0).lon;
    const lon1 = substellarLatLon(raHours, 0, d1).lon;
    // GMST gains ~15.04 deg/hour (slightly more than the Sun's 15
    // deg/hour, the sidereal-vs-solar-day difference), so lon should have
    // dropped by about that much over the hour.
    expect(lon0 - lon1).toBeCloseTo(15.04, 0);
  });

  it("wraps cleanly across the +-180 seam", () => {
    // RA*15 - GMST landing just past +180 must come back as just past -180,
    // not silently clamp or produce NaN.
    const { lon } = substellarLatLon(0, 0, new Date("2000-01-01T00:00:00Z"));
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
    expect(Number.isFinite(lon)).toBe(true);
  });
});

describe("bvToRgb", () => {
  it("reads cooler/bluer for a negative index than a high (red) one", () => {
    const [rBlue, , bBlue] = bvToRgb(-0.3);
    const [rRed, , bRed] = bvToRgb(1.8);
    expect(bBlue).toBeGreaterThan(rBlue);
    expect(rRed).toBeGreaterThan(bRed);
  });

  it("clamps outside the catalogue's real B-V range instead of extrapolating", () => {
    expect(bvToRgb(-5)).toEqual(bvToRgb(-0.4));
    expect(bvToRgb(9)).toEqual(bvToRgb(2.0));
  });
});

describe("magToPointSize", () => {
  it("is monotonically decreasing in magnitude and stays inside its clamp", () => {
    expect(magToPointSize(-1.44)).toBeGreaterThan(magToPointSize(4.5));
    expect(magToPointSize(-10)).toBeLessThanOrEqual(4.2);
    expect(magToPointSize(20)).toBeGreaterThanOrEqual(1.1);
  });
});

describe("physicalPointSize", () => {
  it("scales linearly with pixel ratio, so DPR 2 covers the same CSS footprint as DPR 1", () => {
    const mag = 2.1;
    expect(physicalPointSize(mag, 1)).toBeCloseTo(magToPointSize(mag), 10);
    expect(physicalPointSize(mag, 2)).toBeCloseTo(magToPointSize(mag) * 2, 10);
  });

  it("at DPR 1 is a no-op over the plain CSS-space size", () => {
    expect(physicalPointSize(0, 1)).toBe(magToPointSize(0));
  });
});
