// Pure ECEF/scene-space math for LANE L3 (real orbits, /globe): where
// satellite.js's own SGP4 propagation actually lands in GLOBE's render
// space, plus the derived per-instant facts (geodetic lat/lon/alt, speed,
// eclipse) the layer and its inspector rows need. No React, no three.js —
// SatelliteLayer.tsx owns the InstancedMesh/Html rendering this feeds.
//
// Colocated with satellites.ts on purpose, not merged into it: satellites.ts
// is observer-relative (look angles from the Sangam); this is absolute
// position. Both share satellites.ts's own satrec cache (toSatRec) and
// freshness/eclipse checks (isFresh/isSunlitAt) so a TLE line is parsed once
// regardless of which module a caller reaches it through.
//
// satellite.js's own bare import ("satellite.js") is safe here — proven by
// `npx vite build` against this checkout (vite.config.ts's rollupOptions.
// external already keeps satellite.js's WASM/pthreads subtree, the thing
// that broke Vite's IIFE worker output, out of the client bundle; no new
// alias or shim needed for this lane).
import { eciToEcf, eciToGeodetic, gstime, propagate } from "satellite.js";
import { isFresh, isSunlitAt, toSatRec, tleEpoch, type TleObject } from "./satellites.ts";

export type { TleObject };

/** Earth-Centered Earth-Fixed position, km — satellite.js's own convention:
 *  +X toward (0°N, 0°E), +Y toward (0°N, 90°E), +Z toward the north pole. */
export interface EcefKm {
  x: number;
  y: number;
  z: number;
}

export interface SatelliteState {
  ecef: EcefKm;
  /** km/s, ECI-frame velocity magnitude — close enough to ground speed for
   *  an inspector row (no separate "ground speed" claim is made anywhere). */
  speedKmS: number;
  latDeg: number;
  lonDeg: number;
  altKm: number;
  sunlit: boolean;
  /** Days between `date` and this element's own TLE epoch — the inspector's
   *  "how stale is this" row (isFresh already gates anything past 7). */
  epochAgeDays: number;
}

/** Full per-instant read for `object` at `date`. `null` when the element is
 *  stale (isFresh) or SGP4 can't produce a position (decayed/garbage TLE) —
 *  same "absent, not faked" contract every other live read in this world
 *  uses; the caller draws nothing for a `null`, never a stale/guessed value. */
export function propagateState(object: TleObject, date: Date): SatelliteState | null {
  if (!isFresh(object, date)) return null;
  const rec = toSatRec(object);
  const pv = propagate(rec, date);
  if (!pv || !pv.position || !pv.velocity || typeof pv.position === "boolean" || typeof pv.velocity === "boolean") return null;
  const gmst = gstime(date);
  const ecef = eciToEcf(pv.position, gmst);
  const geo = eciToGeodetic(pv.position, gmst);
  const sunlit = isSunlitAt(object, date) ?? false;
  const RAD_TO_DEG = 180 / Math.PI;
  return {
    ecef,
    speedKmS: Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z),
    latDeg: geo.latitude * RAD_TO_DEG,
    lonDeg: geo.longitude * RAD_TO_DEG,
    altKm: geo.height,
    sunlit,
    epochAgeDays: (date.getTime() - tleEpoch(object.l1).getTime()) / 86_400_000,
  };
}

/** ECEF (km) -> GLOBE's scene units: `(X, Z, -Y) * (globeRadius / 6371)` —
 *  geoMath.ts's own frame (+X toward 0,0; +Y toward the north pole; -Z
 *  toward 0,90E) expressed in satellite.js's ECEF axes (+X toward 0,0; +Y
 *  toward 0,90E; +Z toward the north pole). True scale: 1 globe unit is
 *  6,371/globeRadius km, the same ratio EarthDots.tsx's own lattice uses, so
 *  a satellite's render distance off the surface is its real altitude at
 *  that ratio (ISS at ~420 km sits ~0.40 units up at GLOBE_RADIUS=6). */
export function ecefToScene(ecef: EcefKm, globeRadius: number): EcefKm {
  const k = globeRadius / 6371;
  return { x: ecef.x * k, y: ecef.z * k, z: -ecef.y * k };
}

/** Orbital period in minutes, from the SGP4 element's own mean motion
 *  (`satrec.no`, radians/minute after SGP4's own Kozai correction) — never a
 *  hand-parsed TLE column, so it stays correct for the exact element SGP4 is
 *  actually propagating. */
export function orbitalPeriodMin(object: TleObject): number {
  const rec = toSatRec(object);
  return (2 * Math.PI) / Math.abs(rec.no || Number.EPSILON);
}
