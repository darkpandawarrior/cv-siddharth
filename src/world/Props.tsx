import { useEffect, useMemo, useRef, type JSX, type ReactElement } from "react";
import { Color, type InstancedMesh } from "three";
import { InstancedRigidBodies, type InstancedRigidBodyProps, type RigidBodyAutoCollider } from "@react-three/rapier";
import { PLACEMENTS } from "./worldData.ts";
import { CITY } from "./city.ts";
import { PAVILION_SENSOR_GROUP, PROP_COLLISION_GROUPS } from "./collisionGroups.ts";
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
 * Four families, each one `InstancedRigidBodies` (N dynamic bodies, one draw
 * call), same pattern this file has used since the world had a single flat
 * desk — the geometry changed, the instancing discipline didn't.
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

// Membership in group 0 only, filter left at its default ("interact with
// every group") — this collider still physically collides with the ground
// and every other prop exactly as if collisionGroups were never set, but a
// spool nudged near a room can no longer satisfy that sensor's
// group-15-only filter (see Pavilions.tsx's PAVILION_SENSOR_GROUP comment),
// so it can never fake a "craft entered this room" event.
if (PAVILION_SENSOR_GROUP === 0) {
  // Would silently defeat the whole scheme above — group 0 must stay reserved
  // for props, group 15 for the sensors they need to be invisible to.
  throw new Error("Props.tsx and Pavilions.tsx picked the same interaction group");
}

// West-side room centres only (x < 0 — the design doc's alternating-sides
// PLACEMENTS table puts /map, /forge, /lab and /terminal here). Debris never
// needed to avoid the east rooms in the first place since it never spawns
// there, but filtering explicitly documents that rather than leaving it an
// accident of the X_MIN/X_MAX bounds above.
const WEST_ROOM_CENTRES: [number, number][] = PLACEMENTS.filter((p) => p.position[0] < 0).map((p) => [p.position[0], p.position[2]]);

function tooCloseToAPavilion(x: number, z: number): boolean {
  return WEST_ROOM_CENTRES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < PAVILION_CLEARANCE);
}

// Monuments.tsx (WS3) gives every employer block, case-study obelisk and
// project tower its own FIXED RigidBody collider, sized to the real
// structure — and Dice.tech's block alone (the whole "June 2023 - Present"
// span) is a 3m x 23.2m x 52m box. X_MIN..X_MAX above puts every one of
// those lanes (kerb -16, mid -20.5, outer -25.5) squarely inside the debris
// scatter zone. Without this, a spool spawning inside that box is a dynamic
// body sharing volume with a static one — Rapier resolves the overlap by
// firing it out on the first physics step, so the world would greet a
// visitor with debris exploding out of solid geometry on load. Same failure
// mode as `tooCloseToAPavilion`, same fix: reject the sample and try again.
// Rebuilt from districtWest.ts's own exported shapes rather than duplicated
// numbers, so a change to a block's height or a tower's width can never
// leave this exclusion stale.
const STRUCTURE_CLEARANCE = 1.5; // a prop's own half-extent (<=0.45m) plus room to fall without clipping
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

/** Rejection-samples `count` (x, z) points across the west build zone, clear
 *  of every west pavilion's footprint, and returns them as instance props
 *  dropped from a small random height so they fall onto the terrain under
 *  gravity rather than spawning already resting. */
