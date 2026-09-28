import { describe, it, expect } from "vitest";
import { apparentMagnitude, formatDecDeg, formatRaHours, julianCenturiesJ2000, magToSphereRadius, planetGeometry, PLANET_IDS } from "./skyPlanetsMath.ts";

// Oracle: JPL Horizons (ssd.jpl.nasa.gov/api/horizons.api), geocentric
// astrometric RA/Dec (QUANTITIES=1, CENTER=500@399 i.e. Earth body centre),
// read live on 2026-09-28 against
// COMMAND='199'|'299'|'499'|'599'|'699' (Mercury/Venus/Mars/Jupiter/Saturn),
// EPHEM_TYPE=OBSERVER, START_TIME=2026-09-28, STOP_TIME=2026-09-29,
// STEP_SIZE=1d. Recorded here as plain numbers, not re-fetched at test time
// — the same "recorded test oracle" discipline moon.test.ts's own USNO
// comment describes.
const CLOCK = new Date("2026-09-28T00:00:00Z");

function dms(sign: 1 | -1, d: number, m: number, s: number): number {
  return sign * (d + m / 60 + s / 3600);
}
function hms(h: number, m: number, s: number): number {
  return (h + m / 60 + s / 3600) * 15;
}

const HORIZONS_ASTROMETRIC: Record<string, { raDeg: number; decDeg: number }> = {
  mercury: { raDeg: hms(13, 35, 19.01), decDeg: dms(-1, 11, 25, 2.3) },
  venus: { raDeg: hms(14, 11, 34.46), decDeg: dms(-1, 20, 26, 1.2) },
  mars: { raDeg: hms(8, 7, 44.61), decDeg: dms(1, 21, 11, 0.8) },
  jupiter: { raDeg: hms(9, 25, 10.92), decDeg: dms(1, 15, 47, 11.0) },
  saturn: { raDeg: hms(0, 46, 16.83), decDeg: dms(1, 2, 1, 34.0) },
};

/** Smallest angular gap between two RA values in degrees, wrapping 0/360 —
 *  the same "don't fail near the 0h seam" concern any RA comparison needs. */
function raGapDeg(a: number, b: number): number {
  return Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
}

describe("planetGeometry (Standish Table 1 elements)", () => {
  it.each(PLANET_IDS)("matches JPL Horizons within 0.5 degree for %s (2026-09-28, geocentric astrometric)", (planet) => {
    const g = planetGeometry(planet, CLOCK);
    const oracle = HORIZONS_ASTROMETRIC[planet];
    const raDeg = g.raHours * 15;
    expect(raGapDeg(raDeg, oracle.raDeg), `${planet} RA`).toBeLessThan(0.5);
    expect(Math.abs(g.decDeg - oracle.decDeg), `${planet} Dec`).toBeLessThan(0.5);
  });

  it("break-it: a stale/garbage clock still returns finite numbers, never NaN (Kepler solver always converges for these eccentricities)", () => {
    const g = planetGeometry("mars", new Date("1850-01-01T00:00:00Z"));
    expect(Number.isFinite(g.raHours)).toBe(true);
    expect(Number.isFinite(g.decDeg)).toBe(true);
  });

  it("distances are sane (inner planets stay within a couple au of Earth, Jupiter/Saturn much farther)", () => {
    const mercury = planetGeometry("mercury", CLOCK);
    const saturn = planetGeometry("saturn", CLOCK);
    expect(mercury.distanceAu).toBeGreaterThan(0.3);
    expect(mercury.distanceAu).toBeLessThan(1.5);
    expect(saturn.distanceAu).toBeGreaterThan(8);
  });
});

describe("julianCenturiesJ2000", () => {
  it("is exactly 0 at the J2000.0 epoch (2000-01-01T12:00:00Z)", () => {
    expect(julianCenturiesJ2000(new Date("2000-01-01T12:00:00Z"))).toBeCloseTo(0, 9);
  });
});

describe("apparentMagnitude", () => {
  it("brightens (lower mag) as phase angle drops toward 0 (fuller illumination), same direction every planet's coefficient goes", () => {
    const dim = apparentMagnitude("mars", 1.5, 2.4, 40);
    const bright = apparentMagnitude("mars", 1.5, 2.4, 2);
    expect(bright).toBeLessThan(dim);
  });

  it("Venus at real 2026-09-28 geometry reads as the brilliant object it actually is (mag well under 0)", () => {
    const g = planetGeometry("venus", CLOCK);
    const mag = apparentMagnitude("venus", g.helioDistanceAu, g.distanceAu, g.phaseAngleDeg);
    expect(mag).toBeLessThan(-3);
  });
});

describe("formatRaHours / formatDecDeg", () => {
  it("formats a known RA/Dec pair as hours/minutes and signed degrees", () => {
    expect(formatRaHours(8.129)).toBe("08h 08m");
    expect(formatDecDeg(21.184)).toBe("+21.2°");
    expect(formatDecDeg(-11.417)).toBe("-11.4°");
  });
});

describe("magToSphereRadius", () => {
  it("a brighter (lower) magnitude never draws a smaller sphere than a dimmer one", () => {
    expect(magToSphereRadius(-4.5)).toBeGreaterThan(magToSphereRadius(1.5));
  });

  it("break-it: an absurdly dim magnitude still clamps to a visible minimum, never 0 or negative", () => {
    expect(magToSphereRadius(99)).toBe(0.4);
  });
});
