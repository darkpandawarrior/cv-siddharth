import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldPalette } from "./palette.ts";

/**
 * The sea's furniture: bobbing marker buoys.
 *
 * This file once held a launch ramp, a line of sky gates and an orbital debris
 * field as well — one mechanic per arena. The arenas they belonged to are gone
 * with the flight and orbit modes, and the buoys are what survives, because
 * they are the only part that was doing a navigational job rather than adding
 * a thing to do: open water with nothing in it gives a sailing craft no sense
 * of movement at all.
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




export function Arenas(): JSX.Element {
  return <Buoys />;
}
