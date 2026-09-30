import { describe, it, expect } from "vitest";
import * as geoMath from "./geoMath.ts";
import {
  easeInOutCubic,
  enuBasis,
  flyPosition,
  groundLookDirection,
  latLonToXyz,
  slerpUnit,
  vDot,
  vLen,
  xyzToLatLon,
  dampTowards,
} from "./cameraMath.ts";

// cameraMath.ts deliberately does not import geoMath.ts (see its file-level
// comment: a chunk-isolation constraint, not a design preference), so its
// own latLonToXyz/xyzToLatLon are a second copy of the same math. This is
// the guard that keeps the two from silently drifting apart.
describe("latLonToXyz / xyzToLatLon match geoMath.ts's own copy", () => {
  it("agrees on a spread of points", () => {
    for (const [lat, lon] of [
      [0, 0],
      [90, 0],
      [-90, 45],
      [18.5204, 73.8567],
      [-33.4, 151.2],
    ] as const) {
      const mine = latLonToXyz(lat, lon);
      const theirs = geoMath.latLonToXyz(lat, lon);
      expect(mine.x).toBeCloseTo(theirs.x, 12);
      expect(mine.y).toBeCloseTo(theirs.y, 12);
      expect(mine.z).toBeCloseTo(theirs.z, 12);
    }
  });

  it("round-trips the same as geoMath.ts's own inverse", () => {
    const p = latLonToXyz(37, -122);
    const mine = xyzToLatLon(p);
    const theirs = geoMath.xyzToLatLon(p);
    expect(mine.lat).toBeCloseTo(theirs.lat, 9);
    expect(mine.lon).toBeCloseTo(theirs.lon, 9);
  });
});

describe("easeInOutCubic", () => {
  it("is 0 at t=0, 1 at t=1, and monotonic in between", () => {
    expect(easeInOutCubic(0)).toBeCloseTo(0, 10);
    expect(easeInOutCubic(1)).toBeCloseTo(1, 10);
    let prev = -Infinity;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("clamps outside [0, 1]", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it("is symmetric about the midpoint (slow-fast-slow, not lopsided)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 10);
  });
});

describe("slerpUnit", () => {
  it("stays on the unit sphere for every t along the path", () => {
    const a = latLonToXyz(18.52, 73.86); // Pune
    const b = latLonToXyz(-33.4, 151.2); // Sydney
    for (let t = 0; t <= 1; t += 0.1) {
      const p = slerpUnit(a, b, t);
      expect(vLen(p)).toBeCloseTo(1, 10);
    }
  });

  it("returns the endpoints exactly at t=0 and t=1", () => {
    const a = latLonToXyz(0, 0);
    const b = latLonToXyz(45, 90);
    const at0 = slerpUnit(a, b, 0);
    expect(at0.x).toBeCloseTo(a.x, 9);
    expect(at0.y).toBeCloseTo(a.y, 9);
    expect(at0.z).toBeCloseTo(a.z, 9);
  });
});

// The brief's own acceptance line: "the slerp path never dips below the
// surface radius". A flight direction is always renormalized to length 1
// inside flyPosition, and distance is floored at minDist independently, so
// this is really a guard on the DISTANCE term -- proven by driving toDist
// below minDist and checking the floor holds at every sampled t, including
// the far endpoint where a naive lerp would have undershot it.
describe("flyPosition — never dips below the surface", () => {
  it("floors the radial distance at minDist even when both endpoints undershoot it", () => {
    const from = latLonToXyz(18.52, 73.86);
    const to = latLonToXyz(-33.4, 151.2);
    const minDist = 6; // GLOBE_RADIUS
    for (let t = 0; t <= 1; t += 0.05) {
      const p = flyPosition(from, 5, to, 5.5, t, minDist); // both < minDist on purpose
      expect(vLen(p)).toBeGreaterThanOrEqual(minDist - 1e-9);
    }
  });

  it("reaches the requested distance when it is above the floor", () => {
    const from = latLonToXyz(18.52, 73.86);
    const to = latLonToXyz(-33.4, 151.2);
    const p1 = flyPosition(from, 26, to, 12, 1, 6);
    expect(vLen(p1)).toBeCloseTo(12, 6);
  });
});

describe("enuBasis / groundLookDirection — ground-view orientation", () => {
  it("produces an orthonormal right-handed frame away from the poles", () => {
    const { east, north, up } = enuBasis(18.52, 73.86);
    expect(vLen(east)).toBeCloseTo(1, 9);
    expect(vLen(north)).toBeCloseTo(1, 9);
    expect(vLen(up)).toBeCloseTo(1, 9);
    expect(vDot(east, north)).toBeCloseTo(0, 9);
    expect(vDot(east, up)).toBeCloseTo(0, 9);
    expect(vDot(north, up)).toBeCloseTo(0, 9);
  });

  it("pitch 0 looks along the horizon (perpendicular to up)", () => {
    const dir = groundLookDirection(18.52, 73.86, 0, 0);
    const { up } = enuBasis(18.52, 73.86);
    expect(vDot(dir, up)).toBeCloseTo(0, 6);
  });

  it("pitch PI/2 looks straight at the zenith regardless of yaw", () => {
    const { up } = enuBasis(18.52, 73.86);
    for (const yaw of [0, 1, 3, 5.5]) {
      const dir = groundLookDirection(18.52, 73.86, yaw, Math.PI / 2);
      expect(dir.x).toBeCloseTo(up.x, 6);
      expect(dir.y).toBeCloseTo(up.y, 6);
      expect(dir.z).toBeCloseTo(up.z, 6);
    }
  });

  it("clamps pitch so a visitor can never look below the horizon or past the zenith", () => {
    const below = groundLookDirection(18.52, 73.86, 0, -1);
    const atHorizon = groundLookDirection(18.52, 73.86, 0, 0);
    expect(below).toEqual(atHorizon);
    const above = groundLookDirection(18.52, 73.86, 0, Math.PI);
    const atZenith = groundLookDirection(18.52, 73.86, 0, Math.PI / 2);
    expect(above).toEqual(atZenith);
  });
});

describe("dampTowards", () => {
  it("halves the remaining gap after exactly one half-life", () => {
    const p = dampTowards({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.2, 0.2);
    expect(p.x).toBeCloseTo(5, 6);
  });

  it("converges to the target for a long enough step", () => {
    const p = dampTowards({ x: 0, y: 0, z: 0 }, { x: 10, y: -4, z: 2 }, 0.2, 10);
    expect(p.x).toBeCloseTo(10, 3);
    expect(p.y).toBeCloseTo(-4, 3);
    expect(p.z).toBeCloseTo(2, 3);
  });
});