function scatterWestFlank(count: number, dropHeight: [number, number]): InstancedRigidBodyProps[] {
  const instances: InstancedRigidBodyProps[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    // Bounded rejection sampling. The excluded area is no longer just a
    // handful of small pavilion circles — Dice.tech's own employer block
    // alone shadows over half the slab's length in the mid lane — but it is
    // still well under the whole zone, so this converges within the cap;
    // the cap just guarantees it can never spin forever, and worst case
    // leaves one prop resting against rather than deep inside a structure.
    for (let tries = 0; tries < 20; tries++) {
      x = X_MIN + Math.random() * (X_MAX - X_MIN);
      z = Z_MIN + Math.random() * (Z_MAX - Z_MIN);
      if (!tooCloseToAPavilion(x, z) && !insideAStructure(x, z)) break;
    }
    const y = dropHeight[0] + Math.random() * (dropHeight[1] - dropHeight[0]);
    instances.push({
      key: `${i}`,
      position: [x, y, z],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
    });
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

// Drop-height ranges, hoisted to module scope (rather than inline array
// literals at each call site below) so they're stable references across
// renders — PropFamily's useMemo/useEffect deps would otherwise see a "new"
// array on every render of <Props> and redo the scatter/paint for no reason.
const PALLET_DROP: [number, number] = [1.0, 1.8];
const SPOOL_DROP: [number, number] = [1.2, 2.2];
const KERB_DROP: [number, number] = [1.0, 1.6];
const BARREL_DROP: [number, number] = [1.2, 2.0];

/** One prop family: N instances of a single geometry, coloured per-instance
 *  via `InstancedMesh.setColorAt` (one draw call for the whole family, no
 *  material-per-instance overhead) rather than one mesh per prop. `colliders`
 *  picks the auto-collider shape Rapier derives from the child geometry once
 *  at mount. Colour is painted imperatively in an effect because `count` and
 *  `colors` are only known at the JSX call site below — there's no declarative
 *  per-instance-colour prop on `<instancedMesh>` to hand them to directly. */
function PropFamily({
  count,
  dropHeight,
  colliders,
  colors,
  geometry,
}: {
  count: number;
  dropHeight: [number, number];
  colliders: RigidBodyAutoCollider;
  colors: string[];
  geometry: ReactElement;
}) {
  const instances = useMemo(() => scatterWestFlank(count, dropHeight), [count, dropHeight]);
  const meshRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < count; i++) {
      color.set(colors[i % colors.length]);
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, colors]);
  return (
    <InstancedRigidBodies
      instances={instances}
      colliders={colliders}
      friction={0.9}
      restitution={0.15}
      // Light. At Rapier's default density these were heavy enough relative to
      // a 220kg chassis to stop it dead or flip it — a crate the size of the
      // car's own body, hit at 8 m/s, ended the drive. Debris should burst out
      // of the way and tumble, which is the fun part; being wrecked by desk
      // clutter is not.
      density={0.08}
      collisionGroups={PROP_COLLISION_GROUPS}
    >
      <instancedMesh ref={meshRef} args={[undefined, undefined, count]} count={count} castShadow receiveShadow>
        {geometry}
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}

export function Props(): JSX.Element {
  const colors = propColors(worldPalette());
  return (
    <>
      {/* Pallets — wide, flat, cuboid. */}
      <PropFamily count={PROP_FAMILIES[0].count} dropHeight={PALLET_DROP} colliders="cuboid" colors={colors.pallet} geometry={<boxGeometry args={[0.9, 0.15, 0.7]} />} />
      {/* Cable spools. */}
      <PropFamily
        count={PROP_FAMILIES[1].count}
        dropHeight={SPOOL_DROP}
        colliders="hull"
        colors={colors.spool}
        geometry={<cylinderGeometry args={[0.35, 0.35, 0.5, 16]} />}
      />
      {/* Kerb blocks — small, dense cuboids. */}
      <PropFamily count={PROP_FAMILIES[2].count} dropHeight={KERB_DROP} colliders="cuboid" colors={colors.kerbBlock} geometry={<boxGeometry args={[0.4, 0.3, 0.4]} />} />
      {/* Barrels. */}
      <PropFamily
        count={PROP_FAMILIES[3].count}
        dropHeight={BARREL_DROP}
        colliders="hull"
        colors={colors.barrel}
        geometry={<cylinderGeometry args={[0.25, 0.22, 0.55, 12]} />}
      />
    </>
  );
}
