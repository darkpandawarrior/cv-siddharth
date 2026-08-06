import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ARTIFACTS } from "./artifacts.ts";
import { worldPalette } from "./palette.ts";

/**
 * The collectibles, in the world.
 *
 * Rendered as slowly spinning octahedra that bob on their own phase — a shape
 * that reads as "pick me up" from any angle and at any distance, which matters
 * because these are scattered over a ~100m map and the player is often moving
 * fast. No physics bodies: they are pure decoration plus a distance check in
 * World.tsx, because eighteen more Rapier sensors would cost real frame time to
 * answer a question `Math.hypot` answers for free.
 *
 * Collected ones do not disappear. They dim and stop spinning instead, so a
 * returning visitor can see where they have already been rather than staring at
 * an emptier world than they left — the map should read as filled in, not used
 * up.
 */

type Props = { collected: ReadonlySet<string> };

export function Artifacts({ collected }: Props): JSX.Element {
  const c = worldPalette();
  const group = useRef<THREE.Group>(null);
  const phases = useMemo(() => ARTIFACTS.map((_, i) => (i * 2.39996) % (Math.PI * 2)), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < g.children.length; i++) {
      const child = g.children[i];
      const isHeld = child.userData.held === true;
      // Held ones settle: no spin, a slow shallow bob, so they read as inert
      // markers rather than things still asking to be chased.
      child.rotation.y = isHeld ? child.rotation.y : t * 1.1 + phases[i];
      child.position.y = child.userData.baseY + Math.sin(t * (isHeld ? 0.6 : 1.5) + phases[i]) * (isHeld ? 0.12 : 0.35);
    }
  });

  return (
    <group ref={group}>
      {ARTIFACTS.map((a) => {
        const held = collected.has(a.id);
        const tint = c.signal;
        return (
          <mesh
            key={a.id}
            position={a.position}
            userData={{ baseY: a.position[1], held }}
            scale={held ? 0.34 : 0.5}
          >
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial
              color={tint}
              emissive={tint}
              // Uncollected ones sit well above the bloom threshold (0.9) so
              // they glow and carry at distance; collected ones drop below it
              // and become quiet geometry.
              // 1.6 with 16 of these on screen washed the whole frame green
              // through the bloom pass — individually correct, collectively a
              // fog machine. Bloom is a scene-wide budget, not a per-object
              // setting, and this is the most numerous emissive in the world.
              emissiveIntensity={held ? 0.2 : 0.85}
              transparent
              opacity={held ? 0.4 : 0.95}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}
