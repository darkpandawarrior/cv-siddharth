import { useMemo, type JSX } from "react";
import { RigidBody } from "@react-three/rapier";
import { TERRAIN } from "./worldData.ts";
import { PROP_COLLISION_GROUPS } from "./collisionGroups.ts";
import { worldPalette } from "./palette.ts";

/**
 * The things that exist to be knocked over.
 *
 * This came back after being cut, and the distinction is worth stating because
 * it is the one I got wrong for most of this world's life: DENSITY IS NOT
 * SCOPE. The reference site everyone points at has exactly one mode — you drive
 * a car — and what makes it good is that its single surface is packed with
 * objects that react. What made this world bad was four modes, not too many
 * bowling pins.
 *
 * So everything here obeys three rules:
 *   1. It lives on the one surface. No new medium, no new mode, nowhere new to
 *      get stuck.
 *   2. It is light enough to fly rather than stop the car. Being wrecked by
 *      scenery is not fun; sending it across the desk is.
 *   3. It carries PROP_COLLISION_GROUPS, so it can never trip a room's approach
 *      sensor — a stray pin doing that once navigated the visitor into /lab
 *      four seconds after load.
 *
 * Placement fills the gaps BETWEEN the two rows of rooms rather than sitting in
 * one corner, so the clutter is something you drive through on the way
 * somewhere rather than a detour you have to know about.
 */

const { groundY: GROUND, halfWidth: HALF_W, z0: Z0, z1: Z1 } = TERRAIN.mainland;

/** The band between the two rows of rooms — the natural driving corridor. */
const MID_Z = (Z0 + Z1) / 2 + 1;

/** Ten pins in a triangle. Tall, light, and they scatter beautifully. */
function BowlingPins({ x, z }: { x: number; z: number }): JSX.Element {
  const c = worldPalette();
  const pins = useMemo(() => {
    const out: [number, number][] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) out.push([(i - row / 2) * 0.8, row * 0.75]);
    }
    return out;
  }, []);
  return (
    <>
      {pins.map(([dx, dz], i) => (
        <RigidBody
          key={i}
          colliders="hull"
          position={[x + dx, GROUND + 0.42, z + dz]}
          density={0.22}
          restitution={0.4}
          collisionGroups={PROP_COLLISION_GROUPS}
        >
          <mesh castShadow>
            <capsuleGeometry args={[0.15, 0.4, 4, 8]} />
            <meshStandardMaterial color={c.text} emissive={c.signal} emissiveIntensity={0.2} flatShading />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

/** A domino run that curves, so knocking the first is worth doing. */
function Dominoes({ x, z }: { x: number; z: number }): JSX.Element {
  const c = worldPalette();
  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const t = i / 21;
        const angle = t * Math.PI * 0.6;
        return { x: x + Math.sin(angle) * 6.5, z: z + (1 - Math.cos(angle)) * 6.5, rot: angle };
      }),
    [x, z],
  );
  return (
    <>
      {pieces.map((p, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          position={[p.x, GROUND + 0.34, p.z]}
          rotation={[0, p.rot, 0]}
          density={0.35}
          collisionGroups={PROP_COLLISION_GROUPS}
        >
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.68, 0.09]} />
            <meshStandardMaterial
              color={c.card}
              emissive={i % 3 === 0 ? c.probe : c.alt}
              emissiveIntensity={0.45}
              flatShading
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

/** A pyramid of crates. Oldest trick there is, still works. */
function CrateWall({ x, z }: { x: number; z: number }): JSX.Element {
  const c = worldPalette();
  const blocks = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let row = 0; row < 4; row++) {
      const n = 4 - row;
      for (let i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * 0.6, GROUND + 0.28 + row * 0.56, 0]);
    }
    return out;
  }, []);
  return (
    <group position={[x, 0, z]}>
      {blocks.map((b, i) => (
        <RigidBody key={i} colliders="cuboid" position={b} density={0.28} collisionGroups={PROP_COLLISION_GROUPS}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.54, 0.52, 0.54]} />
            <meshStandardMaterial color={c.card} emissive={c.warn} emissiveIntensity={0.16} flatShading />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

/**
 * A jump. Fixed, gentle, and pointed along the driving corridor.
 *
 * Jumping is not a mode — the car leaves the ground and comes back to the same
 * surface, which is the one thing this world can add without reopening the
 * class of bug that made it unplayable. The angle is deliberately shallow:
 * steep ramps launch the car onto its roof, and there is no flight to save it.
 */
function Ramp({ x, z, rot = 0 }: { x: number; z: number; rot?: number }): JSX.Element {
  const c = worldPalette();
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[x, GROUND + 0.25, z]} rotation={[-0.26, rot, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[4.5, 0.4, 4]} />
        <meshStandardMaterial color={c.surface} emissive={c.probe} emissiveIntensity={0.35} flatShading />
      </mesh>
    </RigidBody>
  );
}

/** A see-saw plank on a fixed fulcrum. Cheap, and it never stops being funny. */
function SeeSaw({ x, z }: { x: number; z: number }): JSX.Element {
  const c = worldPalette();
  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders="cuboid" position={[0, GROUND + 0.22, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.4, 0.44, 0.44]} />
          <meshStandardMaterial color={c.surface} flatShading />
        </mesh>
      </RigidBody>
      <RigidBody colliders="cuboid" position={[0, GROUND + 0.56, 0]} density={0.45} collisionGroups={PROP_COLLISION_GROUPS}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2, 0.14, 6]} />
          <meshStandardMaterial color={c.card} emissive={c.signal} emissiveIntensity={0.22} flatShading />
        </mesh>
      </RigidBody>
    </group>
  );
}

/** Loose balls. Nothing rolls like a sphere, and nothing else in this world does. */
function Balls(): JSX.Element {
  const c = worldPalette();
  const balls = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        // Balls are the exception that can sit anywhere: they roll out of the
        // way rather than stopping anything.
        x: -HALF_W + 5 + ((i * 37) % (HALF_W * 2 - 10)),
        z: MID_Z + ((i * 23) % 9) - 4,
        r: 0.34 + (i % 3) * 0.1,
      })),
    [],
  );
  return (
    <>
      {balls.map((b, i) => (
        <RigidBody
          key={i}
          colliders="ball"
          position={[b.x, GROUND + 1.2, b.z]}
          density={0.2}
          restitution={0.55}
          linearDamping={0.25}
          collisionGroups={PROP_COLLISION_GROUPS}
        >
          <mesh castShadow>
            <icosahedronGeometry args={[b.r, 1]} />
            <meshStandardMaterial color={c.accent2} emissive={c.accent2} emissiveIntensity={0.25} flatShading />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

export function Stunts(): JSX.Element {
  return (
    <>
      {/* Placed in the POCKETS — the end strips beyond the two rows of rooms,
          and the gaps between room columns (rooms sit at x = -15, -5, 5, 15, so
          -10 / 0 / 10 are clear).
          
          The first pass scattered these across the middle band, which is the
          corridor every route between the two rows runs through — an obstacle
          course between you and every room. Density has to be something you
          meet on the way, not a wall across the way. */}
      <BowlingPins x={-10} z={Z0 + 3} />
      <Dominoes x={4} z={Z0 + 2} />
      <CrateWall x={-10} z={Z1 - 4} />
      <SeeSaw x={10} z={Z1 - 4} />
      <Ramp x={0} z={Z0 + 3} />
      <Ramp x={HALF_W - 4} z={-3} rot={Math.PI / 2} />
      <Balls />
    </>
  );
}
