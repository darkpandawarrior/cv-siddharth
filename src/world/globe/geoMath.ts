// GLOBE's sphere math (living-ledger-spec.md#6.3): the Fibonacci-lattice dot
// seed, lat/lon <-> unit-sphere conversion, and day/night from the real
// subsolar point. Pure: no three, no R3F, no React, no DOM -- the render
// layer (a later lane) wraps these in InstancedMesh transforms. No orbit.ts
// here and no satellite math: that mechanism was dropped (M10) and lives in
// src/lib/satellites.ts instead.
import { subsolarPoint } from "../../lib/sky.ts";

const RAD = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SpherePoint {
  x: number;
  y: number;
  z: number;
}

/** Unit-sphere xyz for a lat/lon in degrees: +X toward (0, 0), +Y toward the
 *  north pole, +Z toward (0, 90) -- the standard geographic-to-Cartesian
 *  convention, radius 1 (callers scale for a render-space globe). */
export function latLonToXyz(latDeg: number, lonDeg: number): SpherePoint {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  const cosLat = Math.cos(lat);
  return {
    x: cosLat * Math.cos(lon),
    y: Math.sin(lat),
    z: cosLat * Math.sin(lon),
  };
}

/** Inverse of latLonToXyz. Works for any nonzero vector, not only points
 *  already on the unit sphere -- callers pass a raw direction and get back
 *  the lat/lon it points at. */
export function xyzToLatLon(p: SpherePoint): LatLon {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r === 0) return { lat: 0, lon: 0 };
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, p.y / r))) / RAD,
    lon: Math.atan2(p.z, p.x) / RAD,
  };
}

// The golden angle: consecutive lattice points advance by this much
// longitude, which is what keeps a Fibonacci lattice from ever lining up
// into visible meridian bands the way a plain lat/lon grid does.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Evenly distributes `count` points over a sphere via the Fibonacci
 *  lattice -- GLOBE's Earth dot matrix seed (living-ledger-spec.md#6.3).
 *  Deterministic: the same count always produces the same points in the
 *  same order, so a caller can rebuild the lattice on every render without
 *  re-fetching or re-randomizing anything. */
export function fibonacciLattice(count: number): LatLon[] {
  if (count <= 0) return [];
  const points: LatLon[] = new Array(count);
  const denom = Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / denom) * 2; // walks from 1 (north pole) to -1 (south pole)
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = GOLDEN_ANGLE * i;
    points[i] = xyzToLatLon({ x: Math.cos(theta) * radiusAtY, y, z: Math.sin(theta) * radiusAtY });
  }
  return points;
}

/** True when (latDeg, lonDeg) sits on the lit hemisphere for a subsolar
 *  point at (subLat, subLon) -- angular separation under 90 deg, i.e. a
 *  positive dot product of the two unit position vectors. */
export function isDaySide(latDeg: number, lonDeg: number, subLat: number, subLon: number): boolean {
  const a = latLonToXyz(latDeg, lonDeg);
  const b = latLonToXyz(subLat, subLon);
  return a.x * b.x + a.y * b.y + a.z * b.z > 0;
}

/** Is (latDeg, lonDeg) lit at real instant `d`, from sky.ts's real subsolar
 *  point (no orbit.ts, no satellites -- M10). This is the one function the
 *  render layer actually needs on a clock tick. */
export function isDayAt(d: Date, latDeg: number, lonDeg: number): boolean {
  const sub = subsolarPoint(d);
  return isDaySide(latDeg, lonDeg, sub.lat, sub.lon);
}
