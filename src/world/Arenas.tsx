import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { SPACE_ALTITUDE } from "./craftPhysics.ts";
import { PLACEMENTS } from "./worldData.ts";
import { PROP_COLLISION_GROUPS } from "./collisionGroups.ts";
import { telemetry } from "./telemetry.ts";
import { worldPalette } from "./palette.ts";
import { playPickup } from "./audio.ts";

/**
 * Something to do in each of the other three arenas.
 *
 * The land had a stunt yard and the sea, sky and orbit had nothing — they were
 * corridors you passed through on the way to a room, which is a waste of three
 * quarters of the world. Each gets one mechanic that belongs to it and could
 * not be moved somewhere else:
 *
 *   sea    — buoys that bob and scatter, and a floating ramp that throws a boat
 *            back into the air, which is the only way to leave the water fast
 *   sky    — gates to fly through, the one thing wings are good for
 *   orbit  — a slow debris field, because zero-g is only interesting if there
 *            is something in it to nudge
 *
 * All of it carries PROP_COLLISION_GROUPS: dynamic bodies must never be able to
 * trip a pavilion's approach sensor (see collisionGroups.ts for the four-second
 * auto-navigation bug that taught us).
 */

const SEA_Z = 34;

/** Bobbing marker buoys. Kinematic, so the sea can move them without the
 *  buoyancy model having to hold them up. */
function Buoys(): JSX.Element {
  const c = worldPalette();
  const refs = useRef<(THREE.Group | null)[]>([]);
  const buoys = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        x: -20 + i * 5,
        z: SEA_Z - 5 + (i % 3) * 5,
        phase: i * 0.7,
      })),
    [],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < buoys.length; i++) {
      const g = refs.current[i];
      if (!g) continue;
      // Same two-frequency swell the water shader uses, so the buoys ride the
      // surface they are drawn on instead of floating independently of it.
      g.position.y = Math.sin(t * 0.55 + buoys[i].phase) * 0.14 + Math.sin(t * 0.4) * 0.09;
      g.rotation.z = Math.sin(t * 0.7 + buoys[i].phase) * 0.12;
    }
  });
  return (
    <>
      {buoys.map((b, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[b.x, 0, b.z]}
        >
          <mesh castShadow>
            <coneGeometry args={[0.42, 1.3, 8]} />
            <meshStandardMaterial color={c.warn} emissive={c.warn} emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshStandardMaterial color={c.probe} emissive={c.probe} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * A floating ramp in the strait.
 *
 * The water leg's problem was that once you are in it, you are in it: hull mode
 * tops out at 4 m/s and the only way out is a long sail to a shore. This gives
 * the sea an exit — hit it with any speed and you are launched, which is also
 * the fastest route to the thermals.
 */
function SeaRamp(): JSX.Element {
  const c = worldPalette();
  return (
    <RigidBody type="fixed" colliders="cuboid" position={[-4, 0.4, SEA_Z + 6]} rotation={[-0.42, 0, 0]}>
      <mesh receiveShadow castShadow>
        <boxGeometry args={[7, 0.4, 6]} />
        <meshStandardMaterial color={c.surface} emissive={c.probe} emissiveIntensity={0.5} roughness={0.5} />
      </mesh>
    </RigidBody>
  );
}

/**
 * Gates strung between the sky islands.
 *
 * Flying had no target: you climbed a thermal, landed, and that was the whole
 * of it. A line of rings turns the air into somewhere with a shape — and
 * passing one is detected here, off telemetry, rather than with nine more
 * physics sensors.
 */
function SkyGates(): JSX.Element {
  const c = worldPalette();
  const islands = useMemo(() => PLACEMENTS.filter((p) => p.medium === "air"), []);
  const gates = useMemo(() => {
    if (islands.length < 2) return [];
    const [a, bIsland] = islands;
    return Array.from({ length: 7 }, (_, i) => {
      const t = (i + 1) / 8;
      return {
        x: a.position[0] + (bIsland.position[0] - a.position[0]) * t,
        // Dipping in the middle, so the line of gates is a flight path rather
        // than a fence — you have to descend and climb through it.
        y: a.position[1] - 6 - Math.sin(t * Math.PI) * 7,
        z: a.position[2] + (bIsland.position[2] - a.position[2]) * t,
        passed: false,
      };
    });
  }, [islands]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const mesh = meshes.current[i];
      if (!mesh) continue;
      mesh.rotation.z = state.clock.elapsedTime * 0.4 + i;
      if (g.passed) continue;
      const d = Math.hypot(telemetry.x - g.x, telemetry.y - g.y, telemetry.z - g.z);
      if (d < 3.2) {
        g.passed = true;
        playPickup();
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.15;
        material.opacity = 0.3;
      }
    }
  });

  return (
    <>
      {gates.map((g, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          position={[g.x, g.y, g.z]}
        >
          <torusGeometry args={[3, 0.16, 8, 28]} />
          <meshStandardMaterial
            color={c.alt}
            emissive={c.alt}
            emissiveIntensity={1.1}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </>
  );
}

/** Slow-tumbling debris in orbit — the only thing up there to hit. */
function OrbitDebris(): JSX.Element {
  const c = worldPalette();
  const chunks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return {
          x: Math.cos(a) * (9 + (i % 4) * 4),
          y: SPACE_ALTITUDE + 14 + (i % 5) * 7,
          z: 62 + Math.sin(a) * (9 + (i % 3) * 5),
          size: 0.5 + (i % 3) * 0.35,
        };
      }),
    [],
  );
  return (
    <>
      {chunks.map((ch, i) => (
        <RigidBody
          key={i}
          colliders="cuboid"
          position={[ch.x, ch.y, ch.z]}
          collisionGroups={PROP_COLLISION_GROUPS}
          // Almost weightless and almost frictionless: nudging one should send
          // it drifting away for a long time, which is the entire appeal of
          // bumping into something in vacuum.
          density={0.05}
          linearDamping={0.02}
          angularDamping={0.02}
          gravityScale={0.05}
        >
          <mesh castShadow>
            <icosahedronGeometry args={[ch.size, 0]} />
            <meshStandardMaterial color={c.surface} emissive={c.warn} emissiveIntensity={0.35} roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

export function Arenas(): JSX.Element {
  return (
    <>
      <Buoys />
      <SeaRamp />
      <SkyGates />
      <OrbitDebris />
    </>
  );
}
