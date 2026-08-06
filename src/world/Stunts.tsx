import { useMemo, type JSX } from "react";
import { RigidBody } from "@react-three/rapier";
import { TERRAIN } from "./worldData.ts";
import { worldPalette } from "./palette.ts";
import { PROP_COLLISION_GROUPS } from "./collisionGroups.ts";

/**
 * The stunt yard: the things that exist purely to be knocked over.
 *
 * This is the part of the reference site that actually makes it fun, and it is
 * the part a "3D portfolio" usually skips — driving around a pretty scene gets
 * boring in about fifteen seconds, whereas a stack of bowling pins does not.
 * None of it is decoration: every object here is a dynamic Rapier body sized so
 * a toy car at speed sends it somewhere satisfying.
 *
 * Everything is a primitive. The richness comes from arrangement and physics,
 * not from geometry — a domino run is thirty boxes, and it is more memorable
 * than any single hand-modelled prop would be.
 *
 * COLLISION GROUPS ARE NOT OPTIONAL HERE. Every body below carries
 * PROP_COLLISION_GROUPS, which excludes the group the pavilion sensors listen
 * on. Without it a bowling pin that rolls into a room's approach volume raises
 * the "enter this room" prompt, and the one-second dwell then NAVIGATES — the
 * world threw the visitor into /lab about four seconds after load, with no
 * input at all. Pavilions.tsx documents this trap; these bodies walked into it.
 *
 * PLACEMENT RULE: all of it sits off the spawn-to-ramp lanes (Props.tsx's
 * inDrivingLane), on the east side. Somebody who just wants to reach a room
 * should never have to plough through a skittle alley to do it; somebody who
 * wants to play has to steer two seconds off the straight line to find it.
 */

// East side of the mainland, clear of both driving lanes.
const YARD_X = 11;
const YARD_Z = TERRAIN.mainland.z0 + 9;
const GROUND = TERRAIN.mainland.groundY;

/** Ten pins in a triangle, like the real thing. */
function BowlingPins(): JSX.Element {
  const c = worldPalette();
  const pins = useMemo(() => {
    const out: [number, number][] = [];
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        out.push([(i - row / 2) * 0.85, row * 0.8]);
      }
    }
    return out;
  }, []);
  return (
    <>
      {pins.map(([dx, dz], i) => (
        <RigidBody
          key={i}
          colliders="hull"
          position={[YARD_X + dx, GROUND + 0.45, YARD_Z + dz]}
          // Light and tall: the whole point is that they fly. Heavy pins just
          // stop the car, which is the opposite of the intended feeling.
          density={0.25}
          restitution={0.35}
          collisionGroups={PROP_COLLISION_GROUPS}
        >
          <mesh castShadow>
            <capsuleGeometry args={[0.16, 0.42, 4, 10]} />
            <meshStandardMaterial color={c.text} emissive={c.signal} emissiveIntensity={0.25} roughness={0.4} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

/** A domino run that curves away, so knocking the first one is worth doing. */
function Dominoes(): JSX.Element {
  const c = worldPalette();
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const t = i / 25;
        // A gentle arc rather than a straight line: it reads as deliberate, and
        // the far end stays on screen while the near end falls.
        const angle = t * Math.PI * 0.55;
        return {
          x: YARD_X + 3 + Math.sin(angle) * 7,
          z: YARD_Z + 6 + (1 - Math.cos(angle)) * 7,
          rot: angle,
        };
      }),
    [],
  );
  return (
    <>
      {pieces.map((p, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          position={[p.x, GROUND + 0.36, p.z]}
          rotation={[0, p.rot, 0]}
          density={0.4}
          collisionGroups={PROP_COLLISION_GROUPS}
        >
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.72, 0.1]} />
            <meshStandardMaterial
              color={c.card}
              emissive={i % 4 === 0 ? c.probe : c.alt}
              emissiveIntensity={0.5}
              roughness={0.35}
              metalness={0.15}
            />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

/**
 * A quarter-pipe. Built from angled slats rather than a curved mesh: a real
 * curve needs either a custom BufferGeometry or a trimesh collider, and a
 * fifteen-slat approximation drives almost identically for a fraction of the
 * cost — and, unlike a trimesh, it cannot trap the craft in a seam.
 */
function QuarterPipe(): JSX.Element {
  const c = worldPalette();
  const slats = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const t = i / 13;
        const angle = t * (Math.PI / 2.6);
        return {
          y: GROUND + (1 - Math.cos(angle)) * 3.4,
          z: Math.sin(angle) * 3.4,
          rot: -angle,
        };
      }),
    [],
  );
  return (
    <group position={[-YARD_X - 3, 0, YARD_Z + 16]}>
      {slats.map((s, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid" position={[0, s.y, s.z]} rotation={[s.rot, 0, 0]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={[9, 0.35, 0.62]} />
            <meshStandardMaterial
              color={c.surface}
              emissive={c.probe}
              emissiveIntensity={i === slats.length - 1 ? 1.2 : 0.08}
              roughness={0.6}
            />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

/** A stack of crates, because knocking a wall down is the oldest trick there is. */
function CrateWall(): JSX.Element {
  const c = worldPalette();
  const blocks = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let row = 0; row < 5; row++) {
      const n = 5 - row;
      for (let i = 0; i < n; i++) {
        out.push([(i - (n - 1) / 2) * 0.62, GROUND + 0.3 + row * 0.58, 0]);
      }
    }
    return out;
  }, []);
  return (
    <group position={[YARD_X + 4, 0, YARD_Z - 7]}>
      {blocks.map((b, i) => (
        <RigidBody key={i} colliders="cuboid" position={b} density={0.3} collisionGroups={PROP_COLLISION_GROUPS}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.56, 0.54, 0.56]} />
            <meshStandardMaterial color={c.card} emissive={c.warn} emissiveIntensity={0.18} roughness={0.7} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

/** A see-saw plank on a fixed fulcrum — cheap, and it never stops being funny. */
function SeeSaw(): JSX.Element {
  const c = worldPalette();
  return (
    <group position={[-YARD_X - 2, 0, YARD_Z - 2]}>
      <RigidBody type="fixed" colliders="cuboid" position={[0, GROUND + 0.25, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.6, 0.5, 0.5]} />
          <meshStandardMaterial color={c.surface} roughness={0.7} />
        </mesh>
      </RigidBody>
      <RigidBody colliders="cuboid" position={[0, GROUND + 0.62, 0]} density={0.5} collisionGroups={PROP_COLLISION_GROUPS}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.2, 0.16, 7]} />
          <meshStandardMaterial color={c.card} emissive={c.signal} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>
      </RigidBody>
    </group>
  );
}

export function Stunts(): JSX.Element {
  return (
    <>
      <BowlingPins />
      <Dominoes />
      <QuarterPipe />
      <CrateWall />
      <SeeSaw />
    </>
  );
}
