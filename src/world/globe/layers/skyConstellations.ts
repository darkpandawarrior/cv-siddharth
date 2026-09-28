// Pure parsing + geometry math for the IAU constellation stick figures (LANE
// W4). No three, no React, no DOM — mirrors skyMath.ts's own discipline so
// this stays colocated-test-friendly and reusable from the .tsx layer without
// dragging WebGL types into a unit test.
//
// Source data (public/sky/constellations.json, licence recorded beside it in
// CONSTELLATIONS-LICENSE.txt): trimmed from d3-celestial's own
// constellations.lines.json (figure segments) and constellations.json
// (IAU id, English name, centroid), both BSD-3-Clause (Olaf Frohn) — an
// OSI permissive licence, MIT-redistribution-compatible, deliberately NOT
// Stellarium's western skyculture (CC BY-SA + Free Art License, share-alike,
// excluded by this lane's own brief).

const RAD = Math.PI / 180;

/** One constellation's raw record, as shipped in constellations.json: `ra`/
 *  `dec` are the IAU centroid in degrees (same RA-in-degrees convention
 *  skyStars.tsx's own encoding uses, not hours); `lines` is one flat
 *  [ra0,dec0,ra1,dec1,...] array per polyline of the stick figure. */
export interface ConstellationRaw {
  id: string;
  name: string;
  ra: number;
  dec: number;
  lines: number[][];
}

interface ConstellationsFile {
  constellations: ConstellationRaw[];
}

/** Fetches and parses the shipped constellation set (browser runtime only).
 *  Same "throw on !ok, let the caller decide what 'failed' means" contract
 *  as src/lib/stars.ts's loadStarField — this layer draws nothing on a
 *  rejected promise rather than fake a figure. */
export async function loadConstellations(
  url = "/sky/constellations.json",
  fetchImpl: typeof fetch = fetch,
): Promise<ConstellationRaw[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as ConstellationsFile;
  return data.constellations;
}

/** Every polyline's points collapsed into discrete line-segment endpoint
 *  pairs (ra0,dec0,ra1,dec1) — what a THREE.LineSegments draw call wants
 *  (adjacent, not continuous strip: two constellations sharing a boundary
 *  star must never draw a stray connecting line between polylines). A
 *  polyline of N points yields N-1 segments. */
export function toSegmentPairs(c: ConstellationRaw): number[] {
  const out: number[] = [];
  for (const poly of c.lines) {
    const pointCount = poly.length / 2;
    for (let p = 0; p < pointCount - 1; p++) {
      const i = p * 2;
      out.push(poly[i], poly[i + 1], poly[i + 2], poly[i + 3]);
    }
  }
  return out;
}

/** RA (deg, 0-360)/Dec (deg) -> unit-ish xyz at `radius`, on the same
 *  celestial-sphere frame skyStars.tsx encodes stars in (lon = RA, so the
 *  whole field/figure set rotates together by one -GMST group rotation) —
 *  see skyMath.ts's substellarLatLon comment for the frame derivation this
 *  mirrors. Plain numbers, not THREE.Vector3: kept callable from a unit test
 *  with no WebGL context, same as skyMath.ts's own bvToRgb/magToPointSize. */
export function raDecToXyz(raDeg: number, decDeg: number, radius: number): [number, number, number] {
  const lonRad = raDeg * RAD;
  const latRad = decDeg * RAD;
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.cos(lonRad) * radius, Math.sin(latRad) * radius, -cosLat * Math.sin(lonRad) * radius];
}

/** Rotation about the world Y axis by `angleRad` — the exact transform a
 *  `<group rotation-y={angleRad}>` applies to its children's local
 *  position, restated here as plain numbers so a label's screen-space
 *  anchor can be computed once per `now` change (not read back off a
 *  THREE.Object3D's world matrix every frame) and still land in the same
 *  spot the group-rotated LineSegments draws its figures at. */
export function rotateY(x: number, y: number, z: number, angleRad: number): [number, number, number] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [x * c + z * s, y, -x * s + z * c];
}

/** True when a point in direction (px,py,pz) from the globe's centre —
 *  effectively "at infinity" for a celestial-sphere label, so only its
 *  direction matters, never its distance — sits behind the opaque earth
 *  sphere as seen from `camera` (camPos), radius `globeRadius`. Same horizon
 *  dot-product test SatelliteLayer.tsx's own isOccluded() uses for a
 *  near-surface satellite label, restated in plain numbers (no THREE.Vector3)
 *  rather than imported: that function lives in a sibling lane's file this
 *  lane may not edit, and a satellite's near-surface occlusion test and a
 *  star-sphere label's at-infinity one are close enough in shape but not
 *  identical enough to justify a cross-lane coupling for six lines of math. */
export function isBehindEarth(
  px: number,
  py: number,
  pz: number,
  camX: number,
  camY: number,
  camZ: number,
  globeRadius: number,
): boolean {
  const camDist = Math.hypot(camX, camY, camZ);
  if (camDist <= globeRadius) return false;
  const pLen = Math.hypot(px, py, pz) || 1;
  const dot = (px * camX + py * camY + pz * camZ) / (pLen * camDist);
  return dot <= globeRadius / camDist;
}
