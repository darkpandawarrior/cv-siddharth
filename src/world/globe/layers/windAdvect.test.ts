import { describe, it, expect } from "vitest";
import { advectStep, randomSpherePoint, shouldRespawn } from "./windAdvect.ts";

describe("advectStep", () => {
  it("calm air (u=0, v=0) leaves the particle in place", () => {
    const r = advectStep(20, 100, 0, 0, 5);
    expect(r.lat).toBeCloseTo(20, 6);
    expect(r.lon).toBeCloseTo(100, 6);
  });

  it("positive v (northward) increases latitude; positive u (eastward) increases longitude", () => {
    const r = advectStep(0, 0, 10, 10, 10, 0.1);
    expect(r.lat).toBeGreaterThan(0);
    expect(r.lon).toBeGreaterThan(0);
  });

  it("wraps longitude across the antimeridian into [-180, 180)", () => {
    const r = advectStep(0, 179, 50, 0, 10, 0.1); // pushes well past 180
    expect(r.lon).toBeLessThan(0); // wrapped around to the negative side
    expect(r.lon).toBeGreaterThanOrEqual(-180);
  });

  it("clamps latitude at the pole instead of overshooting past 90", () => {
    const r = advectStep(89, 0, 0, 50, 100, 0.1); // huge northward push
    expect(r.lat).toBe(90);
  });
  it("clamps latitude at the south pole symmetrically", () => {
    const r = advectStep(-89, 0, 0, -50, 100, 0.1);
    expect(r.lat).toBe(-90);
  });

  it("near a pole, a large eastward wind does not blow the particle across the whole grid in one step (cos(lat) clamp)", () => {
    const r = advectStep(89.9, 0, 100, 0, 1, 1);
    // Without a clamp, dLon = u*scale*dt/cos(89.9deg) would be enormous
    // (cos(89.9deg) ~= 0.0017). The clamp floors the divisor at 0.08, so the
    // step stays bounded (well under one full trip around the globe).
    expect(Math.abs(r.lon)).toBeLessThan(1250); // dLon bound = 100*1*1/0.08 = 1250 deg pre-wrap
  });
});

describe("randomSpherePoint", () => {
  it("is deterministic given its inputs", () => {
    expect(randomSpherePoint(0.5, 0.5)).toEqual(randomSpherePoint(0.5, 0.5));
  });
  it("rand1=0.5 sits on the equator, rand2=0.5 sits on the prime meridian", () => {
    const p = randomSpherePoint(0.5, 0.5);
    expect(p.lat).toBeCloseTo(0, 6);
    expect(p.lon).toBeCloseTo(0, 6);
  });
  it("stays within valid lat/lon bounds across the input range", () => {
    for (const r1 of [0, 0.1, 0.25, 0.75, 0.999]) {
      for (const r2 of [0, 0.1, 0.5, 0.999]) {
        const p = randomSpherePoint(r1, r2);
        expect(p.lat).toBeGreaterThanOrEqual(-90);
        expect(p.lat).toBeLessThanOrEqual(90);
        expect(p.lon).toBeGreaterThanOrEqual(-180);
        expect(p.lon).toBeLessThan(180);
      }
    }
  });
});

describe("shouldRespawn", () => {
  it("respawns exactly the fraction below `rate`", () => {
    expect(shouldRespawn(0.01, 0.02)).toBe(true);
    expect(shouldRespawn(0.5, 0.02)).toBe(false);
  });
  it("rate 0 never respawns, rate 1 always does", () => {
    expect(shouldRespawn(0, 0)).toBe(false);
    expect(shouldRespawn(0.9999, 1)).toBe(true);
  });
});
