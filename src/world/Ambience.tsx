import { useMemo, useRef, type JSX } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TERRAIN } from "./worldData.ts";

/**
 * The things that move when nothing is happening.
 *
 * A world where the only motion is your own car reads as a diorama — you stop
 * driving and it becomes a screenshot. These are the cheapest possible signs of
 * life: dust drifting over the desk, and a slow breathing pulse on the light
 * each room casts. Neither is interactive and neither costs a draw call worth
 * mentioning (the motes are one instanced mesh, the pulse is a uniform write),
 * but between them the scene stops looking paused.
 *
 * Deliberately NOT particles-on-collision, skid marks, or engine smoke: those
 * need emitters, pooling and lifetimes, and this world does not have a
 * performance budget for a particle system it would only use for garnish.
 */

const MOTE_COUNT = 160;

/**
 * Dust over the desk. Each mote drifts on its own slow sine and wraps within a
 * box over the mainland, so there is always something with parallax close to
 * the camera — which is also what makes speed legible at low altitude, the same
 * job the floor grid does at ground level.
 */
export function Motes(): JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: MOTE_COUNT }, () => ({
        // Deterministic-ish spread without Math.random in a module body: index
        // hashing would be tidier, but these are generated once at mount inside
        // a component, where randomness is fine and never re-runs.
        x: (Math.random() - 0.5) * TERRAIN.mainland.halfWidth * 2,
        y: 0.6 + Math.random() * 7,
        z: TERRAIN.mainland.z0 + Math.random() * (TERRAIN.mainland.z1 - TERRAIN.mainland.z0),
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.35,
      })),
    [],
  );

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const drift = Math.sin(t * s.speed + s.phase);
      dummy.position.set(s.x + drift * 1.6, s.y + Math.sin(t * 0.25 + s.phase) * 0.5, s.z + drift * 0.8);
      dummy.scale.setScalar(0.035);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MOTE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial color="#7fe3b0" transparent opacity={0.22} depthWrite={false} />
    </instancedMesh>
  );
}
