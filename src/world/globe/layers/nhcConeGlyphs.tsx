import { ALERT_WARN, ALERT_DANGER } from "./layerKeys.ts";
// LANE V5 (wave 7, lane 5, step A). Draws each active NHC forecast cone as a
// translucent fill on the sphere surface -- the same "hazard = a claim,
// house colour tokens" rule hazardHalos.tsx uses, just a filled polygon
// instead of a ring. One small Mesh per cone (at most a handful of active
// storms at once, never the plural-instancing threshold the house rule is
// really guarding against).
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { latLonToXyz, type LatLon } from "../geoMath.ts";
import { GLOBE_RADIUS } from "../EarthDots.tsx";
import { unwrapConeRing, type ConePolygon } from "./nhcCones.ts";

// Same surface-offset family as hazardHalos.tsx's 0.025 -- just above the
// globe so the fill never z-fights with the earth shader underneath.
const FILL_RADIUS = GLOBE_RADIUS + 0.02;

// ponytail: only the outer ring is filled, holes (if NHC's cone geometry
// ever ships one) are ignored -- every cone sampled while building this
// (2026-09-29, 5 active storms) was a single simple ring. Add
// ShapeUtils.triangulateShape's hole-indices argument if a real cone with a
// hole ever ships.
function buildGeometry(ring: LatLon[]): THREE.BufferGeometry | null {
  // GeoJSON closes a ring by repeating its first point; that duplicate
  // would triangulate into a zero-area sliver, so it is dropped first.
  const first = ring[0];
  const last = ring[ring.length - 1];
  const pts = ring.length > 1 && first.lat === last.lat && first.lon === last.lon ? ring.slice(0, -1) : ring;
  if (pts.length < 3) return null;

  const contour = unwrapConeRing(pts).map((p) => new THREE.Vector2(p.lon, p.lat));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (triangles.length === 0) return null;

  const positions = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const v = latLonToXyz(pts[i].lat, pts[i].lon);
    positions[i * 3] = v.x * FILL_RADIUS;
    positions[i * 3 + 1] = v.y * FILL_RADIUS;
    positions[i * 3 + 2] = v.z * FILL_RADIUS;
  }
  const index = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    index[i * 3] = triangles[i][0];
    index[i * 3 + 1] = triangles[i][1];
    index[i * 3 + 2] = triangles[i][2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

export function NhcConeGlyphs({ cones, dangerIds }: { cones: ConePolygon[]; dangerIds: Set<string> }) {
  const meshes = useMemo(
    () => cones.map((c) => ({ id: c.id, stormName: c.stormName, geometry: buildGeometry(c.rings[0]) })),
    [cones],
  );
  // Every triangulated BufferGeometry above is a fresh GPU allocation each
  // time `cones` changes (a 30-minute poll, never per frame) -- disposed
  // explicitly since three never garbage-collects GPU buffers on its own.
  useEffect(() => {
    return () => {
      for (const m of meshes) m.geometry?.dispose();
    };
  }, [meshes]);

  const warn = ALERT_WARN;
  const danger = ALERT_DANGER;

  if (meshes.length === 0) return null;

  return (
    <>
      {meshes.map((m) =>
        m.geometry ? (
          <mesh key={m.id} geometry={m.geometry} frustumCulled={false} name={`nhc-cone:${m.stormName}`}>
            <meshBasicMaterial
              color={dangerIds.has(m.id) ? danger : warn}
              transparent
              opacity={0.32}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ) : null,
      )}
    </>
  );
}
