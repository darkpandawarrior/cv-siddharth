import { useMemo, useRef, useEffect, type JSX } from "react";
import * as THREE from "three";
import { Color } from "three";
import { CITY } from "./city.ts";
import { fleetStats } from "../data/store.ts";
import { worldPalette } from "./palette.ts";

/**
 * THE FLEET SKYLINE — the Play Store fleet (store.ts's `fleetStats`), as a
 * horizon silhouette rather than a district you drive into.
 *
 * A skyline is what you see at a distance, not a floor plan: every other
 * family in this world (Monuments.tsx, Corpus.tsx) sites its instances at
 * ground level, in a lane, because a visitor drives up to them. 172
 * buildings (`fleetStats.live` + `fleetStats.delisted`) at ground scale would
 * either need a fifth lane this boulevard has no room left for (West and
 * East already fill every metre between `CITY.buildInner` and
 * `CITY.buildOuter`), or would silently overlap a real, driven-through
 * structure. Suspended past the boulevard's southern edge (`CITY.z1`, "now" —
 * see city.ts's own north/south poem) and well above any ground structure's
 * height instead: it reads as the skyline ahead of the car as it drives
 * south, exactly what the name says, and it cannot collide with anything
 * because nothing else in this world is built at this elevation.
 *
 * No Blender: a skyline is 172 near-identical boxes, procedurally placed —
 * exactly the "repeated counts are the wrong shape for authored geometry"
 * case the design spec calls out. One InstancedMesh, one draw call.
 */

const COLUMNS = 14;
const SPACING = 2.4; // metres between building centres, both axes
const SKY_Z = CITY.z1 + 22; // ahead of the last year band, never over open road
const SKY_Y_BASE = 16; // floor of the skyline band — clear of every ground structure
const MIN_H = 2;
const MAX_H = 9;

/** Deterministic value noise, reimplemented per this codebase's own
 *  "each district independently satisfies its own reproducibility check"
 *  rule (corpusData.ts's identical function carries the same comment) rather
 *  than imported across a district boundary. */
function hashNoise(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

type Building = { x: number; y: number; z: number; height: number; lit: boolean };

/** `fleetStats.live` lit buildings, then `fleetStats.delisted` dim ones — a
 *  real, dated split (store.ts's own generator), never an invented ratio. A
 *  grid wide enough for the total count, centred on the boulevard. */
function buildings(): Building[] {
  const total = fleetStats.live + fleetStats.delisted;
  const width = (COLUMNS - 1) * SPACING;
  return Array.from({ length: total }, (_, i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const height = MIN_H + (hashNoise(i) * 0.5 + 0.5) * (MAX_H - MIN_H);
    return {
      x: col * SPACING - width / 2,
      y: SKY_Y_BASE + height / 2 + row * 0.4, // a slight back-row rise reads as depth, not a flat wall
      z: SKY_Z - row * SPACING * 0.6,
      height,
      lit: i < fleetStats.live,
    };
  });
}

export function FleetSkyline(): JSX.Element {
  const c = worldPalette();
  const items = useMemo(() => buildings(), []);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new Color();
    const lit = c.signal;
    const dim = c.textDim;
    items.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(1, b.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(b.lit ? lit : dim);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items, c.signal, c.textDim]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={c.surface} emissive={c.signal} emissiveIntensity={0.5} roughness={0.6} metalness={0.1} />
    </instancedMesh>
  );
}
