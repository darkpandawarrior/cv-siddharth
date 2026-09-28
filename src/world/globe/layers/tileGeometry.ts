// WAVE 2 LANE W1 (deep zoom): builds one tile's curved lat/lon patch mesh —
// a grid of `segments`x`segments` quads following the real sphere, not a
// flat rectangle, so a tile's own corners sit on the same sphere the whole-
// globe imagery does (no seams at the join, no z-fighting from a flat patch
// poking through a curved neighbour). Uses three (BufferGeometry), so this
// stays out of tileMatrix.ts/tileLOD.ts/tileSelect.ts's plain-data purity,
// but needs no WebGL context to run — plain geometry math.
import * as THREE from "three";
import { latLonToXyz } from "../geoMath.ts";
import type { TileBounds } from "./tileMatrix.ts";

/** Segments per tile edge (living-earth spec item: "about 16x16"). Kept
 *  fixed rather than scaled by tier — a tile's own polygon budget is tiny
 *  (16*16*2 = 512 triangles) next to the whole-globe sphere's own SEGMENTS
 *  table in EarthImagery.tsx (up to 128x96), and at most a few dozen tiles
 *  are ever on screen at once (tileSelect.ts's own MAX_SELECTED_TILES cap). */
export const TILE_SEGMENTS = 16;

/** Builds a BufferGeometry for one tile: a `segments`x`segments` curved
 *  patch at `radius`, covering `bounds`. UV (0,0) is the tile image's own
 *  top-left (north-west) corner, matching how a browser decodes the JPEG/PNG
 *  GIBS returns — v=0 at the north edge, same convention as the WMTS
 *  TopLeftCorner this data is served from (tileMatrix.ts's own doc comment). */
export function buildTilePatchGeometry(bounds: TileBounds, radius: number, segments: number = TILE_SEGMENTS): THREE.BufferGeometry {
  const n = segments + 1;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const normals = new Float32Array(n * n * 3);

  for (let row = 0; row < n; row++) {
    const v = row / segments;
    const lat = bounds.lat0 + (bounds.lat1 - bounds.lat0) * v; // v=0 -> lat0 (north), v=1 -> lat1 (south)
    for (let col = 0; col < n; col++) {
      const u = col / segments;
      const lon = bounds.lon0 + (bounds.lon1 - bounds.lon0) * u;
      const p = latLonToXyz(lat, lon);
      const idx = row * n + col;
      positions[idx * 3] = p.x * radius;
      positions[idx * 3 + 1] = p.y * radius;
      positions[idx * 3 + 2] = p.z * radius;
      normals[idx * 3] = p.x;
      normals[idx * 3 + 1] = p.y;
      normals[idx * 3 + 2] = p.z;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      const a = row * n + col;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
