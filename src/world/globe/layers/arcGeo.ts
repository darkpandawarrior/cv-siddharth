// ArcLayer's pure great-circle math (living-ledger-spec.md#6.3, GLOBE lens
// L4): visitor-country arcs into Pune. No three, no R3F -- geoMath.ts's own
// discipline. `SpherePoint`/`GLOBE_RADIUS` come from there so this file's
// unit-sphere vectors and the render layer's world-space ones agree.
import { GLOBE_RADIUS, type SpherePoint } from "../geoMath.ts";

function dot(a: SpherePoint, b: SpherePoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Spherical linear interpolation between two UNIT vectors -- exact at
 *  t=0/1, the great-circle path between (never the straight chord). Falls
 *  back to `a` when the two points coincide (undefined direction). */
export function slerpUnit(a: SpherePoint, b: SpherePoint, t: number): SpherePoint {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const theta = Math.acos(d);
  if (theta < 1e-6) return { ...a };
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}

/** The angular separation between two unit vectors, in degrees -- the
 *  "distance" an arc's apex height is proportional to. */
export function centralAngleDeg(a: SpherePoint, b: SpherePoint): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * (180 / Math.PI);
}

const MIN_APEX = 0.35;
const MAX_APEX = 1.3; // stays under the ambient orbit halo at GLOBE_RADIUS + 1.4 (OrbitLayer.tsx).

/** Apex height in world units, linear in the great-circle distance
 *  (0deg -> MIN_APEX, 180deg -> MAX_APEX; proportional to distance, per the
 *  brief, not the log scale ReachColumns uses for magnitude). */
export function arcApexHeight(angularDeg: number): number {
  const clamped = Math.max(0, Math.min(180, angularDeg));
  return MIN_APEX + (clamped / 180) * (MAX_APEX - MIN_APEX);
}

/** A point on the raised arc from unit vector `a` to unit vector `b`:
 *  direction slerps along the great circle, radius bulges from
 *  GLOBE_RADIUS at the endpoints to GLOBE_RADIUS + apex at the midpoint
 *  (a sine bulge, so t=0/1 land exactly on the surface). */
export function arcPoint(a: SpherePoint, b: SpherePoint, t: number, apex: number): SpherePoint {
  const dir = slerpUnit(a, b, t);
  const radius = GLOBE_RADIUS + apex * Math.sin(Math.PI * t);
  return { x: dir.x * radius, y: dir.y * radius, z: dir.z * radius };
}

/** Samples an arc into `segments + 1` points, for a TubeGeometry/curve. */
export function sampleArc(a: SpherePoint, b: SpherePoint, apex: number, segments = 24): SpherePoint[] {
  const pts: SpherePoint[] = new Array(segments + 1);
  for (let i = 0; i <= segments; i++) pts[i] = arcPoint(a, b, i / segments, apex);
  return pts;
}
