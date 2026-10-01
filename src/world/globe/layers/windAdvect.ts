// LANE W5 (global wind): pure particle-advection math, no three, no React,
// no fetch — WindLayer.tsx's per-frame loop calls these against its own
// pre-allocated Float32Arrays; nothing here allocates.

const DEG2RAD = Math.PI / 180;

/** m/s wind is invisible at true scale against a 10-degree grid (a strong
 *  20 m/s jet would cross one cell in ~55s); this scales it into a speed
 *  that reads as flow within a few seconds, the same "stylised, stated"
 *  exaggeration ALT_EXAGGERATION uses in LocalTraffic.tsx, just for a rate
 *  rather than a length. Tunable, not a physical constant.
 *  ponytail: a single global scale, not per-latitude or per-projection
 *  correct; upgrade path is a proper equirectangular-to-globe Jacobian if a
 *  future pass needs true-speed-relative motion. */
export const VISUAL_SPEED_SCALE = 0.06;

/** Below this latitude cosine, the equirectangular dLon/cos(lat) advection
 *  step would blow up — clamps the step near the poles instead of letting a
 *  particle rocket across the whole grid in one frame. */
const MIN_COS_LAT = 0.08;

export interface AdvectResult {
  lat: number;
  lon: number;
}

/** One explicit-Euler step of a particle at (lat, lon) through wind (u, v)
 *  m/s (eastward, northward, blowing-TOWARD convention — windField.ts's
 *  `sampleWind`), for `dtSec` seconds. Longitude wraps into [-180, 180);
 *  latitude clamps at the poles (there is no antimeridian-style wrap for a
 *  pole — the particle simply cannot walk past it, and respawn (below)
 *  redistributes it eventually rather than this function inventing a
 *  crossing). */
export function advectStep(lat: number, lon: number, u: number, v: number, dtSec: number, speedScale: number = VISUAL_SPEED_SCALE): AdvectResult {
  const cosLat = Math.max(Math.cos(lat * DEG2RAD), MIN_COS_LAT);
  const dLat = v * speedScale * dtSec;
  const dLon = (u * speedScale * dtSec) / cosLat;
  const newLat = Math.max(-90, Math.min(90, lat + dLat));
  const newLon = (((lon + dLon + 180) % 360) + 360) % 360 - 180;
  return { lat: newLat, lon: newLon };
}

/** An unbiased random point on the sphere from two uniform [0,1) inputs — a
 *  plain lat = rand*180-90 would crowd points near the poles (equal-area
 *  distortion), which is exactly the artifact a "stays even" respawn must
 *  avoid. Pure and deterministic given its inputs, so it's testable without
 *  a real RNG. */
export function randomSpherePoint(rand1: number, rand2: number): AdvectResult {
  const lat = Math.asin(Math.max(-1, Math.min(1, 2 * rand1 - 1))) / DEG2RAD;
  const lon = rand2 * 360 - 180;
  return { lat, lon };
}

/** True when a particle drawn with `rand` (uniform [0,1)) should respawn
 *  this frame — `rate` is the per-frame probability, so over many frames a
 *  fixed fraction of the field is always mid-respawn and the density stays
 *  even without ever clearing the whole field at once. */
export function shouldRespawn(rand: number, rate: number): boolean {
  return rand < rate;
}
