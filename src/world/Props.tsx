import { useEffect, useMemo, useRef, type JSX, type ReactElement } from "react";
import { Color, type InstancedMesh } from "three";
import { InstancedRigidBodies, interactionGroups, type InstancedRigidBodyProps, type RigidBodyAutoCollider } from "@react-three/rapier";
import { PLACEMENTS } from "./worldData.ts";
import { PAVILION_SENSOR_GROUP } from "./Pavilions.tsx";

/**
 * The knockable debris scattered over the mainland — keycaps, pencils, mugs,
 * crates. Purely physical set-dressing: nothing here is a room, a sensor, or
 * navigable, it exists so the craft driving through feels like it's moving
 * through a real desk rather than an empty plane. Every family is one
 * `InstancedRigidBodies` (per the design doc's "instance anything placed more
 * than a handful of times" rule) so N dynamic bodies cost one draw call each,
 * not N.
 *
 * Total instance count is the budget line: four families times a few dozen
 * each stays comfortably under the ~120-dynamic-body target the design doc
 * sets for 60fps on a laptop, while still reading as "cluttered" rather than
 * "four objects on an empty table".
 */

// Scatter bounds, matched to Terrain.tsx's actual flat mainland slab (a
// 42x28 box centred at x=0, z=-4 — so x in [-21,21], z in [-18,10]) rather
// than worldData.ts's coarser "mainland is z in [-18,18]" comment, which
// includes the tapered shore/launch-ramp strip south of z=12. A small
// margin in from the slab's true edges keeps every prop spawning on flat,
// solid ground instead of at the lip where it could tip off unfairly.
const MAINLAND_X_HALF = 18;
const MAINLAND_Z_MIN = -16;
const MAINLAND_Z_MAX = 8;
const PAVILION_CLEARANCE = 3.6; // keep debris out from under the room structures

// Membership in group 0 only, filter left at its default ("interact with
// every group") — this collider still physically collides with the ground
// and every other prop exactly as if collisionGroups were never set, but a
// keycap nudged under a pavilion can no longer satisfy that sensor's
// group-15-only filter (see Pavilions.tsx's PAVILION_SENSOR_GROUP comment),
// so it can never fake a "craft entered this room" event.
const PROP_COLLISION_GROUPS = interactionGroups([0]);
if (PAVILION_SENSOR_GROUP === 0) {
  // Would silently defeat the whole scheme above — group 0 must stay reserved
  // for props, group 15 for the sensors they need to be invisible to.
  throw new Error("Props.tsx and Pavilions.tsx picked the same interaction group");
}

// Land pavilion centres, read from the same registry Pavilions.tsx builds
// from — so if a land room ever moves, this clearing moves with it instead
// of drifting out of sync with a hand-copied list of coordinates.
const LAND_CENTRES: [number, number][] = PLACEMENTS.filter((p) => p.medium === "land").map((p) => [p.position[0], p.position[2]]);

function tooCloseToAPavilion(x: number, z: number): boolean {
  return LAND_CENTRES.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < PAVILION_CLEARANCE);
}

/** Rejection-samples `count` (x, z) points across the mainland, clear of every
 *  land pavilion's footprint, and returns them as instance props dropped from
 *  a small random height so they fall onto the terrain under gravity rather
 *  than spawning already resting (which would read as static set-dressing,
 *  not physical debris). */
function scatterMainland(count: number, dropHeight: [number, number]): InstancedRigidBodyProps[] {
  const instances: InstancedRigidBodyProps[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    // Bounded rejection sampling — the excluded area (four small circles) is
    // a small fraction of the mainland, so this converges in a handful of
    // tries; the iteration cap just guarantees it can never spin forever.
    for (let tries = 0; tries < 20; tries++) {
      x = (Math.random() * 2 - 1) * MAINLAND_X_HALF;
      z = MAINLAND_Z_MIN + Math.random() * (MAINLAND_Z_MAX - MAINLAND_Z_MIN);
      if (!tooCloseToAPavilion(x, z)) break;
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

const KEYCAP_COLORS = ["#e8efe9", "#8b909a", "#171c1a", "#f2a13d"];
const MUG_COLORS = ["#e8efe9", "#4fd6e0"];
const PENCIL_COLORS = ["#f2a13d", "#c47f2a"];
const CRATE_COLORS = ["#4a3826", "#3a2c1c"];

// Drop-height ranges, hoisted to module scope (rather than inline array
// literals at each call site below) so they're stable references across
// renders — PropFamily's useMemo/useEffect deps would otherwise see a "new"
// array on every render of <Props> and redo the scatter/paint for no reason.
const KEYCAP_DROP: [number, number] = [1.2, 2.4];
const PENCIL_DROP: [number, number] = [1.0, 1.8];
const MUG_DROP: [number, number] = [1.2, 2.0];
const CRATE_DROP: [number, number] = [1.5, 2.6];

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
  const instances = useMemo(() => scatterMainland(count, dropHeight), [count, dropHeight]);
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
  return (
    <>
      <PropFamily count={36} dropHeight={KEYCAP_DROP} colliders="cuboid" colors={KEYCAP_COLORS} geometry={<boxGeometry args={[0.22, 0.22, 0.22]} />} />
      <PropFamily
        count={18}
        dropHeight={PENCIL_DROP}
        colliders="hull"
        colors={PENCIL_COLORS}
        geometry={<cylinderGeometry args={[0.035, 0.035, 1.0, 8]} />}
      />
      <PropFamily
        count={12}
        dropHeight={MUG_DROP}
        colliders="hull"
        colors={MUG_COLORS}
        geometry={<cylinderGeometry args={[0.16, 0.13, 0.32, 16]} />}
      />
      <PropFamily count={10} dropHeight={CRATE_DROP} colliders="cuboid" colors={CRATE_COLORS} geometry={<boxGeometry args={[0.55, 0.45, 0.55]} />} />
    </>
  );
}
