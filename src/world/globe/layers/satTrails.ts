// Pure geometry builders for LANE L3's station trail and ISS ground track:
// arrays of scene-space points, no three.js Vector3/BufferGeometry (the
// render layer turns these into a Float32Array once per update) so the
// arithmetic is unit-testable on its own.
import { latLonToXyz } from "../geoMath.ts";
import { ecefToScene, orbitalPeriodMin, propagateState, type TleObject } from "../../../lib/satelliteEcef.ts";

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

const TRAIL_MINUTES = 15;
const TRAIL_STEPS = 30; // 30 s apart over 15 minutes

/** `steps+1` scene points spanning the last `minutes` up to `date`, oldest
 *  first — `object`'s real recent track, not a rendered guess: every point
 *  is its own independent SGP4 propagation, so scrubbing time recomputes the
 *  whole trail instead of replaying a buffer recorded at a different instant.
 *  A point whose instant falls outside the element's freshness window is
 *  skipped, never interpolated. */
export function trailPoints(object: TleObject, date: Date, globeRadius: number, minutes = TRAIL_MINUTES, steps = TRAIL_STEPS): ScenePoint[] {
  const points: ScenePoint[] = [];
  const stepMs = (minutes * 60_000) / steps;
  for (let i = steps; i >= 0; i--) {
    const state = propagateState(object, new Date(date.getTime() - i * stepMs));
    if (state) points.push(ecefToScene(state.ecef, globeRadius));
  }
  return points;
}

const GROUND_TRACK_SAMPLES_PER_ORBIT = 180;

/** Sub-satellite ground-track points for +-1 orbit around `date`, ON the
 *  visual globe's own surface (geodetic lat/lon -> latLonToXyz, the same
 *  frame the dot-matrix/imagery earth renders in) rather than the
 *  satellite's own altitude — a ground track sits on the ground. The span
 *  comes from the element's own orbital period (orbitalPeriodMin), so it
 *  always covers exactly one full revolution either side of `date`. */
export function groundTrackPoints(
  object: TleObject,
  date: Date,
  globeRadius: number,
  samplesPerOrbit = GROUND_TRACK_SAMPLES_PER_ORBIT,
): ScenePoint[] {
  const periodMin = orbitalPeriodMin(object);
  const totalSamples = samplesPerOrbit * 2;
  const points: ScenePoint[] = [];
  for (let i = 0; i <= totalSamples; i++) {
    const minutesOffset = -periodMin + (i / totalSamples) * (2 * periodMin);
    const state = propagateState(object, new Date(date.getTime() + minutesOffset * 60_000));
    if (!state) continue;
    const p = latLonToXyz(state.latDeg, state.lonDeg);
    points.push({ x: p.x * globeRadius, y: p.y * globeRadius, z: p.z * globeRadius });
  }
  return points;
}
