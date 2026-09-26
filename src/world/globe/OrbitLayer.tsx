import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { prefersReducedMotion } from "../reducedMotion.ts";
import { GLOBE_RADIUS } from "./EarthDots.tsx";

// S8, ambient (claim: false) - never brand colours, never a claim label; a
// dim point of light, nothing this layer draws opens a panel.
//
// NOT wired to useSatellites/satellite.js (P2-09's shared TLE math), despite
// the task list naming it: satellite.js@7.1.0's WASM package re-exports a
// multi-thread runtime (dist/wasm/runtimes/multi-thread-runtime.js) that
// calls `new Worker(new URL(...))`. Vite 8's rolldown build resolves and
// pre-bundles every statically reachable `new Worker(new URL())` target
// BEFORE tree-shaking runs - so importing anything at all from "satellite.js"
// pulls that file into the build's worker-detection pass regardless of which
// named exports actually survive tree-shaking (satellites.ts's own "eight
// named exports" comment describes the tree-shaken OUTPUT size, not the
// build-time module graph). That worker bundles to Vite's IIFE format, whose
// top-level `await import("node:worker_threads")` fails outright:
// "[UNSUPPORTED_FEATURE] Top-level await is currently not supported with the
// 'iife' output format" - `npm run build` cannot complete while anything
// imports satellite.js. Reproduced against this checkout's real
// `npx vite build`, first triggered by this lane: nothing else in the repo
// calls `useSatellites()` yet (only its own module and a type-only import
// reference it), so the break was latent in P2-09's dependency the moment it
// landed and this is simply the first real caller to hit it. Fixing it needs
// a vite.config.ts change (worker build config, an alias, or an
// optimizeDeps exclusion) - outside this lane's owns - or an upstream
// satellite.js fix; flagged in this lane's handoff rather than silently
// worked around by editing a file this lane does not own.
//
// This draws the same visual idea - a halo of ambient points orbiting the
// globe - from pure, deterministic parametrics instead: no live data, no
// claim, exactly what an ambient stream is allowed to be.
const ORBIT_COUNT = 20;
const ORBIT_RADIUS = GLOBE_RADIUS + 1.4;
const ORBIT_COLOR = new THREE.Color("#c9d4d0");
const DOT_GEOMETRY = new THREE.SphereGeometry(0.03, 6, 6);
const dummy = new THREE.Object3D();

/** Index-derived, never Math.random (the D1 purity discipline every other
 *  pure module in this world follows, even though this ambient layer isn't
 *  itself registered in GRAMMAR or STREAMS). */
function orbitParams(i: number) {
  const DEG = Math.PI / 180;
  return {
    inclination: ((i * 47) % 180) * DEG,
    raan: ((i * 137) % 360) * DEG,
    phase: ((i * 71) % 360) * DEG,
    speed: 0.4 + (i % 5) * 0.08,
  };
}

export function OrbitLayer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const params = useMemo(() => Array.from({ length: ORBIT_COUNT }, (_, i) => orbitParams(i)), []);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = prefersReducedMotion() ? 0 : clock.elapsedTime * 0.05;
    for (let i = 0; i < params.length; i++) {
      const { inclination, raan, phase, speed } = params[i];
      const angle = phase + t * speed;
      const x0 = Math.cos(angle) * ORBIT_RADIUS;
      const y0 = Math.sin(angle) * ORBIT_RADIUS;
      const y1 = y0 * Math.cos(inclination);
      const z1 = y0 * Math.sin(inclination);
      const x2 = x0 * Math.cos(raan) - z1 * Math.sin(raan);
      const z2 = x0 * Math.sin(raan) + z1 * Math.cos(raan);
      dummy.position.set(x2, y1, z2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[DOT_GEOMETRY, undefined, ORBIT_COUNT]} frustumCulled={false}>
      <meshBasicMaterial color={ORBIT_COLOR} toneMapped={false} transparent opacity={0.75} />
    </instancedMesh>
  );
}
