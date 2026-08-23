import { useEffect, useMemo, useRef, type JSX, type ReactElement } from "react";
import { Color, Object3D, type InstancedMesh } from "three";
import { PLACEMENTS } from "./worldData.ts";
import { CITY } from "./city.ts";
import { heightAt } from "./heightfield.ts";
import { worldPalette, type WorldPalette } from "./palette.ts";
import { PROP_FAMILIES, employerBlocks, caseStudyMonuments, projectTowers } from "./districtWest.ts";

/**
 * SITE DEBRIS — west flank only.
 *
 * The city's build zones read as a place someone actually works, not a
 * gallery: pallets, cable spools and kerb blocks scattered across the west
 * flank's build zone, the way a real site looks between the monuments. East
 * stays clean — the corpus (WS4) is the found archive, not a job site, and
 * mixing debris into it would blur the one distinction (west = paid for,
 * east = made anyway) the whole layout exists to draw.
 *
 * Four families, each one plain `<instancedMesh>` (one draw call), same
 * instancing discipline this file has always used. Each piece used to be an
 * `InstancedRigidBodies` dynamic body dropped from a height and left to
 * settle under gravity; now it's placed at rest directly on the ground —
 * `heightAt(x, z) + halfHeight` — with its matrix written once rather than
 * every physics step, because there is no longer a physics step to write it
 * from.
 */

// The west build zone: everything between the approach apron (CITY.buildInner,
// the wall that keeps debris out of a pavilion's sensor volume) and the kerb
// (CITY.halfWidth, with a metre of margin so nothing spawns hanging off the
// edge), for the full length of the slab.
const X_MIN = -(CITY.halfWidth - 1);
const X_MAX = -CITY.buildInner;
const Z_MIN = CITY.z0 + 2;
const Z_MAX = CITY.z1 - 2;
const PAVILION_CLEARANCE = 3.6; // keep debris out from under the west rooms

// West-side room centres only (x < 0 — the design doc's alternating-sides
// PLACEMENTS table puts /map, /forge, /lab and /terminal here). Debris never
// needed to avoid the east rooms in the first place since it never spawns
// there, but filtering explicitly documents that rather than leaving it an
// accident of the X_MIN/X_MAX bounds above.
const WEST_ROOM_CENTRES: [number, number][] = PLACEMENTS.filter((p) => p.position[0] < 0).map((p) => [p.position[0], p.position[2]]);

function tooCloseToAPavilion(x: number, z: number): boolean {
  return WEST_ROOM_CENTRES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < PAVILION_CLEARANCE);
}

// Monuments.tsx (WS3) draws every employer block, case-study obelisk and
// project tower at real size — and Dice.tech's block alone (the whole "June
// 2023 - Present" span) is a 3m x 23.2m x 52m box. X_MIN..X_MAX above puts
// every one of those lanes (kerb -16, mid -20.5, outer -25.5) squarely
// inside the debris scatter zone. Without this, a piece of debris resting
// "inside" that box would visually clip through solid geometry — no physics
// step to fire it back out any more, so a bad sample would just sit there
// wrong forever rather than resolving itself. Same failure mode as
// `tooCloseToAPavilion`, same fix: reject the sample and try again. Rebuilt
// from districtWest.ts's own exported shapes rather than duplicated numbers,
// so a change to a block's height or a tower's width can never leave this
// exclusion stale.
const STRUCTURE_CLEARANCE = 1.5; // a prop's own half-extent (<=0.45m) plus a little breathing room
type ExclusionBox = { xMin: number; xMax: number; zMin: number; zMax: number };
const STRUCTURE_EXCLUSIONS: ExclusionBox[] = [
  ...employerBlocks().map((b) => ({
    xMin: b.x - b.width / 2 - STRUCTURE_CLEARANCE,
    xMax: b.x + b.width / 2 + STRUCTURE_CLEARANCE,
    zMin: b.zStart - STRUCTURE_CLEARANCE,
    zMax: b.zEnd + STRUCTURE_CLEARANCE,
  })),
  ...caseStudyMonuments().map((m) => ({
    xMin: m.x - m.radius - STRUCTURE_CLEARANCE,
    xMax: m.x + m.radius + STRUCTURE_CLEARANCE,
    zMin: m.z - m.radius - STRUCTURE_CLEARANCE,
    zMax: m.z + m.radius + STRUCTURE_CLEARANCE,
  })),
  ...projectTowers().map((t) => ({
    xMin: t.x - t.width / 2 - STRUCTURE_CLEARANCE,
    xMax: t.x + t.width / 2 + STRUCTURE_CLEARANCE,
    zMin: t.z - t.width / 2 - STRUCTURE_CLEARANCE,
    zMax: t.z + t.width / 2 + STRUCTURE_CLEARANCE,
  })),
];

function insideAStructure(x: number, z: number): boolean {
  return STRUCTURE_EXCLUSIONS.some((b) => x >= b.xMin && x <= b.xMax && z >= b.zMin && z <= b.zMax);
}

type PropInstance = { position: [number, number, number]; rotationY: number };

