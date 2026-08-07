import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ARTIFACTS } from "./artifacts.ts";
import { worldPalette, mix } from "./palette.ts";

/**
 * The collectibles, in the world.
 *
 * ONE InstancedMesh for the whole family — was one `<mesh>` per artifact,
 * which cost a full draw call each on a boulevard where every other family
 * (props, monuments, corpus pillars) already went through this discipline.
 * Slowly spinning octahedra that bob on their own phase — a shape that reads
 * as "pick me up" from any angle and at any distance, which matters now more
 * than ever: these are scattered the length of a 168m boulevard rather than a
 * ~30m desk, and the player is often moving fast.
 *
 * No physics bodies: they are pure decoration plus a distance check in
 * World.tsx, because eighteen more Rapier sensors would cost real frame time to
 * answer a question `Math.hypot` answers for free.
 *
 * Collected ones do not disappear. They shrink, slow their bob and dim toward
 * the void instead, so a returning visitor can see where they have already
 * been rather than staring at an emptier world than they left — the map
 * should read as filled in, not used up. `held` state is carried entirely by
 * per-instance matrix (scale, bob) and `instanceColor` (dimmed diffuse); an
 * InstancedMesh has no per-instance `emissiveIntensity`/`opacity` without a
 * resolve.ts-style custom shader, which is more machinery than 16
 * collectibles justify — see the comment in the frame loop below.
 */

type Props = { collected: ReadonlySet<string> };

const dummy = new THREE.Object3D();

export function Artifacts({ collected }: Props): JSX.Element {
  const c = worldPalette();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const phases = useMemo(() => ARTIFACTS.map((_, i) => (i * 2.39996) % (Math.PI * 2)), []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    const color = new THREE.Color();
    for (let i = 0; i < ARTIFACTS.length; i++) {
      const a = ARTIFACTS[i];
      const held = collected.has(a.id);
      const phase = phases[i];
      // Held ones settle: no spin, a slow shallow bob, so they read as inert
      // markers rather than things still asking to be chased.
      const y = a.position[1] + Math.sin(t * (held ? 0.6 : 1.5) + phase) * (held ? 0.12 : 0.35);
      dummy.position.set(a.position[0], y, a.position[2]);
      dummy.rotation.set(0, held ? phase : t * 1.1 + phase, 0);
      dummy.scale.setScalar(held ? 0.34 : 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // ponytail: InstancedMesh's per-instance `instanceColor` only scales
      // the material's diffuse channel, not its separate emissive one, so a
      // held artifact's glow doesn't fully mute the way the old per-mesh
      // emissiveIntensity did — scale + this dim is close enough for 16
      // collectibles; upgrade to a resolve.ts-style onBeforeCompile hook if
      // that gap ever becomes visible in practice.
      color.set(held ? mix(c.signal, c.void, 0.6) : c.signal);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, ARTIFACTS.length]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={c.signal}
        emissive={c.signal}
        // Sits well above the bloom threshold (0.9) so an uncollected
        // artifact glows and carries at distance. 1.6 with 16 of these on
        // screen washed the whole frame green through the bloom pass —
        // individually correct, collectively a fog machine. Bloom is a
        // scene-wide budget, not a per-object setting, and this is the most
        // numerous emissive in the world.
        emissiveIntensity={0.85}
        transparent
        opacity={0.95}
        roughness={0.3}
      />
    </instancedMesh>
  );
}
