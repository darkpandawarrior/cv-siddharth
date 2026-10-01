// LANE C2 ("X-ray mode"): draws a read-only outline over every WMTS tile
// TileLayer.tsx currently has on screen, coloured by level of detail, and
// samples renderer.info for the stats card (ui/XRay.tsx). Both readers are
// fed from `drawnTileSet` (TileLayer.tsx's own read-only export) and
// `xrayState.ts` (this lane's shared store) — nothing here draws anything
// TileLayer.tsx isn't already drawing itself; this is pure inspection.
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { latLonToXyz, GLOBE_RADIUS } from "../geoMath.ts";
import { drawnTileSet, type DrawnTile } from "./TileLayer.tsx";
import { levelColorHex, setXrayStats, resetXrayStats } from "./xrayState.ts";

// A hair above TileLayer.tsx's own TILE_RADIUS (GLOBE_RADIUS * 1.0015) so an
// outline never z-fights the tile surface it's tracing.
const OUTLINE_RADIUS = GLOBE_RADIUS * 1.002;
// Short polyline per edge rather than a straight chord, so a coarse (wide)
// tile's outline still visibly follows the sphere instead of cutting
// through it.
const EDGE_SEGMENTS = 6;
// Brief: "sampled at most 4 times a second (no per-frame React state)" — the
// same throttle also gates the outline geometry rebuild below, since
// rebuilding a fresh BufferGeometry every frame would be real per-frame
// allocation (the "zero per-frame allocations in useFrame" rule) for a
// debug overlay that has no need of it; TileLayer.tsx's own
// RECOMPUTE_MIN_INTERVAL_MS is the same kind of throttle for the same
// reason.
const SAMPLE_INTERVAL_MS = 250;

const LEVEL_COLORS = levelColorHexToThree();
function levelColorHexToThree(): THREE.Color[] {
  const colors: THREE.Color[] = [];
  for (let level = 0; level < 8; level++) colors.push(new THREE.Color(levelColorHex(level)));
  return colors;
}
function levelColor(level: number): THREE.Color {
  return LEVEL_COLORS[Math.max(0, Math.min(LEVEL_COLORS.length - 1, level))];
}

function buildOutlineGeometry(tiles: DrawnTile[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const tile of tiles) {
    const { lat0, lat1, lon0, lon1 } = tile.bounds;
    const color = levelColor(tile.level);
    // The four edges, each walked as EDGE_SEGMENTS short chords so the line
    // follows the sphere's own curve rather than cutting a visible chord
    // across a wide low-level tile.
    const edges: [number, number][][] = [
      Array.from({ length: EDGE_SEGMENTS + 1 }, (_, i) => [lat0, lon0 + (lon1 - lon0) * (i / EDGE_SEGMENTS)]),
      Array.from({ length: EDGE_SEGMENTS + 1 }, (_, i) => [lat0 + (lat1 - lat0) * (i / EDGE_SEGMENTS), lon1]),
      Array.from({ length: EDGE_SEGMENTS + 1 }, (_, i) => [lat1, lon1 - (lon1 - lon0) * (i / EDGE_SEGMENTS)]),
      Array.from({ length: EDGE_SEGMENTS + 1 }, (_, i) => [lat1 - (lat1 - lat0) * (i / EDGE_SEGMENTS), lon0]),
    ];
    for (const edge of edges) {
      for (let i = 0; i < edge.length - 1; i++) {
        const [latA, lonA] = edge[i];
        const [latB, lonB] = edge[i + 1];
        const a = latLonToXyz(latA, lonA);
        const b = latLonToXyz(latB, lonB);
        positions.push(a.x * OUTLINE_RADIUS, a.y * OUTLINE_RADIUS, a.z * OUTLINE_RADIUS, b.x * OUTLINE_RADIUS, b.y * OUTLINE_RADIUS, b.z * OUTLINE_RADIUS);
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export default function XRayTiles({ frameStats }: { frameStats: { calls: number; triangles: number } }) {
  const { gl } = useThree();
  const lineRef = useRef<THREE.LineSegments>(null!);
  const lastSampleMsRef = useRef<number | null>(null);
  const framesSinceSampleRef = useRef(0);

  // Tells TileLayer.tsx to start (and stop) populating drawnTileSet — see
  // that export's own doc comment on why this is opt-in. This component and
  // TileLayer.tsx unmount together (GlobeScene.tsx ANDs the same
  // style/tier condition into both), so on unmount TileLayer's own useFrame
  // loop has already stopped refreshing `tiles` — clear it here rather than
  // leave the last real frame behind as a stale ghost reading. Same reason
  // the stats card gets reset instead of frozen: a switch to "Dots" or tier
  // 3 while X-ray is still on must read zero, never the last imagery frame.
  useEffect(() => {
    drawnTileSet.enabled = true;
    return () => {
      drawnTileSet.enabled = false;
      drawnTileSet.tiles.length = 0;
      resetXrayStats();
    };
  }, []);

  // Dispose whatever geometry/material is live when this unmounts (GlobeScene
  // toggles this component in and out with the X-ray toggle) — same
  // discipline TileLayer.tsx's own teardown effect follows.
  useEffect(() => {
    const line = lineRef.current;
    return () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, []);

  useFrame(({ clock }) => {
    framesSinceSampleRef.current++;
    const nowMs = clock.elapsedTime * 1000;
    const last = lastSampleMsRef.current;
    if (last !== null && nowMs - last < SAMPLE_INTERVAL_MS) return;

    const elapsedS = last === null ? 0 : (nowMs - last) / 1000;
    const fps = last === null || elapsedS <= 0 ? 0 : framesSinceSampleRef.current / elapsedS;
    lastSampleMsRef.current = nowMs;
    framesSinceSampleRef.current = 0;

    // SceneRig snapshots the whole previous frame before resetting counters,
    // so the composer and callback ordering cannot expose a partial frame.
    const info = gl.info;
    setXrayStats({
      drawCalls: frameStats.calls,
      triangles: frameStats.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      fps: Math.round(fps),
    });

    const next = buildOutlineGeometry(drawnTileSet.tiles);
    const line = lineRef.current;
    const old = line.geometry;
    line.geometry = next;
    old.dispose();
  });

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial vertexColors transparent opacity={0.85} depthWrite={false} />
    </lineSegments>
  );
}