/** Rejection-samples `count` (x, z) points across the west build zone, clear
 *  of every west pavilion's footprint, and returns them resting directly on
 *  the terrain — `heightAt(x, z) + halfHeight` puts each piece's centre
 *  exactly `halfHeight` above the ground it's standing on, the same
 *  distance a settled physics body used to end up at once gravity and its
 *  own collider shape finished with it. Only the yaw varies (a physics drop
 *  used to tumble onto an arbitrary face too, which mattered less once these
 *  were dynamic bodies than it does for a fixed placement — an upright rest
 *  pose reads as "placed debris" rather than "wreckage" either way). */
function scatterWestFlank(count: number, halfHeight: number): PropInstance[] {
  const instances: PropInstance[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    // Bounded rejection sampling. The excluded area is no longer just a
    // handful of small pavilion circles — Dice.tech's own employer block
    // alone shadows over half the slab's length in the mid lane — but it is
    // still well under the whole zone, so this converges within the cap;
    // the cap just guarantees it can never spin forever, and worst case
    // leaves one prop resting against rather than inside a structure.
    for (let tries = 0; tries < 20; tries++) {
      x = X_MIN + Math.random() * (X_MAX - X_MIN);
      z = Z_MIN + Math.random() * (Z_MAX - Z_MIN);
      if (!tooCloseToAPavilion(x, z) && !insideAStructure(x, z)) break;
    }
    instances.push({ position: [x, heightAt(x, z) + halfHeight, z], rotationY: Math.random() * Math.PI * 2 });
  }
  return instances;
}

// Prop colours, resolved from theme tokens at render — see palette.ts for why
// these cannot be module-scope constants. No hardcoded hex anywhere in this
// file: the industrial "concrete/rust" read comes from the palette's own
// muted tokens (card, surface, textDim), the same discipline the rest of
// src/world/ enforces.
function propColors(c: WorldPalette) {
  return {
    pallet: [c.textDim, c.card],
    spool: [c.accent, c.accentDim],
    kerbBlock: [c.surface, c.card],
    barrel: [c.signal, c.probe],
  };
}

// Resting half-heights — half the geometry's own Y extent, so a piece
// centred at `heightAt(x,z) + halfHeight` sits with its bottom face exactly
// on the ground rather than floating or embedded. One per family, matched to
// the geometry passed to that family's `<PropFamily>` call below.
const PALLET_HALF_HEIGHT = 0.075; // boxGeometry [0.9, 0.15, 0.7]
const SPOOL_HALF_HEIGHT = 0.25; // cylinderGeometry [0.35, 0.35, 0.5, 16]
const KERB_HALF_HEIGHT = 0.15; // boxGeometry [0.4, 0.3, 0.4]
const BARREL_HALF_HEIGHT = 0.275; // cylinderGeometry [0.25, 0.22, 0.55, 12]

const dummy = new Object3D();

/** One prop family: N static instances of a single geometry, coloured
 *  per-instance via `InstancedMesh.setColorAt` (one draw call for the whole
 *  family, no material-per-instance overhead) rather than one mesh per prop.
 *  Matrix and colour are both painted once in an effect, keyed on `count` —
 *  there is nothing left to update per frame now that nothing here moves. */
function PropFamily({
  count,
  halfHeight,
  colors,
  geometry,
}: {
  count: number;
  halfHeight: number;
  colors: string[];
  geometry: ReactElement;
}) {
  const instances = useMemo(() => scatterWestFlank(count, halfHeight), [count, halfHeight]);
  const meshRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const inst = instances[i];
      dummy.position.set(...inst.position);
      dummy.rotation.set(0, inst.rotationY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(colors[i % colors.length]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, colors, instances]);
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} count={count} castShadow receiveShadow>
      {geometry}
      <meshStandardMaterial roughness={0.55} />
    </instancedMesh>
  );
}

export function Props(): JSX.Element {
  const colors = propColors(worldPalette());
  return (
    <>
      {/* Pallets — wide, flat, cuboid. */}
      <PropFamily count={PROP_FAMILIES[0].count} halfHeight={PALLET_HALF_HEIGHT} colors={colors.pallet} geometry={<boxGeometry args={[0.9, 0.15, 0.7]} />} />
      {/* Cable spools. */}
      <PropFamily
        count={PROP_FAMILIES[1].count}
        halfHeight={SPOOL_HALF_HEIGHT}
        colors={colors.spool}
        geometry={<cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />}
      />
      {/* Kerb blocks — small, dense cuboids. */}
      <PropFamily count={PROP_FAMILIES[2].count} halfHeight={KERB_HALF_HEIGHT} colors={colors.kerbBlock} geometry={<boxGeometry args={[0.4, 0.3, 0.4]} />} />
      {/* Barrels. */}
      <PropFamily
        count={PROP_FAMILIES[3].count}
        halfHeight={BARREL_HALF_HEIGHT}
        colors={colors.barrel}
        geometry={<cylinderGeometry args={[0.25, 0.22, 0.55, 12]} />}
      />
    </>
  );
}
