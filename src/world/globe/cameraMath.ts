// LANE L5 (navigation): pure camera math for CameraDirector.tsx. No three,
// no R3F, no React, no DOM -- same discipline as geoMath.ts, so every branch
// here is directly unit-testable (the "slerp path never dips below the
// surface radius" / "ground-view orientation" / "easing" tests this lane's
// brief asks for).
//
// Deliberately does NOT import geoMath.ts, even though latLonToXyz below is
// the same math: geoMath.ts's only other consumers (GlobeScene.tsx,
// EarthDots.tsx) are eagerly bundled into the "Globe" shell chunk, so an
// import here would be the one thing that also pulls it into
// CameraDirector.tsx's dynamic chunk -- and Rollup responds to a module
// gaining a second, differently-chunked consumer by promoting it to its own
// shared chunk, which then has to be *imported* (not inlined) from the
// eager side too. Measured: that promotion alone grew the "Globe" chunk
// check-budget.mjs gates past its ceiling with zero code of mine actually in
// it. `cameraMath.test.ts` cross-checks this copy against geoMath.ts's own,
// so the two can never silently drift.
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const RAD = Math.PI / 180;

/** Render-space earth radius, matching geoMath.ts's own GLOBE_RADIUS
 *  (world units; 1 unit = 1,061.8 km). Duplicated as a literal for the
 *  chunk-isolation reason above -- it is a fixed constant, never a second
 *  source of truth to keep in sync. */
export const GLOBE_RADIUS = 6;

/** Same math as geoMath.ts's latLonToXyz (right-handed, +X toward (0,0),
 *  +Y north, radius 1). See the file-level comment for why this is a
 *  separate copy rather than an import. */
export function latLonToXyz(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  const cosLat = Math.cos(lat);
  return { x: cosLat * Math.cos(lon), y: Math.sin(lat), z: -cosLat * Math.sin(lon) };
}

/** Same math as geoMath.ts's xyzToLatLon (inverse of the above, any nonzero
 *  vector). See the file-level comment for why this is a separate copy. */
export function xyzToLatLon(p: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r === 0) return { lat: 0, lon: 0 };
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, p.y / r))) / RAD,
    lon: Math.atan2(-p.z, p.x) / RAD,
  };
}

export function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function vScale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
export function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function vCross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
export function vLen(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
/** Zero-length input returns the input itself (never NaN) -- a caller with a
 *  degenerate vector gets a stable, if meaningless, result instead of a
 *  poisoned one propagating through the rest of a frame's math. */
export function vNorm(a: Vec3): Vec3 {
  const l = vLen(a);
  return l < 1e-9 ? a : vScale(a, 1 / l);
}

/** Fast at the ends, slow in the middle -- symmetric, 0 at t=0, 1 at t=1.
 *  Every flight in this file eases through this one curve so a click-to-fly,
 *  a tour stop and a view switch all feel like the same camera. */
export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

/** Spherical-linear interpolation between two unit directions. Falls back to
 *  a fixed perpendicular axis for the (unreachable in practice, for two
 *  points on a globe's surface) antipodal case, where slerp's axis is
 *  undefined -- keeps the function total rather than producing NaN. */
export function slerpUnit(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, vDot(a, b)));
  const theta = Math.acos(dot);
  if (theta < 1e-6) return a;
  if (Math.PI - theta < 1e-6) {
    const axis = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    return t < 0.5 ? a : vNorm(vCross(a, axis));
  }
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return vNorm(vAdd(vScale(a, wa), vScale(b, wb)));
}

/**
 * One point along a camera flight from (fromDir, fromDist) to (toDir,
 * toDist) at progress `t` (already eased -- this function does not
 * re-curve `t`, so an instant reduced-motion jump can pass t=1 directly).
 * Distance is floored at `minDist`: the guard that keeps a flight from ever
 * dipping the camera below the surface, regardless of the two endpoints.
 */
export function flyPosition(fromDir: Vec3, fromDist: number, toDir: Vec3, toDist: number, t: number, minDist: number): Vec3 {
  const dir = slerpUnit(vNorm(fromDir), vNorm(toDir), t);
  const dist = Math.max(minDist, fromDist + (toDist - fromDist) * t);
  return vScale(dir, dist);
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

/** East/North/Up tangent basis at a lat/lon -- "up" is the outward surface
 *  normal (also the ground-view camera's stand-point direction). East falls
 *  back to a fixed axis at the poles, where north x up is undefined, same
 *  convention as any map projection's pole singularity. */
export function enuBasis(latDeg: number, lonDeg: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const p = latLonToXyz(latDeg, lonDeg);
  const up: Vec3 = { x: p.x, y: p.y, z: p.z };
  const eastRaw = vCross(WORLD_UP, up);
  const east = vLen(eastRaw) < 1e-6 ? { x: 1, y: 0, z: 0 } : vNorm(eastRaw);
  const north = vNorm(vCross(up, east));
  return { east, north, up };
}

/** The ground-view stand point: just above the surface at (lat, lon). */
export function groundPosition(latDeg: number, lonDeg: number, radius: number, eyeHeight: number): Vec3 {
  const { up } = enuBasis(latDeg, lonDeg);
  return vScale(up, radius + eyeHeight);
}

/** Ground-view look direction from yaw (radians, 0 = north, growing toward
 *  east) and pitch (radians). Pitch is clamped to [0, PI/2] HERE -- the one
 *  place "never look below the horizon, never flip past the zenith" is
 *  enforced, so every caller (pointer drag, keyboard, the tour) gets the
 *  clamp for free rather than reimplementing it. */
export function groundLookDirection(latDeg: number, lonDeg: number, yaw: number, pitch: number): Vec3 {
  const { east, north, up } = enuBasis(latDeg, lonDeg);
  const p = Math.max(0, Math.min(Math.PI / 2, pitch));
  const horizontal = vAdd(vScale(north, Math.cos(yaw)), vScale(east, Math.sin(yaw)));
  return vNorm(vAdd(vScale(horizontal, Math.cos(p)), vScale(up, Math.sin(p))));
}

/** One exponential smoothing step toward `target`: halves the remaining gap
 *  every `halfLifeSec` seconds, so the follow camera's responsiveness is
 *  independent of frame rate (a dropped frame just means one bigger dt). */
export function dampTowards(current: Vec3, target: Vec3, halfLifeSec: number, dt: number): Vec3 {
  const k = 1 - 0.5 ** (dt / Math.max(1e-6, halfLifeSec));
  return vAdd(current, vScale(vSub(target, current), k));
}
